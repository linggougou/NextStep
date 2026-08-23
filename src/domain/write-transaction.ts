import { createHash } from "node:crypto";

import { Ajv, type ValidateFunction } from "ajv";

import writeTransactionSchema from "../../schemas/v1/write-transaction.schema.json" with { type: "json" };
import { canonicalizeJson } from "./canonical-json.ts";
import {
  ConfirmationNodeError,
  assertWriteConfirmationFresh,
  assertWriteConfirmationViewMatchesTargets,
  parseWriteConfirmationEnvelope,
  type WriteConfirmationEnvelope,
  type WriteConfirmationViewTarget,
} from "./confirmation-node.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export const WRITE_TRANSACTION_CODES = [
  "WRITE_COMMITTED",
  "WRITE_PREVIEWED",
  "WRITE_CONFLICT_REJECTED",
  "WRITE_PARTIAL_BLOCKED",
  "WRITE_ACCESS_BLOCKED",
  "WRITE_CONFIRMATION_REJECTED",
] as const;

export type WriteTransactionCode = (typeof WRITE_TRANSACTION_CODES)[number];

export type WriteTransactionErrorCode =
  | "INVALID_WRITE_PLAN"
  | "WRITE_PLAN_MISMATCH"
  | "WRITE_CONFLICT_REJECTED"
  | "WRITE_ACCESS_BLOCKED"
  | "SENSITIVE_CONTENT_DETECTED";

export class WriteTransactionError extends Error {
  readonly code: WriteTransactionErrorCode;

