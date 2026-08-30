import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, posix, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  AdoptionCandidateSource,
  AdoptionEvidenceSource,
  AdoptionSourceBlob,
} from "../../domain/adoption-candidate.ts";
import {
  ADOPTION_ROUTE_LOCK_PATH,
  ADOPTION_VERIFICATION_SUMMARY_PATH,
} from "../../domain/adoption-candidate.ts";
import { digestJson, type Sha256Digest } from "../../domain/content-digest.ts";
import { assertNoSensitiveContent } from "../../domain/sensitive-fields.ts";

export type AdoptionInspectSourceErrorCode =
  | "INVALID_PROJECT_ROOT"
  | "REF_PAIR_INCOMPLETE"
  | "ADOPTION_SOURCE_CONFLICT"
  | "ADOPTION_CANDIDATE_STALE";

export class AdoptionInspectSourceError extends Error {
  readonly code: AdoptionInspectSourceErrorCode;
  readonly missing_refs: readonly string[];

  constructor(code: AdoptionInspectSourceErrorCode, missingRefs: readonly string[] = []) {
    super("Adoption inspect source rejected");
    this.code = code;
    this.missing_refs = Object.freeze([...missingRefs].sort());
  }
}

export interface AdoptionInspectOptions {
  readonly projectRoot: string;
  readonly routeLockPath: string;
  readonly activePlanPath: string;
  readonly evidencePaths: readonly string[];
}

export interface AdoptionInspectClock {
  readonly now: () => Date;
}

export interface AdoptionInspectRecheckHook {
  readonly beforeRecheck: () => Promise<void>;
}

const runFile = promisify(execFile);
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const gitEnvironment = Object.freeze({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
});

async function git(root: string, args: readonly string[]): Promise<string> {
  try {
    const result = await runFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: gitEnvironment,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000,
    });
    return result.stdout;
  } catch {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
}

async function gitBytes(root: string, args: readonly string[]): Promise<Buffer> {
  try {
    const result = await runFile("git", ["-C", root, ...args], {
      env: gitEnvironment,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000,
    });
    return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
  } catch {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
}

async function gitExit(root: string, args: readonly string[]): Promise<number> {
  try {
    await runFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: gitEnvironment,
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    return 0;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "number") {
      return error.code;
    }
    return -1;
  }
}

function sha256(bytes: Uint8Array | string): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeRelativePath(value: string): string {
  if (
    value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value) || value.includes("\\") ||
    isAbsolute(value) || value !== value.normalize("NFC") || posix.normalize(value) !== value ||
    value === "." || value.split("/").includes("..")
  ) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  return value;
}

function assertUniquePaths(paths: readonly string[]): void {
  const normalized = paths.map((path) => path.normalize("NFC").toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== paths.length) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
}

interface NamespaceSnapshot {
  readonly status: "PROJECT_NOT_ADOPTED";
  readonly digest: Sha256Digest;
}

async function namespaceSnapshot(root: string): Promise<NamespaceSnapshot> {
  const output = await git(root, [
    "for-each-ref", "--format=%(refname) %(objectname)", "refs/nextstep/",
  ]);
  const refs = output.trim().split("\n").filter(Boolean).sort();
  if (refs.length === 0) {
    return { status: "PROJECT_NOT_ADOPTED", digest: digestJson([]) };
  }
  const names = refs.map((entry) => entry.slice(0, entry.indexOf(" ")));
  const allowed = new Set(["refs/nextstep/formal", "refs/nextstep/control"]);
  const hasFormal = names.includes("refs/nextstep/formal");
  const hasControl = names.includes("refs/nextstep/control");
  if (refs.length === 1 && names.every((name) => allowed.has(name)) && hasFormal !== hasControl) {
    throw new AdoptionInspectSourceError(
      "REF_PAIR_INCOMPLETE",
      [hasFormal ? "refs/nextstep/control" : "refs/nextstep/formal"],
    );
  }
  throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
}

interface RawBlob extends AdoptionSourceBlob {
  readonly text_digest: Sha256Digest;
}

