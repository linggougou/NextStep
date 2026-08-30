import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import type { ProjectStatusSource } from "../../domain/project-status-projection.ts";

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
  const ancestry = (await git(projectRoot, ["rev-list", "--parents", "-n", "1", first.control])).trim().split(/\s+/);
  if ([ancestry.length === 2, ancestry[0] === first.control, OID.test(ancestry[1] ?? "")].includes(false)) {
    throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
  }
  const controlParent = ancestry[1] as string;
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
    const baselineBlob = (await gitOptional(projectRoot, ["rev-parse", `${first.control}:adopted-baseline.json`]))?.trim();
    if (baselineBlob !== undefined && OID.test(baselineBlob)) {
      adoptedBaselineBlob = baselineBlob;
      adoptedBaseline = JSON.parse(await git(projectRoot, ["cat-file", "blob", baselineBlob])) as unknown;
      const genesis = (await git(projectRoot, ["rev-list", "--parents", "-n", "1", controlParent])).trim().split(/\s+/);
      if (genesis.length !== 1 || genesis[0] !== controlParent) throw new ProjectStatusSourceError("INVALID_CONTROL_COMMIT");
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