  constructor(code: WriteTransactionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface WriteTargetSpec {
  readonly path: string;
  readonly mode: "create" | "update";
  readonly before_digest: Sha256Digest | null;
  readonly after_digest: Sha256Digest;
  readonly content: string;
}

export interface WritePlan {
  readonly schema_version: "1.0";
  readonly record_type: "write-plan";
  readonly plan_id: string;
  readonly project: { readonly repository_id: Sha256Digest };
  readonly project_context_digest: Sha256Digest;
  readonly candidate_change_digest: Sha256Digest;
  readonly formal_baseline: string;
  readonly working_baseline_digest: Sha256Digest;
  readonly targets: readonly WriteTargetSpec[];
  readonly created_at: string;
}

export interface WriteTargetProbe {
  readonly exists: boolean;
  readonly kind: "file" | "directory" | "symlink" | "other" | "missing";
  readonly symlink: boolean;
  readonly readable: boolean;
  readonly writable: boolean;
}

export type WriteMutationGuard =
  | {
      readonly mode: "create";
      readonly before_digest: null;
    }
  | {
      readonly mode: "update";
      readonly before_digest: Sha256Digest;
    };

export interface WriteFileSystemPort {
  probe(relativePath: string): Promise<WriteTargetProbe>;
  readContent(relativePath: string): Promise<Uint8Array>;
  atomicWrite(relativePath: string, content: Uint8Array, guard?: WriteMutationGuard): Promise<void>;
  removeCreated(relativePath: string): Promise<void>;
}

export type WriteTargetResultStatus =
  | "previewed"
  | "verified"
  | "conflict"
  | "access-blocked"
  | "error"
  | "rolled-back"
  | "rollback-blocked"
  | "skipped";

export interface WriteTargetResult {
  readonly path: string;
  readonly mode: "create" | "update";
  readonly status: WriteTargetResultStatus;
  readonly before_digest: Sha256Digest | null;
  readonly after_digest: Sha256Digest;
  readonly detail?: string;
}

export type WriteTransactionStatus = "committed" | "previewed" | "rejected" | "blocked";

export interface WriteTransactionResult {
  readonly schema_version: "1.0";
  readonly record_type: "write-transaction-result";
  readonly transaction_id: string;
  readonly plan_digest: Sha256Digest;
  readonly confirmation_envelope_digest: Sha256Digest;
  readonly code: WriteTransactionCode;
  readonly status: WriteTransactionStatus;
  readonly dry_run: boolean;
  readonly state_promotion: "none";
  readonly targets: readonly WriteTargetResult[];
  readonly executed_at: string;
  readonly detail?: string;
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateWriteTransaction: ValidateFunction = ajv.compile(writeTransactionSchema);

const ACCESS_ERRNOS = new Set([
  "EACCES",
  "EPERM",
  "EROFS",
  "ELOOP",
  "EISDIR",
  "ENOTDIR",
  "WRITE_ACCESS_BLOCKED",
]);

const CODE_STATUS: Record<WriteTransactionCode, WriteTransactionStatus> = {
  WRITE_COMMITTED: "committed",
  WRITE_PREVIEWED: "previewed",
  WRITE_CONFLICT_REJECTED: "rejected",
  WRITE_PARTIAL_BLOCKED: "blocked",
  WRITE_ACCESS_BLOCKED: "blocked",
  WRITE_CONFIRMATION_REJECTED: "rejected",
};

function fail(code: WriteTransactionErrorCode, message: string): never {
  throw new WriteTransactionError(code, message);
}

function scanInput(value: unknown, label: string): unknown {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", `Sensitive content detected in ${label}`);
  }
  try {
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", `Sensitive content detected in ${label}`);
  }
  return snapshot;
}

function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "unknown";
}

function isAccessError(error: unknown): boolean {
  return ACCESS_ERRNOS.has(errnoOf(error));
}

function isMutationConflictError(error: unknown, target: WriteTargetSpec): boolean {
  const code = errnoOf(error);
  return (
    code === "WRITE_CONFLICT_REJECTED" ||
    code === "EEXIST" ||
    code === "ESTALE" ||
    (code === "ENOENT" && target.mode === "update")
  );
}

function mutationGuardFor(target: WriteTargetSpec): WriteMutationGuard {
  return target.mode === "create"
    ? Object.freeze({ mode: "create", before_digest: null })
    : Object.freeze({ mode: "update", before_digest: target.before_digest as Sha256Digest });
}

export function digestBytes(bytes: Uint8Array): Sha256Digest {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${digest}`;
}

export function digestUtf8Content(content: string): Sha256Digest {
  return digestBytes(Buffer.from(content, "utf8"));
}

export function assertWriteTargetPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("INVALID_WRITE_PLAN", "Write target path must be a non-empty string");
  }
  if (value.includes("\u0000") || value.includes("\\")) {
    fail("INVALID_WRITE_PLAN", `Write target path is unsafe: ${value}`);
  }
  if (value.startsWith("/") || value.startsWith("~") || value === ".") {
    fail("INVALID_WRITE_PLAN", `Write target path must be project-relative: ${value}`);
  }
  const segments = value.split("/");
  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.startsWith("~") ||
      segment.includes(":") ||
      segment.includes("\u0000")
    ) {
      fail("INVALID_WRITE_PLAN", `Write target path contains an unsafe segment: ${value}`);
    }
  }
  return value;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "." : path.slice(0, index);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

export function parseWritePlan(value: unknown): WritePlan {
  const snapshot = scanInput(value, "write plan");
  if (!validateWriteTransaction(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-plan") {
    fail("INVALID_WRITE_PLAN", "Invalid write plan");
  }
  const plan = snapshot as unknown as WritePlan;
  const seenPaths = new Set<string>();
  for (const target of plan.targets) {
    assertWriteTargetPath(target.path);
    if (seenPaths.has(target.path)) {
      fail("INVALID_WRITE_PLAN", `Duplicate write target path: ${target.path}`);
    }
    seenPaths.add(target.path);
    if (target.mode === "create" && target.before_digest !== null) {
      fail("INVALID_WRITE_PLAN", `Create target must not declare a before digest: ${target.path}`);
    }
    if (target.mode === "update" && typeof target.before_digest !== "string") {
      fail("INVALID_WRITE_PLAN", `Update target must declare a before digest: ${target.path}`);
    }
    if (digestUtf8Content(target.content) !== target.after_digest) {
      fail("WRITE_PLAN_MISMATCH", `Write target content does not match its after digest: ${target.path}`);
    }
  }
  return plan;
}

export function parseWriteTransactionResult(value: unknown): WriteTransactionResult {
  const snapshot = scanInput(value, "write transaction result");
  if (
    !validateWriteTransaction(snapshot) ||
    !isPlainRecord(snapshot) ||
    snapshot.record_type !== "write-transaction-result"
  ) {
    fail("INVALID_WRITE_PLAN", "Invalid write transaction result");
  }
  const result = snapshot as unknown as WriteTransactionResult;
  if (CODE_STATUS[result.code] !== result.status) {
    fail("WRITE_PLAN_MISMATCH", "Write transaction result status does not match its code");
  }
  if (result.code === "WRITE_COMMITTED" && result.dry_run) {
    fail("WRITE_PLAN_MISMATCH", "A dry-run write transaction cannot be committed");
  }
  if (result.code === "WRITE_PREVIEWED" && !result.dry_run) {
    fail("WRITE_PLAN_MISMATCH", "A previewed write transaction must be a dry run");
  }
  return result;
}

interface ExecuteInput {
  readonly transaction_id: string;
  readonly plan: unknown;
  readonly confirmation_envelope: unknown;
  readonly file_system: WriteFileSystemPort;
  readonly now: () => Date;
  readonly dry_run: boolean;
}

interface RollbackCandidate {
  readonly target: WriteTargetSpec;
  readonly expectedCurrentDigest: Sha256Digest;
  readonly beforeBytes: Uint8Array | null;
}

function targetResult(
  target: WriteTargetSpec,
  status: WriteTargetResultStatus,
  detail?: string,
): WriteTargetResult {
  const base = {
    path: target.path,
    mode: target.mode,
    status,
    before_digest: target.before_digest,
    after_digest: target.after_digest,
  };
  return detail === undefined ? base : { ...base, detail };
}

function buildResult(input: {
  transactionId: string;
  plan: WritePlan;
  envelope: WriteConfirmationEnvelope;
  code: WriteTransactionCode;
  dryRun: boolean;
  executedAt: Date;
  targets: WriteTargetResult[];
  detail?: string;
}): WriteTransactionResult {
  const record = {
    schema_version: "1.0",
    record_type: "write-transaction-result",
    transaction_id: input.transactionId,
    plan_digest: digestJson(input.plan),
    confirmation_envelope_digest: digestJson(input.envelope),
    code: input.code,
    status: CODE_STATUS[input.code],
    dry_run: input.dryRun,
    state_promotion: "none",
    targets: input.targets,
    executed_at: input.executedAt.toISOString(),
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  };
  return parseWriteTransactionResult(record);
}

function projectViewTargets(plan: WritePlan): WriteConfirmationViewTarget[] {
  return plan.targets.map(({ path, mode, before_digest, after_digest }) => ({
    path,
    mode,
    before_digest,
    after_digest,
  }));
}

async function precheckTarget(
  fileSystem: WriteFileSystemPort,
  target: WriteTargetSpec,
): Promise<{ status: "ready" } | { status: WriteTargetResultStatus; detail: string }> {
  let probe: WriteTargetProbe;
  try {
    probe = await fileSystem.probe(target.path);
  } catch (error) {
    return { status: "access-blocked", detail: `probe-failed:${errnoOf(error)}` };
  }
  if (probe.symlink) {
    return { status: "access-blocked", detail: "symlink-target" };
  }
  if (target.mode === "create") {
    if (probe.exists) {
      return { status: "conflict", detail: "target-exists" };
    }
    const parent = parentPath(target.path);
    let parentProbe: WriteTargetProbe;
    try {
      parentProbe = await fileSystem.probe(parent);
    } catch (error) {
      return { status: "access-blocked", detail: `parent-probe-failed:${errnoOf(error)}` };
    }
    if (!parentProbe.exists) {
      return { status: "access-blocked", detail: "parent-missing" };
    }
    if (parentProbe.symlink) {
      return { status: "access-blocked", detail: "parent-symlink" };
    }
    if (parentProbe.kind !== "directory") {
      return { status: "access-blocked", detail: "parent-not-directory" };
    }
    if (!parentProbe.writable) {
      return { status: "access-blocked", detail: "parent-not-writable" };
    }
    return { status: "ready" };
  }
  if (!probe.exists) {
    return { status: "conflict", detail: "target-missing" };
  }
  if (probe.kind !== "file") {
    return { status: "conflict", detail: "target-not-file" };
  }
  if (!probe.readable) {
    return { status: "access-blocked", detail: "target-not-readable" };
  }
  if (!probe.writable) {
    return { status: "access-blocked", detail: "target-not-writable" };
  }
  try {
    const current = await fileSystem.readContent(target.path);
    if (digestBytes(current) !== target.before_digest) {
      return { status: "conflict", detail: "baseline-drift" };
    }
  } catch (error) {
    if (errnoOf(error) === "ENOENT") {
      return { status: "conflict", detail: "target-missing" };
    }
    if (isAccessError(error)) {
      return { status: "access-blocked", detail: "target-not-readable" };
    }
    return { status: "access-blocked", detail: `read-failed:${errnoOf(error)}` };
  }
  return { status: "ready" };
}

async function rollbackWrittenTargets(
  fileSystem: WriteFileSystemPort,
  candidates: RollbackCandidate[],
  results: Map<string, WriteTargetResult>,
): Promise<boolean> {
  let fullyRestored = true;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate === undefined) {
      break;
    }
    const restored = await rollbackSingleTarget(fileSystem, candidate);
    results.set(
      candidate.target.path,
      targetResult(
        candidate.target,
        restored ? "rolled-back" : "rollback-blocked",
        restored ? "reverted-by-transaction" : "rollback-unsafe:manual-review-required",
      ),
    );
    if (!restored) {
      fullyRestored = false;
    }
  }
  return fullyRestored;
}

async function rollbackSingleTarget(
  fileSystem: WriteFileSystemPort,
  candidate: RollbackCandidate,
): Promise<boolean> {
  const target = candidate.target;
  let currentDigest: Sha256Digest | null = null;
  let currentMissing = false;
  try {
    const current = await fileSystem.readContent(target.path);
    currentDigest = digestBytes(current);
  } catch (error) {
    if (errnoOf(error) !== "ENOENT") {
      return false;
    }
    currentMissing = true;
  }
  if (currentMissing) {
    if (target.mode === "create") {
      return true;
    }
    return false;
  }
  if (currentDigest !== candidate.expectedCurrentDigest) {
    return false;
  }
  try {
    if (target.mode === "create") {
      await fileSystem.removeCreated(target.path);
      const probe = await fileSystem.probe(target.path);
      return !probe.exists;
    }
    if (candidate.beforeBytes === null) {
      return false;
    }
    await fileSystem.atomicWrite(
      target.path,
      candidate.beforeBytes,
      Object.freeze({ mode: "update", before_digest: candidate.expectedCurrentDigest }),
    );
    const restored = await fileSystem.readContent(target.path);
    return digestBytes(restored) === target.before_digest;
  } catch {
    return false;
  }
}

export async function executeWriteTransaction(input: ExecuteInput): Promise<WriteTransactionResult> {
  if (typeof input?.transaction_id !== "string" || input.transaction_id.length === 0) {
    fail("INVALID_WRITE_PLAN", "Write transaction id is required");
  }
  if (typeof input.dry_run !== "boolean") {
    fail("INVALID_WRITE_PLAN", "Write transaction dry_run flag must be a boolean");
  }
  if (typeof input.now !== "function") {
    fail("INVALID_WRITE_PLAN", "Write transaction clock is required");
  }
  const executedAt = input.now();
  if (!(executedAt instanceof Date) || Number.isNaN(executedAt.valueOf())) {
    fail("INVALID_WRITE_PLAN", "Write transaction clock is invalid");
  }
  const fileSystem = input.file_system;
  if (
    fileSystem === undefined ||
    typeof fileSystem.probe !== "function" ||
    typeof fileSystem.readContent !== "function" ||
    typeof fileSystem.atomicWrite !== "function" ||
    typeof fileSystem.removeCreated !== "function"
  ) {
    fail("INVALID_WRITE_PLAN", "A write file system port is required");
  }

  const plan = parseWritePlan(input.plan);
  const envelope = parseWriteConfirmationEnvelope(input.confirmation_envelope);

  const rejectConfirmation = (detail: string): WriteTransactionResult =>
    buildResult({
      transactionId: input.transaction_id,
      plan,
      envelope,
      code: "WRITE_CONFIRMATION_REJECTED",
      dryRun: input.dry_run,
      executedAt,
      targets: [],
      detail,
    });

  if (envelope.candidate_digest !== digestJson(plan)) {
    return rejectConfirmation("candidate-digest-mismatch");
  }
  if (!sameJson(envelope.project, plan.project) || envelope.project_context_digest !== plan.project_context_digest) {
    return rejectConfirmation("project-mismatch");
  }
  if (envelope.formal_baseline !== plan.formal_baseline || envelope.working_baseline_digest !== plan.working_baseline_digest) {
    return rejectConfirmation("baseline-mismatch");
  }
  try {
    assertWriteConfirmationViewMatchesTargets(envelope, projectViewTargets(plan));
  } catch (error) {
    if (error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_VIEW_CHANGED") {
      return rejectConfirmation("view-changed");
    }
    throw error;
  }
  try {
    assertWriteConfirmationFresh(envelope, { now: input.now });
  } catch (error) {
    if (error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_EXPIRED") {
      return rejectConfirmation("confirmation-expired");
    }
    throw error;
  }

  const results = new Map<string, WriteTargetResult>();
  let accessBlocked = false;
  let conflicted = false;
  for (const target of plan.targets) {
    const precheck = await precheckTarget(fileSystem, target);
    if (precheck.status !== "ready") {
      results.set(target.path, targetResult(target, precheck.status, precheck.detail));
      if (precheck.status === "access-blocked") {
        accessBlocked = true;
      } else {
        conflicted = true;
      }
      continue;
    }
    results.set(target.path, targetResult(target, input.dry_run ? "previewed" : "verified"));
  }

  if (accessBlocked || conflicted) {
    return buildResult({
      transactionId: input.transaction_id,
      plan,
      envelope,
      code: accessBlocked ? "WRITE_ACCESS_BLOCKED" : "WRITE_CONFLICT_REJECTED",
      dryRun: input.dry_run,
      executedAt,
      targets: plan.targets.map((target) => results.get(target.path) as WriteTargetResult),
      detail: accessBlocked ? "pre-write-access-check-failed" : "baseline-changed-after-confirmation",
    });
  }

  if (input.dry_run) {
    return buildResult({
      transactionId: input.transaction_id,
      plan,
      envelope,
      code: "WRITE_PREVIEWED",
      dryRun: true,
      executedAt,
      targets: plan.targets.map((target) => results.get(target.path) as WriteTargetResult),
      detail: "dry-run-preview-only",
    });
  }

  const rollbackCandidates: RollbackCandidate[] = [];
  const beforeContents = new Map<string, Uint8Array>();
  for (const target of plan.targets) {
    if (target.mode === "update") {
      try {
        const beforeBytes = await fileSystem.readContent(target.path);
        if (digestBytes(beforeBytes) !== target.before_digest) {
          results.set(target.path, targetResult(target, "conflict", "baseline-drift-at-mutation-boundary"));
          return buildResult({
            transactionId: input.transaction_id,
            plan,
            envelope,
            code: "WRITE_CONFLICT_REJECTED",
            dryRun: input.dry_run,
            executedAt,
            targets: plan.targets.map((entry) => results.get(entry.path) as WriteTargetResult),
            detail: "baseline-changed-after-confirmation",
          });
        }
        beforeContents.set(target.path, beforeBytes);
      } catch (error) {
        const missing = errnoOf(error) === "ENOENT";
        results.set(
          target.path,
          targetResult(target, missing ? "conflict" : "access-blocked", missing ? "target-missing" : `baseline-read-failed:${errnoOf(error)}`),
        );
        return buildResult({
          transactionId: input.transaction_id,
          plan,
          envelope,
          code: missing ? "WRITE_CONFLICT_REJECTED" : "WRITE_ACCESS_BLOCKED",
          dryRun: input.dry_run,
          executedAt,
          targets: plan.targets.map((entry) => results.get(entry.path) as WriteTargetResult),
          detail: missing ? "baseline-changed-after-confirmation" : "baseline-unreadable",
        });
      }
    }
  }

  let rootCause: "access" | "conflict" | "write-error" = "write-error";
  let failedDetail = "";
  const attempted = new Set<string>();
  for (const target of plan.targets) {
    attempted.add(target.path);
    const contentBytes = Buffer.from(target.content, "utf8");
    try {
      try {
        await fileSystem.atomicWrite(target.path, contentBytes, mutationGuardFor(target));
      } catch (error) {
        if (isMutationConflictError(error, target)) {
          rootCause = "conflict";
          failedDetail = `mutation-conflict:${errnoOf(error)}:${target.path}`;
          results.set(target.path, targetResult(target, "conflict", failedDetail));
          break;
        }
        throw error;
      }
      const readback = await fileSystem.readContent(target.path);
      const readbackDigest = digestBytes(readback);
      if (readbackDigest !== target.after_digest) {
        rootCause = "write-error";
        failedDetail = `readback-mismatch:${target.path}`;
        // Content observed after the write cannot be proven to belong to this
        // transaction; rolling it back could destroy concurrent work, so the
        // target is blocked for manual review instead of being reverted.
        results.set(
          target.path,
          targetResult(target, "rollback-blocked", "readback-mismatch:manual-review-required"),
        );
        break;
      }
      rollbackCandidates.push({
        target,
        expectedCurrentDigest: target.after_digest,
        beforeBytes: beforeContents.get(target.path) ?? null,
      });
      results.set(target.path, targetResult(target, "verified"));
    } catch (error) {
      rootCause = isAccessError(error) ? "access" : "write-error";
      failedDetail = `write-failed:${errnoOf(error)}:${target.path}`;
      const observed = await observeCurrentDigest(fileSystem, target.path);
      const expectedBaseline: Sha256Digest | "missing" =
        target.mode === "create" ? "missing" : (target.before_digest as Sha256Digest);
      if (observed === target.after_digest) {
        rollbackCandidates.push({
          target,
          expectedCurrentDigest: target.after_digest,
          beforeBytes: beforeContents.get(target.path) ?? null,
        });
        results.set(target.path, targetResult(target, "error", failedDetail));
      } else if (observed === expectedBaseline) {
        results.set(target.path, targetResult(target, "error", `${failedDetail};baseline-intact`));
      } else {
        results.set(target.path, targetResult(target, "rollback-blocked", `post-write-state-unknown:${errnoOf(error)}`));
      }
      break;
    }
  }

  const committed = !failedDetail;
  if (committed) {
    return buildResult({
      transactionId: input.transaction_id,
      plan,
      envelope,
      code: "WRITE_COMMITTED",
      dryRun: false,
      executedAt,
      targets: plan.targets.map((target) => results.get(target.path) as WriteTargetResult),
      detail: "all-targets-written-and-verified",
    });
  }

  for (const target of plan.targets) {
    if (!attempted.has(target.path)) {
      results.set(target.path, targetResult(target, "skipped", "transaction-halted"));
    }
  }

  const fullyRestored = await rollbackWrittenTargets(fileSystem, rollbackCandidates, results);
  return finalizeFailure({
    input,
    plan,
    envelope,
    executedAt,
    results,
    rollbackCandidates,
    fileSystem,
    rootCause,
    failedDetail,
    fullyRestored,
  });
}

async function observeCurrentDigest(
  fileSystem: WriteFileSystemPort,
  path: string,
): Promise<Sha256Digest | "missing" | null> {
  try {
    const current = await fileSystem.readContent(path);
    return digestBytes(current);
  } catch (error) {
    if (errnoOf(error) === "ENOENT") {
      return "missing";
    }
    return null;
  }
}

function finalizeFailure(input: {
  input: ExecuteInput;
  plan: WritePlan;
  envelope: WriteConfirmationEnvelope;
  executedAt: Date;
  results: Map<string, WriteTargetResult>;
  rollbackCandidates: RollbackCandidate[];
  fileSystem: WriteFileSystemPort;
  rootCause: "access" | "conflict" | "write-error";
  failedDetail: string;
  fullyRestored?: boolean;
}): WriteTransactionResult {
  const fullyRestored = input.fullyRestored ?? input.rollbackCandidates.length === 0;
  const targets = input.plan.targets.map((target) => input.results.get(target.path) as WriteTargetResult);
  const rollbackBlocked = targets.some((target) => target.status === "rollback-blocked");
  const detail = [
    fullyRestored && !rollbackBlocked
      ? input.rollbackCandidates.length === 0
        ? "no-writes"
        : "reverted"
      : "rollback-incomplete",
    `cause=${input.rootCause}`,
    input.failedDetail,
    rollbackBlocked || !fullyRestored ? "manual-review-required" : "",
  ]
    .filter((part) => part.length > 0)
    .join(";");
  const code: WriteTransactionCode = rollbackBlocked || !fullyRestored
    ? "WRITE_PARTIAL_BLOCKED"
    : input.rootCause === "conflict"
      ? "WRITE_CONFLICT_REJECTED"
      : input.rootCause === "access"
        ? "WRITE_ACCESS_BLOCKED"
        : "WRITE_PARTIAL_BLOCKED";
  return buildResult({
    transactionId: input.input.transaction_id,
    plan: input.plan,
    envelope: input.envelope,
    code,
    dryRun: input.input.dry_run,
    executedAt: input.executedAt,
    targets,
    detail,
  });
}