async function headBlob(root: string, head: string, path: string): Promise<RawBlob> {
  const treeLine = (await git(root, ["ls-tree", head, "--", path])).trim();
  if (treeLine.length === 0) {
    await gitExit(root, ["check-ignore", "--no-index", "--quiet", "--", path]);
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const match = /^(\d{6}) (blob) ([a-f0-9]{40,64})\t(.+)$/.exec(treeLine);
  if (!match || match[1] === "120000" || match[4] !== path || !OID.test(match[3] ?? "")) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const blobOid = match[3] as string;
  const bytes = await gitBytes(root, ["cat-file", "blob", blobOid]);
  try {
    assertNoSensitiveContent(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const digest = sha256(bytes);
  return Object.freeze({ path, blob_oid: blobOid, digest, text_digest: digest });
}

interface StableSnapshot {
  readonly repository_identity: Sha256Digest;
  readonly object_format: "sha1" | "sha256";
  readonly head: string;
  readonly route_lock: RawBlob;
  readonly active_plan: RawBlob;
  readonly evidence_sources: readonly (RawBlob & { readonly classification: "unknown" })[];
  readonly worktree_projection_digest: Sha256Digest;
  readonly namespace: NamespaceSnapshot;
}

async function stableSnapshot(root: string, paths: readonly string[]): Promise<StableSnapshot> {
  const [topLevelRaw, commonDirRaw, objectFormatRaw, headRaw, statusRaw, worktreeRaw] = await Promise.all([
    git(root, ["rev-parse", "--show-toplevel"]),
    git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    git(root, ["rev-parse", "--show-object-format"]),
    git(root, ["rev-parse", "--verify", "HEAD^{commit}"]),
    git(root, ["status", "--porcelain=v2", "--untracked-files=all"]),
    git(root, ["worktree", "list", "--porcelain"]),
  ]);
  const topLevel = await realpath(topLevelRaw.trim());
  if (topLevel !== root || statusRaw.length !== 0) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const objectFormat = objectFormatRaw.trim();
  const head = headRaw.trim();
  if ((objectFormat !== "sha1" && objectFormat !== "sha256") || !OID.test(head)) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const worktrees = worktreeRaw.split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  if (worktrees.length !== 1 || await realpath(worktrees[0] as string) !== root) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const namespace = await namespaceSnapshot(root);
  const blobs = await Promise.all(paths.map((path) => headBlob(root, head, path)));
  const commonDir = await realpath(commonDirRaw.trim());
  const repositoryIdentity = digestJson({
    common_dir_identity: sha256(commonDir),
    object_format: objectFormat,
    project_root_identity: sha256(root),
  });
  const worktreeProjectionDigest = digestJson({
    candidate_head_oid: head,
    index_and_worktree: "clean",
    worktree_count: 1,
    worktree_identity: sha256(root),
  });
  const [routeLock, activePlan, ...evidence] = blobs;
  if (!routeLock || !activePlan) throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  return Object.freeze({
    repository_identity: repositoryIdentity,
    object_format: objectFormat,
    head,
    route_lock: routeLock,
    active_plan: activePlan,
    evidence_sources: Object.freeze(evidence.map((blob) => Object.freeze({
      ...blob,
      classification: "unknown" as const,
    }))),
    worktree_projection_digest: worktreeProjectionDigest,
    namespace,
  });
}

function stableDigest(snapshot: StableSnapshot): Sha256Digest {
  return digestJson(snapshot);
}

export async function readAdoptionInspectSource(
  options: AdoptionInspectOptions,
  clock: AdoptionInspectClock = { now: () => new Date() },
  recheckHook?: AdoptionInspectRecheckHook,
): Promise<AdoptionCandidateSource> {
  if (!isAbsolute(options.projectRoot) || options.projectRoot.includes("\0")) {
    throw new AdoptionInspectSourceError("INVALID_PROJECT_ROOT");
  }
  let root: string;
  try {
    root = await realpath(resolve(options.projectRoot));
  } catch {
    throw new AdoptionInspectSourceError("INVALID_PROJECT_ROOT");
  }
  const paths = [options.routeLockPath, options.activePlanPath, ...options.evidencePaths]
    .map(safeRelativePath);
  if (
    options.routeLockPath !== ADOPTION_ROUTE_LOCK_PATH ||
    !/^docs\/exec-plans\/active\/[a-z0-9][a-z0-9._-]*\.md$/.test(options.activePlanPath) ||
    options.evidencePaths.length !== 1 ||
    options.evidencePaths[0] !== ADOPTION_VERIFICATION_SUMMARY_PATH
  ) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  assertUniquePaths(paths);

  const observedAt = clock.now();
  if (!Number.isFinite(observedAt.getTime())) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  const first = await stableSnapshot(root, paths);
  await recheckHook?.beforeRecheck();
  let second: StableSnapshot;
  try {
    second = await stableSnapshot(root, paths);
  } catch {
    throw new AdoptionInspectSourceError("ADOPTION_CANDIDATE_STALE");
  }
  if (stableDigest(first) !== stableDigest(second)) {
    throw new AdoptionInspectSourceError("ADOPTION_CANDIDATE_STALE");
  }
  const expiresAt = new Date(observedAt.getTime() + 15 * 60 * 1_000);
  const cleanBlob = ({ text_digest: _ignored, ...blob }: RawBlob): AdoptionSourceBlob => Object.freeze(blob);
  return Object.freeze({
    namespace_status: first.namespace.status,
    repository_identity: first.repository_identity,
    object_format: first.object_format,
    candidate_head_oid: first.head,
    route_lock: cleanBlob(first.route_lock),
    active_plan: cleanBlob(first.active_plan),
    evidence_sources: Object.freeze(first.evidence_sources.map(({ classification, ...blob }) => Object.freeze({
      ...cleanBlob(blob), classification,
    } as AdoptionEvidenceSource))),
    worktree_projection_digest: first.worktree_projection_digest,
    nextstep_namespace_digest: first.namespace.digest,
    created_at_trusted: observedAt.toISOString(),
    expires_at_trusted: expiresAt.toISOString(),
  });
}
