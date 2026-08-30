import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import type { ProjectStatusSource } from "../../domain/project-status-projection.ts";
import { parseAdoptionActivation } from "../../domain/adoption-activation.ts";
import { parseAdoptedBaseline } from "../../domain/adopted-baseline.ts";
import { canonicalizeJson } from "../../domain/canonical-json.ts";

export type ProjectStatusSourceErrorCode =
  | "INVALID_PROJECT_ROOT"
  | "PROJECT_NOT_ADOPTED"
  | "REF_PAIR_INCOMPLETE"
  | "ADOPTION_SOURCE_CONFLICT"
  | "SOURCE_UNAVAILABLE"
  | "INVALID_CONTROL_COMMIT"
  | "SOURCE_CHANGED";

export class ProjectStatusSourceError extends Error {
  readonly code: ProjectStatusSourceErrorCode;

  constructor(code: ProjectStatusSourceErrorCode) {
    super(code);
    this.code = code;
  }
}

const runFile = promisify(execFile);
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const gitEnvironment = Object.freeze({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_OPTIONAL_LOCKS: "0",
});

async function git(root: string, args: readonly string[]): Promise<string> {
  try {
    const result = await runFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: gitEnvironment,
      maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout;
  } catch {
    throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  }
}

interface RefPair { readonly formal: string; readonly control: string }
interface RawCommit { readonly tree: string; readonly parents: readonly string[] }
interface RawTreeEntry { readonly mode: string; readonly type: string; readonly oid: string; readonly name: string }

