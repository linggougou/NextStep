import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import type { ProjectStatusSource } from "../../domain/project-status-projection.ts";
import { parseAdoptionActivation } from "../../domain/adoption-activation.ts";
import { parseAdoptedBaseline } from "../../domain/adopted-baseline.ts";

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

async function gitOptional(root: string, args: readonly string[]): Promise<string | null> {
  try {
    const result = await runFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: gitEnvironment,
      maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout;
  } catch {
    return null;
  }
}

interface RefPair { readonly formal: string; readonly control: string }

async function commitParents(root: string, oid: string): Promise<readonly string[]> {
  const ancestry = (await git(root, ["rev-list", "--parents", "-n", "1", oid])).trim().split(/\s+/);
  if (ancestry[0] !== oid || ancestry.slice(1).some((parent) => !OID.test(parent))) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  return ancestry.slice(1);
}

async function treeBlob(root: string, commit: string, path: string): Promise<string | null> {
  const value = (await gitOptional(root, ["rev-parse", `${commit}:${path}`]))?.trim() ?? null;
  return value !== null && OID.test(value) ? value : null;
}

async function adoptionAnchor(root: string, control: string, formal: string): Promise<{
  readonly baselineBlob: string;
  readonly baseline: unknown;
} | null> {
  const revisions = (await git(root, ["rev-list", control])).trim().split("\n").filter(Boolean);
  let hasAdoptionMarker = false;
  for (const revision of revisions) {
    if (
      await treeBlob(root, revision, "activation.json") !== null ||
      await treeBlob(root, revision, "adopted-baseline.json") !== null ||
      await treeBlob(root, revision, "genesis.json") !== null
    ) { hasAdoptionMarker = true; break; }
  }
  if (!hasAdoptionMarker) return null;
  let cursor = control;
  let markerBlobs: { activation: string; baseline: string; genesis: string } | null = null;
  const observedGenesisBlobs = new Set<string>();
  let anchorCount = 0;
  let baselineValue: unknown;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cursor)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    seen.add(cursor);
    const parents = await commitParents(root, cursor);
    if (parents.length > 1) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    const activationBlob = await treeBlob(root, cursor, "activation.json");
    const baselineBlob = await treeBlob(root, cursor, "adopted-baseline.json");
    const genesisBlob = await treeBlob(root, cursor, "genesis.json");
    if (genesisBlob !== null) observedGenesisBlobs.add(genesisBlob);
    if ((activationBlob === null) !== (baselineBlob === null)) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    if (activationBlob !== null && baselineBlob !== null) {
      let activation;
      let baseline;
      try {
        activation = parseAdoptionActivation(JSON.parse(await git(root, ["cat-file", "blob", activationBlob])));
        baseline = parseAdoptedBaseline(JSON.parse(await git(root, ["cat-file", "blob", baselineBlob])));
      } catch { throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT"); }
      if (
        activation.baseline_oid !== formal || baseline.baseline_oid !== formal ||
        activation.repository_identity !== baseline.repository_identity ||
        activation.candidate_digest !== baseline.candidate_digest ||
        activation.confirmation_envelope_digest !== baseline.confirmation_envelope_digest
      ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      const actualGenesisBlob = await treeBlob(root, activation.genesis_oid, "genesis.json");
      if (actualGenesisBlob === null) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      const next = { activation: activationBlob, baseline: baselineBlob, genesis: actualGenesisBlob };
      if (markerBlobs !== null && Object.keys(next).some((key) => next[key as keyof typeof next] !== markerBlobs?.[key as keyof typeof next])) {
        throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
      }
      markerBlobs = next;
      baselineValue = baseline;
      if (parents.length === 1 && parents[0] === activation.genesis_oid) anchorCount += 1;
    }
    if (genesisBlob !== null && markerBlobs !== null && genesisBlob !== markerBlobs.genesis) {
      throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
    }
    if (parents.length === 0) break;
    cursor = parents[0] as string;
  }
  if (markerBlobs === null) return null;
  if (
    anchorCount !== 1 || baselineValue === undefined || observedGenesisBlobs.size !== 1 ||
    !observedGenesisBlobs.has(markerBlobs.genesis)
  ) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  const activation = parseAdoptionActivation(JSON.parse(await git(root, ["cat-file", "blob", markerBlobs.activation])));
  if ((await commitParents(root, activation.genesis_oid)).length !== 0) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  let genesis: unknown;
  try { genesis = JSON.parse(await git(root, ["cat-file", "blob", markerBlobs.genesis])); }
  catch { throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT"); }
  if (
    typeof genesis !== "object" || genesis === null ||
    (genesis as Record<string, unknown>).kind !== "adoption-control-genesis" ||
    (genesis as Record<string, unknown>).repository_identity !== activation.repository_identity ||
    (genesis as Record<string, unknown>).candidate_digest !== activation.candidate_digest
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
  const directParents = await commitParents(projectRoot, first.control);
  if (directParents.length !== 1) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  const controlParent = directParents[0] as string;
  const checkpointBlob = (await git(projectRoot, ["rev-parse", `${first.control}:checkpoint.json`])).trim();
  const registryBlob = (await git(projectRoot, ["rev-parse", `${first.control}:registry.json`])).trim();
  if ([OID.test(checkpointBlob), OID.test(registryBlob)].includes(false)) {
    throw new ProjectStatusSourceError("SOURCE_UNAVAILABLE");
  }
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