async function rawCommit(root: string, oid: string): Promise<RawCommit> {
  if (!OID.test(oid)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  const text = await git(root, ["cat-file", "commit", oid]);
  const headerEnd = text.indexOf("\n\n");
  if (headerEnd < 0) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  let tree: string | undefined;
  const parents: string[] = [];
  for (const line of text.slice(0, headerEnd).split("\n")) {
    if (line.startsWith(" ")) continue;
    const separator = line.indexOf(" ");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (separator < 1) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    if (key === "tree") {
      if (tree !== undefined || !OID.test(value)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      tree = value;
    } else if (key === "parent") {
      if (!OID.test(value)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      parents.push(value);
    }
  }
  if (tree === undefined) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  return Object.freeze({ tree, parents: Object.freeze(parents) });
}

async function rawTree(root: string, treeOid: string): Promise<readonly RawTreeEntry[]> {
  if (!OID.test(treeOid)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  const entries = (await git(root, ["ls-tree", "-z", treeOid])).split("\0").filter(Boolean).map((record) => {
    const match = /^([0-7]{6}) ([^ ]+) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(record);
    if (!match) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    return Object.freeze({ mode: match[1] as string, type: match[2] as string, oid: match[3] as string, name: match[4] as string });
  });
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  return Object.freeze(entries);
}

function blobEntry(entries: readonly RawTreeEntry[], name: string): RawTreeEntry | undefined {
  const entry = entries.find((value) => value.name === name);
  if (entry !== undefined && (entry.mode !== "100644" || entry.type !== "blob")) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  return entry;
}

function assertExactBlobTree(entries: readonly RawTreeEntry[], names: readonly string[]): void {
  if (
    entries.length !== names.length ||
    entries.some((entry) => entry.mode !== "100644" || entry.type !== "blob") ||
    entries.map((entry) => entry.name).sort().join("\n") !== [...names].sort().join("\n")
  ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
}

async function canonicalJsonBlob(root: string, oid: string): Promise<unknown> {
  try {
    const text = await git(root, ["cat-file", "blob", oid]);
    const value = JSON.parse(text) as unknown;
    if (canonicalizeJson(value) !== text) throw new Error("non-canonical");
    return value;
  } catch { throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT"); }
}

async function adoptionAnchor(root: string, control: string, formal: string): Promise<{
  readonly baselineBlob: string;
  readonly baseline: unknown;
} | null> {
  let hasAdoptionMarker = false;
  let cursor = control;
  let markerBlobs: { activation: string; baseline: string; genesis: string } | null = null;
  const observedGenesisBlobs = new Set<string>();
  let anchorCount = 0;
  let baselineValue: unknown;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cursor)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    seen.add(cursor);
    const commit = await rawCommit(root, cursor);
    const parents = commit.parents;
    if (parents.length > 1) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    const entries = await rawTree(root, commit.tree);
    const activationEntry = blobEntry(entries, "activation.json");
    const baselineEntry = blobEntry(entries, "adopted-baseline.json");
    const genesisEntry = blobEntry(entries, "genesis.json");
    if (activationEntry !== undefined || baselineEntry !== undefined || genesisEntry !== undefined) hasAdoptionMarker = true;
    if (genesisEntry !== undefined) observedGenesisBlobs.add(genesisEntry.oid);
    if ((activationEntry === undefined) !== (baselineEntry === undefined)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    if (activationEntry !== undefined && baselineEntry !== undefined) {
      let activation;
      let baseline;
      try {
        activation = parseAdoptionActivation(await canonicalJsonBlob(root, activationEntry.oid));
        baseline = parseAdoptedBaseline(await canonicalJsonBlob(root, baselineEntry.oid));
      } catch { throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT"); }
      if (
        activation.baseline_oid !== formal || baseline.baseline_oid !== formal ||
        activation.repository_identity !== baseline.repository_identity ||
        activation.candidate_digest !== baseline.candidate_digest ||
        activation.confirmation_envelope_digest !== baseline.confirmation_envelope_digest
      ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      const genesisCommit = await rawCommit(root, activation.genesis_oid);
      const genesisEntries = await rawTree(root, genesisCommit.tree);
      assertExactBlobTree(genesisEntries, ["genesis.json"]);
      if (genesisCommit.parents.length !== 0) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      const actualGenesisBlob = blobEntry(genesisEntries, "genesis.json")?.oid;
      if (actualGenesisBlob === undefined) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      const next = { activation: activationEntry.oid, baseline: baselineEntry.oid, genesis: actualGenesisBlob };
      if (markerBlobs !== null && Object.keys(next).some((key) => next[key as keyof typeof next] !== markerBlobs?.[key as keyof typeof next])) {
        throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      }
      markerBlobs = next;
      baselineValue = baseline;
      if (parents.length === 1 && parents[0] === activation.genesis_oid) {
        assertExactBlobTree(entries, ["activation.json", "adopted-baseline.json", "checkpoint.json", "registry.json"]);
        const checkpoint = await canonicalJsonBlob(root, blobEntry(entries, "checkpoint.json")?.oid as string);
        const registry = await canonicalJsonBlob(root, blobEntry(entries, "registry.json")?.oid as string);
        const expectedCheckpoint = {
          schema_version: "1.0", repository_id: activation.repository_identity, route_generation: 1,
          plan_id: "adopted-existing-project", plan_generation: 0,
          formal_ref: "refs/nextstep/formal", formal_oid: formal, control_parent_oid: activation.genesis_oid,
          highest_task_attempts: {},
          next_stage: `adopted baseline ${baseline.projected_stage} ${baseline.projected_milestone}; review unknown gates before creating any execution task`,
          updated_at: activation.activated_at_trusted, adoption_state: "rollback-eligible",
        };
        const expectedRegistry = {
          schema_version: "1.0", repository_id: activation.repository_identity, route_generation: 1,
          plan_id: "adopted-existing-project", plan_generation: 0, tasks: [],
        };
        if (
          canonicalizeJson(checkpoint) !== canonicalizeJson(expectedCheckpoint) ||
          canonicalizeJson(registry) !== canonicalizeJson(expectedRegistry)
        ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
        anchorCount += 1;
      }
    }
    if (genesisEntry !== undefined && markerBlobs !== null && genesisEntry.oid !== markerBlobs.genesis) {
      throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    }
    if (parents.length === 0) break;
    cursor = parents[0] as string;
  }
  if (!hasAdoptionMarker) return null;
  if (markerBlobs === null) return null;
  if (
    anchorCount !== 1 || baselineValue === undefined || observedGenesisBlobs.size !== 1 ||
    !observedGenesisBlobs.has(markerBlobs.genesis)
  ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  const activation = parseAdoptionActivation(await canonicalJsonBlob(root, markerBlobs.activation));
  let genesis: unknown;
  try { genesis = await canonicalJsonBlob(root, markerBlobs.genesis); }
  catch { throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT"); }
  if (
    typeof genesis !== "object" || genesis === null ||
    Object.keys(genesis).sort().join("|") !== "candidate_digest|created_at_trusted|kind|repository_identity|schema_version" ||
    (genesis as Record<string, unknown>).schema_version !== "1.0" ||
    (genesis as Record<string, unknown>).kind !== "adoption-control-genesis" ||
    (genesis as Record<string, unknown>).repository_identity !== activation.repository_identity ||
    (genesis as Record<string, unknown>).candidate_digest !== activation.candidate_digest ||
    (genesis as Record<string, unknown>).created_at_trusted !== activation.activated_at_trusted
  ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  return { baselineBlob: markerBlobs.baseline, baseline: baselineValue };
}

async function readRefPair(root: string): Promise<RefPair> {
  const output = await git(root, [
    "for-each-ref", "--format=%(refname) %(objectname)", "refs/nextstep/",
  ]);
  const refs = new Map(output.trim().split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf(" ");
    return [line.slice(0, separator), line.slice(separator + 1)] as const;
  }));
  const formal = refs.get("refs/nextstep/formal");
  const control = refs.get("refs/nextstep/control");
  if (refs.size === 0) throw new ProjectStatusSourceError("PROJECT_NOT_ADOPTED");
  if (refs.size === 1 && ((formal === undefined) !== (control === undefined))) throw new ProjectStatusSourceError("REF_PAIR_INCOMPLETE");
  if ([formal !== undefined, control !== undefined, refs.size === 2].includes(false)) throw new ProjectStatusSourceError("ADOPTION_SOURCE_CONFLICT");
  if (!OID.test(formal ?? "") || !OID.test(control ?? "")) throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  return { formal: formal as string, control: control as string };
}

export async function readProjectStatusSource(
  projectRoot: string,
  observedAt: Date = new Date(),
): Promise<ProjectStatusSource> {
  if ([isAbsolute(projectRoot), !projectRoot.includes("\0"), Number.isFinite(observedAt.getTime())].includes(false)) {
    throw new ProjectStatusSourceError("INVALID_PROJECT_ROOT");
  }
  const first = await readRefPair(projectRoot);
  if ((await git(projectRoot, ["cat-file", "-t", first.formal])).trim() !== "commit") {
    throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  }
  const directControl = await rawCommit(projectRoot, first.control);
  if (directControl.parents.length !== 1) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  const controlParent = directControl.parents[0] as string;
  const currentEntries = await rawTree(projectRoot, directControl.tree);
  const checkpointEntry = blobEntry(currentEntries, "checkpoint.json");
  const registryEntry = blobEntry(currentEntries, "registry.json");
  if (checkpointEntry === undefined || registryEntry === undefined) {
    throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  }
  const checkpointBlob = checkpointEntry.oid;
  const registryBlob = registryEntry.oid;
  let checkpoint: unknown;
  let registry: unknown;
  let adoptedBaseline: unknown;
  let adoptedBaselineBlob: string | undefined;
  try {
    checkpoint = JSON.parse(await git(projectRoot, ["cat-file", "blob", checkpointBlob])) as unknown;
    registry = JSON.parse(await git(projectRoot, ["cat-file", "blob", registryBlob])) as unknown;
    const anchor = await adoptionAnchor(projectRoot, first.control, first.formal);
    if (anchor !== null) {
      adoptedBaselineBlob = anchor.baselineBlob;
      adoptedBaseline = anchor.baseline;
    }
  } catch (error) {
    if (error instanceof ProjectStatusSourceError) throw error;
    throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  }
  const second = await readRefPair(projectRoot);
  if ([second.formal === first.formal, second.control === first.control].includes(false)) {
    throw new ProjectStatusSourceError("SOURCE_CHANGED");
  }
  return Object.freeze({
    schema_version: "1.0",
    observed_at: observedAt.toISOString(),
    formal_oid: first.formal,
    control_oid: first.control,
    control_parent_oid: controlParent,
    checkpoint_blob_oid: checkpointBlob,
    registry_blob_oid: registryBlob,
    checkpoint,
    registry,
    source_kind: adoptedBaselineBlob === undefined ? "native" : "adopted-baseline",
    ...(adoptedBaselineBlob === undefined ? {} : {
      adopted_baseline_blob_oid: adoptedBaselineBlob,
      adopted_baseline: adoptedBaseline,
    }),
  });
}
