import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createNodeFsProbeAdapter } from "../../src/adapters/node/fs-probe.ts";
import { createNodeWriteFileSystem, resolveProjectPath } from "../../src/adapters/node/file-write.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  createUnverifiedWriteConfirmationAction,
  createUnverifiedWriteConfirmationViewDisplay,
  createWriteConfirmationChallenge,
  createWriteConfirmationEnvelope,
  createWriteConfirmationResult,
  verifyWriteConfirmationInteraction,
  type WriteConfirmationEnvelope,
} from "../../src/domain/confirmation-node.ts";
import {
  WriteTransactionError,
  assertWriteTargetPath,
  digestUtf8Content,
  executeWriteTransaction,
  parseWritePlan,
  parseWriteTransactionResult,
  type WriteFileSystemPort,
  type WritePlan,
  type WriteTargetProbe,
  type WriteTargetSpec,
  type WriteTransactionResult,
} from "../../src/domain/write-transaction.ts";

const REPOSITORY_ID = `sha256:${"d".repeat(64)}` as const;
const PROJECT_CONTEXT_DIGEST = `sha256:${"e".repeat(64)}` as const;
const CANDIDATE_CHANGE_DIGEST = `sha256:${"c".repeat(64)}` as const;
const FORMAL_BASELINE = "024c1db6d941b6f771746c8d6249fb8a09b816f3";
const WORKING_BASELINE_DIGEST = `sha256:${"b".repeat(64)}` as const;
const EXECUTION_TIME = "2026-08-15T01:10:00.000Z";

function errnoError(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

interface MemoryFaultSpec {
  readonly writeError?: NodeJS.ErrnoException;
  readonly readbackContent?: string;
  readonly landThenThrow?: NodeJS.ErrnoException;
}

type ExpectedMutationGuard = Pick<WriteTargetSpec, "mode" | "before_digest">;

class MemoryWriteFileSystem implements WriteFileSystemPort {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly symlinks = new Set<string>();
  readonly readOnlyPaths = new Set<string>();
  readonly writeFaults = new Map<string, MemoryFaultSpec>();
  readonly readFaults = new Map<string, { error: NodeJS.ErrnoException; skipCalls: number }>();
  readonly probeFaults = new Map<string, NodeJS.ErrnoException>();
  readonly readCallCounts = new Map<string, number>();
  readonly mutationGuards: Array<{
    readonly path: string;
    readonly guard: ExpectedMutationGuard | undefined;
  }> = [];
  removeFailures = new Map<string, NodeJS.ErrnoException>();
  writeCount = 0;
  removeCount = 0;

  seedDirectory(path: string): void {
    this.dirs.add(path);
  }

  seedFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  seedSymlink(path: string): void {
    this.symlinks.add(path);
  }

  markReadOnly(path: string): void {
    this.readOnlyPaths.add(path);
  }

  mutateExternally(path: string, content: string): void {
    this.files.set(path, content);
  }

  async probe(path: string): Promise<WriteTargetProbe> {
    const probeFault = this.probeFaults.get(path);
    if (probeFault !== undefined) {
      throw probeFault;
    }
    if (this.symlinks.has(path)) {
      return { exists: true, kind: "symlink", symlink: true, readable: false, writable: false };
    }
    if (this.files.has(path)) {
      const writable = !this.readOnlyPaths.has(path);
      return { exists: true, kind: "file", symlink: false, readable: writable, writable };
    }
    if (path === "." || this.dirs.has(path)) {
      return {
        exists: true,
        kind: "directory",
        symlink: false,
        readable: true,
        writable: !this.readOnlyPaths.has(path),
      };
    }
    return { exists: false, kind: "missing", symlink: false, readable: false, writable: false };
  }

  async readContent(path: string): Promise<Uint8Array> {
    const calls = (this.readCallCounts.get(path) ?? 0) + 1;
    this.readCallCounts.set(path, calls);
    const readFault = this.readFaults.get(path);
    if (readFault !== undefined && calls > readFault.skipCalls) {
      throw readFault.error;
    }
    const content = this.files.get(path);
    if (content === undefined) {
      throw errnoError("ENOENT", `Memory file missing: ${path}`);
    }
    return Buffer.from(content, "utf8");
  }

  async atomicWrite(path: string, content: Uint8Array, guard?: ExpectedMutationGuard): Promise<void> {
    this.mutationGuards.push({ path, guard });
    this.writeCount += 1;
    const fault = this.writeFaults.get(path);
    if (fault?.writeError !== undefined) {
      throw fault.writeError;
    }
    const text = Buffer.from(content).toString("utf8");
    this.files.set(path, fault?.readbackContent ?? text);
    if (fault?.landThenThrow !== undefined) {
      // One-shot fault: content lands, then the write reports a late failure.
      this.writeFaults.delete(path);
      throw fault.landThenThrow;
    }
  }

  async removeCreated(path: string): Promise<void> {
    this.removeCount += 1;
    const failure = this.removeFailures.get(path);
    if (failure !== undefined) {
      throw failure;
    }
    this.files.delete(path);
  }
}

interface PlanTargetInput {
  readonly path: string;
  readonly mode: "create" | "update";
  readonly content: string;
  readonly beforeContent?: string;
}

function buildTargets(inputs: PlanTargetInput[]): WriteTargetSpec[] {
  return inputs.map((input) => ({
    path: input.path,
    mode: input.mode,
    before_digest: input.mode === "update" ? digestUtf8Content(input.beforeContent ?? "") : null,
    after_digest: digestUtf8Content(input.content),
    content: input.content,
  }));
}

function buildPlan(targets: WriteTargetSpec[], overrides: Record<string, unknown> = {}): WritePlan {
  return parseWritePlan({
    schema_version: "1.0",
    record_type: "write-plan",
    plan_id: "plan-001",
    project: { repository_id: REPOSITORY_ID },
    project_context_digest: PROJECT_CONTEXT_DIGEST,
    candidate_change_digest: CANDIDATE_CHANGE_DIGEST,
    formal_baseline: FORMAL_BASELINE,
    working_baseline_digest: WORKING_BASELINE_DIGEST,
    targets,
    created_at: "2026-08-15T00:59:00.000Z",
    ...overrides,
  });
}

function confirmPlan(
  plan: WritePlan,
  overrides: Record<string, unknown> = {},
): WriteConfirmationEnvelope {
  const challenge = createWriteConfirmationChallenge({
    project: plan.project,
    project_context_digest: plan.project_context_digest,
    formal_baseline: plan.formal_baseline,
    working_baseline_digest: plan.working_baseline_digest,
    candidate_digest: digestJson(plan),
    targets: plan.targets.map(({ path, mode, before_digest, after_digest }) => ({
      path,
      mode,
      before_digest,
      after_digest,
    })),
    confirmation_id: "write-confirm-plan-001",
    proposer_id: "agent-qwen-w3",
    created_at: "2026-08-15T01:00:00.000Z",
    expires_at: "2026-08-15T01:30:00.000Z",
    ...overrides,
  });
  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-plan-001",
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: "user-plan-001",
    actor_id: "human-owner",
    action: "confirm",
    occurred_at: "2026-08-15T01:06:00.000Z",
  });
  const verified = verifyWriteConfirmationInteraction(
    { display, user_action: action },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  return createWriteConfirmationEnvelope(verified);
}

interface ExecuteOptions {
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly transactionId?: string;
}

function execute(
  plan: WritePlan,
  envelope: WriteConfirmationEnvelope,
  fileSystem: WriteFileSystemPort,
  options: ExecuteOptions = {},
): Promise<WriteTransactionResult> {
  return executeWriteTransaction({
    transaction_id: options.transactionId ?? "tx-001",
    plan,
    confirmation_envelope: envelope,
    file_system: fileSystem,
    now: () => new Date(options.now ?? EXECUTION_TIME),
    dry_run: options.dryRun ?? false,
  });
}

function assertNoPromotion(result: WriteTransactionResult): void {
  assert.equal(result.state_promotion, "none");
}

test("write plan parsing enforces structure, digests and path safety", () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "src/b.ts", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  assert.equal(plan.record_type, "write-plan");
  assert.equal(plan.candidate_change_digest, CANDIDATE_CHANGE_DIGEST);
  assert.equal(plan.targets.length, 2);
  assert.ok(Object.isFrozen(plan));
  assert.equal(Object.getPrototypeOf(plan), null);
  assert.deepEqual({ ...parseWritePlan(plan) }, { ...plan });

  for (const invalid of [
    buildTargets([
      { path: "a.md", mode: "create", content: "x" },
      { path: "a.md", mode: "create", content: "y" },
    ]),
    buildTargets([{ path: "../escape.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "/abs.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "a/../b.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "a//b.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "a/./b.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "a\\b.md", mode: "create", content: "x" }]),
    buildTargets([{ path: "", mode: "create", content: "x" }]),
    buildTargets([{ path: "a.md", mode: "create", content: "x" }]).map((target) => ({
      ...target,
      after_digest: `sha256:${"0".repeat(63)}`,
    })),
    buildTargets([{ path: "a.md", mode: "create", content: "x" }]).map((target) => ({
      ...target,
      before_digest: `sha256:${"1".repeat(64)}`,
    })),
    buildTargets([{ path: "a.md", mode: "update", content: "x", beforeContent: "y" }]).map((target) => ({
      ...target,
      before_digest: null,
    })),
    [],
  ]) {
    assert.throws(() => buildPlan(invalid as unknown as WriteTargetSpec[]), WriteTransactionError);
  }

  const mismatched = buildTargets([{ path: "a.md", mode: "create", content: "x" }]).map((target) => ({
    ...target,
    content: "tampered",
  }));
  assert.throws(() => buildPlan(mismatched), WriteTransactionError);

  const withUnknownField = JSON.parse(
    JSON.stringify({
      schema_version: "1.0",
      record_type: "write-plan",
      plan_id: "plan-x",
      project: { repository_id: REPOSITORY_ID },
      project_context_digest: PROJECT_CONTEXT_DIGEST,
      candidate_change_digest: CANDIDATE_CHANGE_DIGEST,
      formal_baseline: FORMAL_BASELINE,
      working_baseline_digest: WORKING_BASELINE_DIGEST,
      targets: buildTargets([{ path: "a.md", mode: "create", content: "x" }]),
      created_at: "2026-08-15T00:59:00.000Z",
      extra: true,
    }),
  );
  assert.throws(() => parseWritePlan(withUnknownField), WriteTransactionError);

  const serializedPlan = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  const { candidate_change_digest: _missingCandidateChangeDigest, ...withoutCandidateChangeDigest } = serializedPlan;
  assert.throws(() => parseWritePlan(withoutCandidateChangeDigest), WriteTransactionError);
  assert.throws(
    () => parseWritePlan({ ...serializedPlan, candidate_change_digest: "sha256:not-a-digest" }),
    WriteTransactionError,
  );
});

test("execution rejects envelopes that do not bind the exact plan and baseline", async () => {
  const targets = buildTargets([{ path: "a.md", mode: "create", content: "hello" }]);
  const plan = buildPlan(targets);
  const fileSystem = new MemoryWriteFileSystem();

  const foreignPlan = buildPlan(buildTargets([{ path: "other.md", mode: "create", content: "other" }]));
  const foreignEnvelope = confirmPlan(foreignPlan);
  const mismatch = await execute(plan, foreignEnvelope, fileSystem);
  assert.equal(mismatch.code, "WRITE_CONFIRMATION_REJECTED");
  assert.equal(mismatch.status, "rejected");
  assert.equal(fileSystem.writeCount, 0);
  assertNoPromotion(mismatch);

  const envelopeForOriginalCandidateChange = confirmPlan(plan);
  const tamperedCandidateChangePlan = parseWritePlan({
    ...JSON.parse(JSON.stringify(plan)),
    candidate_change_digest: `sha256:${"9".repeat(64)}`,
  });
  const candidateChangeMismatch = await execute(
    tamperedCandidateChangePlan,
    envelopeForOriginalCandidateChange,
    fileSystem,
  );
  assert.equal(candidateChangeMismatch.code, "WRITE_CONFIRMATION_REJECTED");
  assert.equal(candidateChangeMismatch.detail, "candidate-digest-mismatch");
  assert.equal(fileSystem.writeCount, 0);

  const rebasedPlan = parseWritePlan({
    ...JSON.parse(JSON.stringify(plan)),
    formal_baseline: "f".repeat(40),
  });
  const envelopeForPlan = confirmPlan(plan);
  const baselineMismatch = await execute(rebasedPlan, envelopeForPlan, fileSystem);
  assert.equal(baselineMismatch.code, "WRITE_CONFIRMATION_REJECTED");
  assert.equal(fileSystem.writeCount, 0);

  const expired = await execute(plan, envelopeForPlan, fileSystem, {
    now: "2026-08-15T01:30:00.000Z",
  });
  assert.equal(expired.code, "WRITE_CONFIRMATION_REJECTED");
  assert.match(expired.detail ?? "", /expired/);

  await assert.rejects(
    executeWriteTransaction({
      transaction_id: "",
      plan,
      confirmation_envelope: envelopeForPlan,
      file_system: fileSystem,
      now: () => new Date(EXECUTION_TIME),
      dry_run: false,
    }),
    WriteTransactionError,
  );
});

test("dry-run previews without writing and surfaces conflicts and access failures", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "src/b.ts", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);

  const cleanFileSystem = new MemoryWriteFileSystem();
  cleanFileSystem.seedDirectory("docs");
  cleanFileSystem.seedDirectory("src");
  cleanFileSystem.seedFile("docs/a.md", "old-a");
  const preview = await execute(plan, envelope, cleanFileSystem, { dryRun: true });
  assert.equal(preview.code, "WRITE_PREVIEWED");
  assert.equal(preview.dry_run, true);
  assert.equal(cleanFileSystem.files.get("docs/a.md"), "old-a");
  assert.equal(cleanFileSystem.files.has("src/b.ts"), false);
  assert.equal(cleanFileSystem.writeCount, 0);
  assertNoPromotion(preview);

  const driftedFileSystem = new MemoryWriteFileSystem();
  driftedFileSystem.seedDirectory("docs");
  driftedFileSystem.seedDirectory("src");
  driftedFileSystem.seedFile("docs/a.md", "mutated-by-other-writer");
  const conflict = await execute(plan, envelope, driftedFileSystem, { dryRun: true });
  assert.equal(conflict.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(conflict.targets[0]?.status, "conflict");
  assert.equal(driftedFileSystem.writeCount, 0);

  const readOnlyFileSystem = new MemoryWriteFileSystem();
  readOnlyFileSystem.seedDirectory("docs");
  readOnlyFileSystem.seedFile("docs/a.md", "old-a");
  readOnlyFileSystem.markReadOnly("src");
  const blocked = await execute(plan, envelope, readOnlyFileSystem, { dryRun: true });
  assert.equal(blocked.code, "WRITE_ACCESS_BLOCKED");
  assertNoPromotion(blocked);
});

test("commit writes atomically with read-back verification and never promotes state", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "src/b.ts", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedDirectory("src");
  fileSystem.seedFile("docs/a.md", "old-a");

  const result = await execute(plan, envelope, fileSystem);
  assert.equal(result.code, "WRITE_COMMITTED");
  assert.equal(result.status, "committed");
  assert.equal(result.dry_run, false);
  assert.equal(result.plan_digest, digestJson(plan));
  assert.equal(result.confirmation_envelope_digest, digestJson(envelope));
  assert.equal(result.executed_at, EXECUTION_TIME);
  assert.deepEqual(
    result.targets.map((target) => target.status),
    ["verified", "verified"],
  );
  assert.equal(fileSystem.files.get("docs/a.md"), "new-a");
  assert.equal(fileSystem.files.get("src/b.ts"), "new-b");
  assertNoPromotion(result);

  const replayed = await execute(buildPlan(targets), confirmPlan(buildPlan(targets)), (() => {
    const replayFileSystem = new MemoryWriteFileSystem();
    replayFileSystem.seedDirectory("docs");
    replayFileSystem.seedDirectory("src");
    replayFileSystem.seedFile("docs/a.md", "old-a");
    return replayFileSystem;
  })());
  assert.equal(digestJson(replayed), digestJson(result));
});

test("baseline drift after confirmation is rejected with WRITE_CONFLICT_REJECTED and zero writes", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");
  fileSystem.mutateExternally("docs/a.md", "changed-after-confirmation");

  const result = await execute(plan, envelope, fileSystem);
  assert.equal(result.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(result.status, "rejected");
  assert.equal(result.targets[0]?.status, "conflict");
  assert.equal(fileSystem.files.get("docs/a.md"), "changed-after-confirmation");
  assert.equal(fileSystem.writeCount, 0);
  assertNoPromotion(result);

  const missingUpdate = new MemoryWriteFileSystem();
  missingUpdate.seedDirectory("docs");
  const missingResult = await execute(plan, envelope, missingUpdate);
  assert.equal(missingResult.code, "WRITE_CONFLICT_REJECTED");

  const createCollisionFileSystem = new MemoryWriteFileSystem();
  createCollisionFileSystem.seedDirectory("docs");
  createCollisionFileSystem.seedFile("docs/a.md", "old-a");
  const createPlan = buildPlan(buildTargets([{ path: "docs/a.md", mode: "create", content: "c" }]));
  const collision = await execute(createPlan, confirmPlan(createPlan), createCollisionFileSystem);
  assert.equal(collision.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(createCollisionFileSystem.writeCount, 0);
});

test("symlink targets and unwritable baselines fail closed with WRITE_ACCESS_BLOCKED", async () => {
  const symlinkFileSystem = new MemoryWriteFileSystem();
  symlinkFileSystem.seedDirectory("docs");
  symlinkFileSystem.seedSymlink("docs/link.md");
  const symlinkPlan = buildPlan(buildTargets([{ path: "docs/link.md", mode: "update", content: "x", beforeContent: "y" }]));
  const symlinkResult = await execute(symlinkPlan, confirmPlan(symlinkPlan), symlinkFileSystem);
  assert.equal(symlinkResult.code, "WRITE_ACCESS_BLOCKED");
  assert.equal(symlinkResult.targets[0]?.status, "access-blocked");
  assert.equal(symlinkFileSystem.writeCount, 0);

  const readOnlyFileSystem = new MemoryWriteFileSystem();
  readOnlyFileSystem.seedDirectory("docs");
  readOnlyFileSystem.seedFile("docs/a.md", "old-a");
  readOnlyFileSystem.markReadOnly("docs/a.md");
  const readOnlyPlan = buildPlan(buildTargets([{ path: "docs/a.md", mode: "update", content: "n", beforeContent: "old-a" }]));
  const readOnlyResult = await execute(readOnlyPlan, confirmPlan(readOnlyPlan), readOnlyFileSystem);
  assert.equal(readOnlyResult.code, "WRITE_ACCESS_BLOCKED");

  const missingParent = new MemoryWriteFileSystem();
  const missingParentPlan = buildPlan(buildTargets([{ path: "missing-dir/a.md", mode: "create", content: "x" }]));
  const missingParentResult = await execute(missingParentPlan, confirmPlan(missingParentPlan), missingParent);
  assert.equal(missingParentResult.code, "WRITE_ACCESS_BLOCKED");

  const parentFile = new MemoryWriteFileSystem();
  parentFile.seedFile("notadir", "f");
  const parentFilePlan = buildPlan(buildTargets([{ path: "notadir/a.md", mode: "create", content: "x" }]));
  const parentFileResult = await execute(parentFilePlan, confirmPlan(parentFilePlan), parentFile);
  assert.equal(parentFileResult.code, "WRITE_ACCESS_BLOCKED");
});

test("mid-transaction write failure rolls back only provably-owned changes", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
    { path: "docs/c.md", mode: "create", content: "new-c" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);

  const revertingFileSystem = new MemoryWriteFileSystem();
  revertingFileSystem.seedDirectory("docs");
  revertingFileSystem.seedFile("docs/a.md", "old-a");
  revertingFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "disk full") });

  const result = await execute(plan, envelope, revertingFileSystem);
  assert.equal(result.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(result.status, "blocked");
  assert.match(result.detail ?? "", /reverted/);
  assert.deepEqual(
    result.targets.map((target) => target.status),
    ["rolled-back", "error", "skipped"],
  );
  assert.equal(revertingFileSystem.files.get("docs/a.md"), "old-a");
  assert.equal(revertingFileSystem.files.has("docs/b.md"), false);
  assert.equal(revertingFileSystem.files.has("docs/c.md"), false);
  assertNoPromotion(result);

  const accessFaultFileSystem = new MemoryWriteFileSystem();
  accessFaultFileSystem.seedDirectory("docs");
  accessFaultFileSystem.seedFile("docs/a.md", "old-a");
  accessFaultFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("EACCES", "denied") });
  const accessResult = await execute(plan, envelope, accessFaultFileSystem);
  assert.equal(accessResult.code, "WRITE_ACCESS_BLOCKED");
  assert.equal(accessFaultFileSystem.files.get("docs/a.md"), "old-a");
  assertNoPromotion(accessResult);
});

test("read-back verification failure blocks rollback for unverifiable content and reverts proven writes", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");
  fileSystem.writeFaults.set("docs/b.md", { readbackContent: "corrupted-by-faulty-storage" });

  const result = await execute(plan, envelope, fileSystem);
  assert.equal(result.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(result.detail ?? "", /manual-review/);
  assert.deepEqual(
    result.targets.map((target) => target.status),
    ["rolled-back", "rollback-blocked"],
  );
  assert.equal(fileSystem.files.get("docs/a.md"), "old-a");
  // Unverifiable content must be preserved for manual review, never destroyed.
  assert.equal(fileSystem.files.get("docs/b.md"), "corrupted-by-faulty-storage");
  assertNoPromotion(result);
});

test("rollback blocks instead of destroying changes it cannot prove it owns", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");
  fileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("EIO", "io error") });

  const originalAtomicWrite = fileSystem.atomicWrite.bind(fileSystem);
  let mutated = false;
  fileSystem.atomicWrite = async (path: string, content: Uint8Array) => {
    await originalAtomicWrite(path, content);
    if (path === "docs/a.md" && !mutated) {
      mutated = true;
      fileSystem.mutateExternally("docs/a.md", "concurrent-external-edit");
    }
  };

  const result = await execute(plan, envelope, fileSystem);
  assert.equal(result.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(result.detail ?? "", /manual-review/);
  assert.equal(result.targets[0]?.status, "rollback-blocked");
  assert.equal(result.targets[1]?.status, "skipped");
  assert.equal(fileSystem.files.get("docs/a.md"), "concurrent-external-edit");
  assert.equal(fileSystem.files.has("docs/b.md"), false);
  assertNoPromotion(result);
});

test("write confirmation result records the committed and blocked outcomes", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "create", content: "x" }]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");

  const committed = await execute(plan, envelope, fileSystem);
  const committedResult = createWriteConfirmationResult({
    envelope,
    transaction_result: committed,
    result_id: "result-commit",
    recorded_at: "2026-08-15T01:10:30.000Z",
  });
  assert.equal(committedResult.status, "committed");

  const blockedFileSystem = new MemoryWriteFileSystem();
  blockedFileSystem.seedDirectory("docs");
  blockedFileSystem.markReadOnly("docs");
  const blocked = await execute(plan, envelope, blockedFileSystem);
  const blockedResult = createWriteConfirmationResult({
    envelope,
    transaction_result: blocked,
    result_id: "result-blocked",
    recorded_at: "2026-08-15T01:10:30.000Z",
  });
  assert.equal(blockedResult.status, "blocked");
});

interface RealAdapterContext {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function withTemporaryProject<T>(
  body: (context: RealAdapterContext) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "nextstep-w3-write-"));
  try {
    return await body({ root, cleanup: async () => {} });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("node write adapter performs temp-write, fsync, atomic rename and read-back", async () => {
  await withTemporaryProject(async ({ root }) => {
    let fsyncCalls = 0;
    const fileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        fsync: async (fd: number) => {
          fsyncCalls += 1;
          const { fsync: fsyncCb } = await import("node:fs");
          const { promisify: promisifyUtil } = await import("node:util");
          await promisifyUtil(fsyncCb)(fd);
        },
      },
    });

    await fileSystem.atomicWrite("a.txt", Buffer.from("first", "utf8"));
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "first");
    assert.ok(fsyncCalls >= 1);
    const entries = await readdir(root);
    assert.deepEqual(entries, ["a.txt"]);

    const probeBeforeUpdate = await fileSystem.probe("a.txt");
    assert.equal(probeBeforeUpdate.kind, "file");
    assert.equal(probeBeforeUpdate.writable, true);

    await chmod(join(root, "a.txt"), 0o600);
    await fileSystem.atomicWrite("a.txt", Buffer.from("second", "utf8"));
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "second");
    const stats = await lstat(join(root, "a.txt"));
    assert.equal(stats.mode & 0o777, 0o600);

    await assert.rejects(fileSystem.atomicWrite("../escape.txt", Buffer.from("x")), WriteTransactionError);
    await assert.rejects(fileSystem.atomicWrite("a/../escape.txt", Buffer.from("x")), WriteTransactionError);
  });
});

test("node adapter probes classify missing, file, directory and symlink targets", async () => {
  await withTemporaryProject(async ({ root }) => {
    const probe = createNodeFsProbeAdapter();
    await writeFile(join(root, "file.txt"), "x");
    await mkdir(join(root, "subdir"));
    await symlink(join(root, "file.txt"), join(root, "link.txt"));

    const missing = await probe.probe(join(root, "nope.txt"));
    assert.equal(missing.exists, false);
    assert.equal(missing.kind, "missing");

    const file = await probe.probe(join(root, "file.txt"));
    assert.deepEqual(
      { exists: file.exists, kind: file.kind, symlink: file.symlink, readable: file.readable, writable: file.writable },
      { exists: true, kind: "file", symlink: false, readable: true, writable: true },
    );

    const directory = await probe.probe(join(root, "subdir"));
    assert.equal(directory.kind, "directory");

    const link = await probe.probe(join(root, "link.txt"));
    assert.equal(link.symlink, true);
    assert.equal(link.readable, false);
    assert.equal(link.writable, false);
  });
});

test("node adapter blocks symlink escape and permission failures end to end", async () => {
  await withTemporaryProject(async ({ root }) => {
    await mkdir(join(root, "inside"));
    await writeFile(join(root, "outside.txt"), "outside");
    await symlink(join(root, "outside.txt"), join(root, "inside", "escape.txt"));

    const escapePlan = buildPlan(
      buildTargets([{ path: "inside/escape.txt", mode: "update", content: "evil", beforeContent: "outside" }]),
    );
    const escapeEnvelope = confirmPlan(escapePlan);
    const fileSystem = createNodeWriteFileSystem({ project_root: root });
    const escapeResult = await execute(escapePlan, escapeEnvelope, fileSystem);
    assert.equal(escapeResult.code, "WRITE_ACCESS_BLOCKED");
    assert.equal(await readFile(join(root, "outside.txt"), "utf8"), "outside");

    const accessDeniedFileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        access: async (path: string, mode?: number) => {
          if (mode !== undefined && (mode & fsConstants.W_OK) !== 0) {
            throw errnoError("EACCES", "injected denial");
          }
          const { access } = await import("node:fs/promises");
          await access(path, mode);
        },
      },
    });
    const deniedPlan = buildPlan(
      buildTargets([{ path: "inside/real.txt", mode: "create", content: "hello" }]),
    );
    const deniedResult = await execute(deniedPlan, confirmPlan(deniedPlan), accessDeniedFileSystem);
    assert.equal(deniedResult.code, "WRITE_ACCESS_BLOCKED");
    assertNoPromotion(deniedResult);

    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    if (!isRoot) {
      await chmod(join(root, "inside"), 0o500);
      const readOnlyPlan = buildPlan(
        buildTargets([{ path: "inside/blocked.txt", mode: "create", content: "hello" }]),
      );
      const readOnlyResult = await execute(readOnlyPlan, confirmPlan(readOnlyPlan), fileSystem);
      assert.equal(readOnlyResult.code, "WRITE_ACCESS_BLOCKED");
      await chmod(join(root, "inside"), 0o700);
    }
  });
});

test("node adapter write fault injection surfaces as a blocked partial-free result", async () => {
  await withTemporaryProject(async ({ root }) => {
    const fileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        open: async () => {
          throw errnoError("EEXIST", "injected exclusive-create collision");
        },
      },
    });
    const plan = buildPlan(buildTargets([{ path: "a.txt", mode: "create", content: "x" }]));
    const result = await execute(plan, confirmPlan(plan), fileSystem);
    assert.equal(result.code, "WRITE_PARTIAL_BLOCKED");
    assert.equal(result.targets[0]?.status, "error");
    assertNoPromotion(result);
    const entries = await readdir(root);
    assert.equal(entries.length, 0);
  });
});

test("pre-check read failures fail closed with conflict or access semantics", async () => {
  const makePlan = () =>
    buildPlan(buildTargets([{ path: "docs/a.md", mode: "update", content: "n", beforeContent: "old-a" }]));

  const missingRead = new MemoryWriteFileSystem();
  missingRead.seedDirectory("docs");
  missingRead.seedFile("docs/a.md", "old-a");
  missingRead.readFaults.set("docs/a.md", { error: errnoError("ENOENT", "gone"), skipCalls: 0 });
  const missingResult = await execute(makePlan(), confirmPlan(makePlan()), missingRead, { dryRun: true });
  assert.equal(missingResult.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(missingResult.targets[0]?.status, "conflict");

  const deniedRead = new MemoryWriteFileSystem();
  deniedRead.seedDirectory("docs");
  deniedRead.seedFile("docs/a.md", "old-a");
  deniedRead.readFaults.set("docs/a.md", { error: errnoError("EACCES", "denied"), skipCalls: 0 });
  const deniedResult = await execute(makePlan(), confirmPlan(makePlan()), deniedRead, { dryRun: true });
  assert.equal(deniedResult.code, "WRITE_ACCESS_BLOCKED");
  assert.equal(deniedResult.targets[0]?.status, "access-blocked");

  const ioRead = new MemoryWriteFileSystem();
  ioRead.seedDirectory("docs");
  ioRead.seedFile("docs/a.md", "old-a");
  ioRead.readFaults.set("docs/a.md", { error: errnoError("EIO", "io"), skipCalls: 0 });
  const ioResult = await execute(makePlan(), confirmPlan(makePlan()), ioRead, { dryRun: true });
  assert.equal(ioResult.code, "WRITE_ACCESS_BLOCKED");
  assert.match(ioResult.targets[0]?.detail ?? "", /read-failed:EIO/);
});

test("baseline read race at commit time blocks before any write", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "update", content: "n", beforeContent: "old-a" }]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);

  const vanishedFileSystem = new MemoryWriteFileSystem();
  vanishedFileSystem.seedDirectory("docs");
  vanishedFileSystem.seedFile("docs/a.md", "old-a");
  vanishedFileSystem.readFaults.set("docs/a.md", { error: errnoError("ENOENT", "vanished"), skipCalls: 1 });
  const vanished = await execute(plan, envelope, vanishedFileSystem);
  assert.equal(vanished.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(vanished.detail, "baseline-changed-after-confirmation");
  assert.equal(vanishedFileSystem.writeCount, 0);

  const unreadableFileSystem = new MemoryWriteFileSystem();
  unreadableFileSystem.seedDirectory("docs");
  unreadableFileSystem.seedFile("docs/a.md", "old-a");
  unreadableFileSystem.readFaults.set("docs/a.md", { error: errnoError("EACCES", "denied"), skipCalls: 1 });
  const unreadable = await execute(plan, envelope, unreadableFileSystem);
  assert.equal(unreadable.code, "WRITE_ACCESS_BLOCKED");
  assert.equal(unreadable.detail, "baseline-unreadable");
  assert.equal(unreadableFileSystem.writeCount, 0);
  assertNoPromotion(unreadable);
});

test("second successful baseline read with changed bytes rejects update before mutation", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "planned", beforeContent: "old-a" },
  ]);
  const plan = buildPlan(targets);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");

  const originalReadContent = fileSystem.readContent.bind(fileSystem);
  let targetReads = 0;
  fileSystem.readContent = async (path: string) => {
    if (path === "docs/a.md") {
      targetReads += 1;
      if (targetReads === 2) {
        fileSystem.mutateExternally(path, "user-new");
      }
    }
    return originalReadContent(path);
  };

  const result = await execute(plan, confirmPlan(plan), fileSystem);

  assert.equal(result.code, "WRITE_CONFLICT_REJECTED");
  assert.equal(result.targets[0]?.status, "conflict");
  assert.equal(result.detail, "baseline-changed-after-confirmation");
  assert.equal(fileSystem.files.get("docs/a.md"), "user-new");
  assert.equal(fileSystem.writeCount, 0);
  assertNoPromotion(result);
});

test("mutation boundary receives explicit create and update guards", async () => {
  const targets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const plan = buildPlan(targets);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");

  const result = await execute(plan, confirmPlan(plan), fileSystem);

  assert.equal(result.code, "WRITE_COMMITTED");
  assert.deepEqual(fileSystem.mutationGuards, [
    {
      path: "docs/a.md",
      guard: { mode: "update", before_digest: targets[0]?.before_digest },
    },
    {
      path: "docs/b.md",
      guard: { mode: "create", before_digest: null },
    },
  ]);
});

test("rollback restores proven create targets by removal and blocks on vanished update targets", async () => {
  const createPlanTargets = buildTargets([
    { path: "docs/a.md", mode: "create", content: "new-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const createPlan = buildPlan(createPlanTargets);
  const createFileSystem = new MemoryWriteFileSystem();
  createFileSystem.seedDirectory("docs");
  createFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
  const createResult = await execute(createPlan, confirmPlan(createPlan), createFileSystem);
  assert.equal(createResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(createResult.detail ?? "", /reverted/);
  assert.deepEqual(
    createResult.targets.map((target) => target.status),
    ["rolled-back", "error"],
  );
  assert.equal(createFileSystem.files.has("docs/a.md"), false);
  assert.ok(createFileSystem.removeCount >= 1);

  const vanishedTargets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const vanishedPlan = buildPlan(vanishedTargets);
  const vanishedFileSystem = new MemoryWriteFileSystem();
  vanishedFileSystem.seedDirectory("docs");
  vanishedFileSystem.seedFile("docs/a.md", "old-a");
  vanishedFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
  const originalAtomicWrite = vanishedFileSystem.atomicWrite.bind(vanishedFileSystem);
  vanishedFileSystem.atomicWrite = async (path: string, content: Uint8Array) => {
    await originalAtomicWrite(path, content);
    if (path === "docs/a.md") {
      vanishedFileSystem.files.delete("docs/a.md");
    }
  };
  const vanishedResult = await execute(vanishedPlan, confirmPlan(vanishedPlan), vanishedFileSystem);
  assert.equal(vanishedResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(vanishedResult.detail ?? "", /manual-review/);
  assert.equal(vanishedResult.targets[0]?.status, "rollback-blocked");
  assertNoPromotion(vanishedResult);
});

test("rollback failures and unreadable post-write state block instead of reverting", async () => {
  const restoreFailureTargets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const restoreFailurePlan = buildPlan(restoreFailureTargets);
  const restoreFailureFileSystem = new MemoryWriteFileSystem();
  restoreFailureFileSystem.seedDirectory("docs");
  restoreFailureFileSystem.seedFile("docs/a.md", "old-a");
  restoreFailureFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
  const restoreFailureOriginal = restoreFailureFileSystem.atomicWrite.bind(restoreFailureFileSystem);
  let armed = false;
  restoreFailureFileSystem.atomicWrite = async (path: string, content: Uint8Array) => {
    if (path === "docs/a.md" && armed) {
      throw errnoError("EIO", "restore write failed");
    }
    await restoreFailureOriginal(path, content);
    if (path === "docs/a.md") {
      armed = true;
    }
  };
  const restoreFailureResult = await execute(restoreFailurePlan, confirmPlan(restoreFailurePlan), restoreFailureFileSystem);
  assert.equal(restoreFailureResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(restoreFailureResult.targets[0]?.status, "rollback-blocked");
  assert.equal(restoreFailureFileSystem.files.get("docs/a.md"), "new-a");

  const unreadableRollbackTargets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const unreadablePlan = buildPlan(unreadableRollbackTargets);
  const unreadableFileSystem = new MemoryWriteFileSystem();
  unreadableFileSystem.seedDirectory("docs");
  unreadableFileSystem.seedFile("docs/a.md", "old-a");
  unreadableFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
  unreadableFileSystem.readFaults.set("docs/a.md", { error: errnoError("EIO", "unreadable"), skipCalls: 2 });
  const unreadableResult = await execute(unreadablePlan, confirmPlan(unreadablePlan), unreadableFileSystem);
  assert.equal(unreadableResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(unreadableResult.targets[0]?.status, "rollback-blocked");
  assert.match(unreadableResult.detail ?? "", /manual-review/);

  const removeFailureTargets = buildTargets([
    { path: "docs/a.md", mode: "create", content: "new-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const removeFailurePlan = buildPlan(removeFailureTargets);
  const removeFailureFileSystem = new MemoryWriteFileSystem();
  removeFailureFileSystem.seedDirectory("docs");
  removeFailureFileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
  removeFailureFileSystem.removeFailures.set("docs/a.md", errnoError("EPERM", "removal denied"));
  const removeFailureResult = await execute(removeFailurePlan, confirmPlan(removeFailurePlan), removeFailureFileSystem);
  assert.equal(removeFailureResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(removeFailureResult.targets[0]?.status, "rollback-blocked");
});

test("write errors that still land content are rolled back when attribution is provable", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" }]);
  const plan = buildPlan(targets);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  fileSystem.seedFile("docs/a.md", "old-a");
  fileSystem.writeFaults.set("docs/a.md", { landThenThrow: errnoError("ENOSPC", "late failure") });

  const result = await execute(plan, confirmPlan(plan), fileSystem);
  assert.equal(result.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(result.detail ?? "", /reverted/);
  assert.equal(result.targets[0]?.status, "rolled-back");
  assert.equal(fileSystem.files.get("docs/a.md"), "old-a");

  const unknownFileSystem = new MemoryWriteFileSystem();
  unknownFileSystem.seedDirectory("docs");
  unknownFileSystem.seedFile("docs/a.md", "old-a");
  unknownFileSystem.writeFaults.set("docs/a.md", { writeError: errnoError("ENOSPC", "full") });
  unknownFileSystem.readFaults.set("docs/a.md", { error: errnoError("EIO", "observe failure"), skipCalls: 2 });
  const unknownResult = await execute(plan, confirmPlan(plan), unknownFileSystem);
  assert.equal(unknownResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(unknownResult.targets[0]?.status, "rollback-blocked");
  assert.match(unknownResult.targets[0]?.detail ?? "", /post-write-state-unknown/);
});

test("execute input validation fails closed on malformed invocations", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "create", content: "x" }]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");

  const base = {
    transaction_id: "tx-001",
    plan,
    confirmation_envelope: envelope,
    file_system: fileSystem,
    now: () => new Date(EXECUTION_TIME),
    dry_run: false,
  };

  await assert.rejects(
    executeWriteTransaction({ ...base, dry_run: "yes" as unknown as boolean }),
    WriteTransactionError,
  );
  await assert.rejects(
    executeWriteTransaction({ ...base, now: undefined as unknown as () => Date }),
    WriteTransactionError,
  );
  await assert.rejects(
    executeWriteTransaction({ ...base, now: () => new Date("not-a-date") }),
    WriteTransactionError,
  );
  await assert.rejects(
    executeWriteTransaction({
      ...base,
      file_system: { probe: fileSystem.probe } as unknown as WriteFileSystemPort,
    }),
    WriteTransactionError,
  );
  await assert.rejects(
    executeWriteTransaction({ ...base, confirmation_envelope: { record_type: "bogus" } }),
    /envelope|confirmation/i,
  );
});

test("confirmation rejection covers project and working-baseline mismatches", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "create", content: "x" }]);
  const plan = buildPlan(targets);
  const envelope = confirmPlan(plan);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");

  const foreignProjectPlan = parseWritePlan({
    ...JSON.parse(JSON.stringify(plan)),
    project: { repository_id: `sha256:${"9".repeat(64)}` },
  });
  const foreignProjectEnvelope = confirmPlan(foreignProjectPlan, { project: plan.project });
  const foreignProject = await execute(foreignProjectPlan, foreignProjectEnvelope, fileSystem);
  assert.equal(foreignProject.code, "WRITE_CONFIRMATION_REJECTED");
  assert.match(foreignProject.detail ?? "", /project-mismatch/);

  const driftedWorkingPlan = parseWritePlan({
    ...JSON.parse(JSON.stringify(plan)),
    working_baseline_digest: `sha256:${"8".repeat(64)}`,
  });
  const driftedWorkingEnvelope = confirmPlan(driftedWorkingPlan, {
    working_baseline_digest: WORKING_BASELINE_DIGEST,
  });
  const driftedWorking = await execute(driftedWorkingPlan, driftedWorkingEnvelope, fileSystem);
  assert.equal(driftedWorking.code, "WRITE_CONFIRMATION_REJECTED");
  assert.match(driftedWorking.detail ?? "", /baseline-mismatch/);
  assert.equal(fileSystem.writeCount, 0);
});

test("node adapter rejects unsafe targets and cleans temp files after write failures", async () => {
  await withTemporaryProject(async ({ root }) => {
    await assert.throws(
      () => resolveProjectPath("relative-root", "a.txt"),
      WriteTransactionError,
    );

    const fileSystem = createNodeWriteFileSystem({ project_root: root });
    await writeFile(join(root, "outside.txt"), "outside");
    await symlink(join(root, "outside.txt"), join(root, "link.txt"));
    await mkdir(join(root, "adir"));

    await assert.rejects(
      fileSystem.atomicWrite("link.txt", Buffer.from("x")),
      (error: unknown) => error instanceof WriteTransactionError && error.code === "WRITE_ACCESS_BLOCKED",
    );
    await assert.rejects(
      fileSystem.atomicWrite("adir", Buffer.from("x")),
      (error: unknown) => error instanceof WriteTransactionError && error.code === "WRITE_ACCESS_BLOCKED",
    );

    const lstatFailureFileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        lstat: async () => {
          throw errnoError("EIO", "injected lstat failure");
        },
      },
    });
    await assert.rejects(
      lstatFailureFileSystem.atomicWrite("a.txt", Buffer.from("x")),
      (error: unknown) => errnoError("EIO", "").code === (error as NodeJS.ErrnoException).code,
    );

    let fsyncFailed = false;
    const fsyncFailureFileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        fsync: async () => {
          if (!fsyncFailed) {
            fsyncFailed = true;
            throw errnoError("EIO", "injected fsync failure");
          }
        },
      },
    });
    await assert.rejects(
      fsyncFailureFileSystem.atomicWrite("b.txt", Buffer.from("x")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "EIO",
    );
    const entriesAfterFailure = await readdir(root);
    assert.ok(!entriesAfterFailure.some((entry) => entry.includes(".nextstep-tmp-")));

    const noopUnlinkFileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        unlink: async () => {},
      },
    });
    await writeFile(join(root, "stuck.txt"), "stuck");
    await assert.rejects(
      noopUnlinkFileSystem.removeCreated("stuck.txt"),
      (error: unknown) => error instanceof WriteTransactionError && error.code === "WRITE_ACCESS_BLOCKED",
    );

    await writeFile(join(root, "gone.txt"), "gone");
    await fileSystem.removeCreated("gone.txt");
    const probeAfterRemoval = await fileSystem.probe("gone.txt");
    assert.equal(probeAfterRemoval.exists, false);
    await fileSystem.removeCreated("gone.txt");
  });
});

test("node adapter directory fsync failure does not mask a successful atomic write", async () => {
  await withTemporaryProject(async ({ root }) => {
    let openCalls = 0;
    const fileSystem = createNodeWriteFileSystem({
      project_root: root,
      binding: {
        open: async (path: string, flags: string, mode: number) => {
          openCalls += 1;
          const { open } = await import("node:fs/promises");
          if (openCalls > 1) {
            throw errnoError("EACCES", "directory sync denied");
          }
          return open(path, flags, mode);
        },
      },
    });
    await fileSystem.atomicWrite("a.txt", Buffer.from("content"));
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "content");
  });
});

test("fs probe treats paths through files as missing (ENOTDIR) end to end", async () => {
  await withTemporaryProject(async ({ root }) => {
    await writeFile(join(root, "file.txt"), "x");
    const probe = createNodeFsProbeAdapter();
    const throughFile = await probe.probe(join(root, "file.txt", "child.txt"));
    assert.equal(throughFile.exists, false);
    assert.equal(throughFile.kind, "missing");
  });
});

test("parseWriteTransactionResult fails closed on inconsistent or malformed results", async () => {
  const targets = buildTargets([{ path: "docs/a.md", mode: "create", content: "x" }]);
  const plan = buildPlan(targets);
  const fileSystem = new MemoryWriteFileSystem();
  fileSystem.seedDirectory("docs");
  const committed = await executeSyncPlan(plan, fileSystem);
  const previewed = await executeSyncPlan(plan, (() => {
    const previewFileSystem = new MemoryWriteFileSystem();
    previewFileSystem.seedDirectory("docs");
    return previewFileSystem;
  })(), { dryRun: true });

  assert.throws(() => parseWriteTransactionResult({ record_type: "write-plan" }), WriteTransactionError);
  assert.throws(() => parseWriteTransactionResult({ ...committed, status: "previewed" }), WriteTransactionError);
  assert.throws(
    () => parseWriteTransactionResult({ ...committed, code: "WRITE_PREVIEWED", status: "previewed" }),
    WriteTransactionError,
  );
  assert.throws(
    () => parseWriteTransactionResult({ ...previewed, code: "WRITE_COMMITTED", status: "committed" }),
    WriteTransactionError,
  );
  const tampered = JSON.parse(JSON.stringify(committed)) as Record<string, unknown>;
  tampered.extra_field = true;
  assert.throws(() => parseWriteTransactionResult(tampered), WriteTransactionError);
});

function executeSyncPlan(
  plan: WritePlan,
  fileSystem: WriteFileSystemPort,
  options: ExecuteOptions = {},
): Promise<WriteTransactionResult> {
  return execute(plan, confirmPlan(plan), fileSystem, options);
}

test("probe failures in pre-check fail closed as access blocks", async () => {
  const probeFailureFileSystem = new MemoryWriteFileSystem();
  probeFailureFileSystem.seedDirectory("docs");
  probeFailureFileSystem.probeFaults.set("docs/a.md", errnoError("EIO", "probe failure"));
  const updatePlan = buildPlan(
    buildTargets([{ path: "docs/a.md", mode: "update", content: "n", beforeContent: "old-a" }]),
  );
  const updateResult = await execute(updatePlan, confirmPlan(updatePlan), probeFailureFileSystem, { dryRun: true });
  assert.equal(updateResult.code, "WRITE_ACCESS_BLOCKED");
  assert.match(updateResult.targets[0]?.detail ?? "", /probe-failed:EIO/);

  const parentProbeFailureFileSystem = new MemoryWriteFileSystem();
  parentProbeFailureFileSystem.probeFaults.set("docs", errnoError("EIO", "parent probe failure"));
  const createPlan = buildPlan(buildTargets([{ path: "docs/a.md", mode: "create", content: "x" }]));
  const createResult = await execute(createPlan, confirmPlan(createPlan), parentProbeFailureFileSystem, { dryRun: true });
  assert.equal(createResult.code, "WRITE_ACCESS_BLOCKED");
  assert.match(createResult.targets[0]?.detail ?? "", /parent-probe-failed:EIO/);
});

test("rollback honors post-verification disappearance, mutation and unreadable state", async () => {
  const makeFileSystem = () => {
    const fileSystem = new MemoryWriteFileSystem();
    fileSystem.seedDirectory("docs");
    fileSystem.writeFaults.set("docs/b.md", { writeError: errnoError("ENOSPC", "full") });
    return fileSystem;
  };
  const twoCreateTargets = buildTargets([
    { path: "docs/a.md", mode: "create", content: "new-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);
  const updateAndCreateTargets = buildTargets([
    { path: "docs/a.md", mode: "update", content: "new-a", beforeContent: "old-a" },
    { path: "docs/b.md", mode: "create", content: "new-b" },
  ]);

  // create target disappears after verification: baseline absence is already proven.
  const vanishedCreateFileSystem = makeFileSystem();
  const vanishedCreateOriginalRead = vanishedCreateFileSystem.readContent.bind(vanishedCreateFileSystem);
  let vanishedCreateReads = 0;
  vanishedCreateFileSystem.readContent = async (path: string) => {
    const content = await vanishedCreateOriginalRead(path);
    if (path === "docs/a.md") {
      vanishedCreateReads += 1;
      if (vanishedCreateReads === 1) {
        vanishedCreateFileSystem.files.delete("docs/a.md");
      }
    }
    return content;
  };
  const vanishedCreatePlan = buildPlan(twoCreateTargets);
  const vanishedCreateResult = await execute(vanishedCreatePlan, confirmPlan(vanishedCreatePlan), vanishedCreateFileSystem);
  assert.equal(vanishedCreateResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(vanishedCreateResult.detail ?? "", /reverted/);
  assert.equal(vanishedCreateResult.targets[0]?.status, "rolled-back");

  // update target disappears after verification: restoration is no longer provable.
  const vanishedUpdateFileSystem = makeFileSystem();
  vanishedUpdateFileSystem.seedFile("docs/a.md", "old-a");
  const vanishedUpdateOriginalRead = vanishedUpdateFileSystem.readContent.bind(vanishedUpdateFileSystem);
  let vanishedUpdateReads = 0;
  vanishedUpdateFileSystem.readContent = async (path: string) => {
    const content = await vanishedUpdateOriginalRead(path);
    if (path === "docs/a.md") {
      vanishedUpdateReads += 1;
      if (vanishedUpdateReads === 3) {
        vanishedUpdateFileSystem.files.delete("docs/a.md");
      }
    }
    return content;
  };
  const vanishedUpdatePlan = buildPlan(updateAndCreateTargets);
  const vanishedUpdateResult = await execute(vanishedUpdatePlan, confirmPlan(vanishedUpdatePlan), vanishedUpdateFileSystem);
  assert.equal(vanishedUpdateResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.match(vanishedUpdateResult.detail ?? "", /manual-review/);
  assert.equal(vanishedUpdateResult.targets[0]?.status, "rollback-blocked");

  // update target mutated after verification: attribution is no longer provable.
  const mutatedFileSystem = makeFileSystem();
  mutatedFileSystem.seedFile("docs/a.md", "old-a");
  const mutatedOriginalRead = mutatedFileSystem.readContent.bind(mutatedFileSystem);
  let mutatedReads = 0;
  mutatedFileSystem.readContent = async (path: string) => {
    const content = await mutatedOriginalRead(path);
    if (path === "docs/a.md") {
      mutatedReads += 1;
      if (mutatedReads === 3) {
        mutatedFileSystem.files.set("docs/a.md", "post-verification-edit");
      }
    }
    return content;
  };
  const mutatedPlan = buildPlan(updateAndCreateTargets);
  const mutatedResult = await execute(mutatedPlan, confirmPlan(mutatedPlan), mutatedFileSystem);
  assert.equal(mutatedResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(mutatedResult.targets[0]?.status, "rollback-blocked");
  assert.equal(mutatedFileSystem.files.get("docs/a.md"), "post-verification-edit");

  // rollback read itself fails: block instead of guessing.
  const unreadableFileSystem = makeFileSystem();
  unreadableFileSystem.seedFile("docs/a.md", "old-a");
  unreadableFileSystem.readFaults.set("docs/a.md", { error: errnoError("EIO", "rollback read failure"), skipCalls: 3 });
  const unreadablePlan = buildPlan(updateAndCreateTargets);
  const unreadableResult = await execute(unreadablePlan, confirmPlan(unreadablePlan), unreadableFileSystem);
  assert.equal(unreadableResult.code, "WRITE_PARTIAL_BLOCKED");
  assert.equal(unreadableResult.targets[0]?.status, "rollback-blocked");
  assert.match(unreadableResult.detail ?? "", /manual-review/);
});

test("write target path validation rejects unsafe segments", () => {
  for (const unsafe of ["~foo/a.md", "a/b:c.md", "a/./b.md", "a//b.md", "a\\b.md", ".", "/a.md", "~"]) {
    assert.throws(() => assertWriteTargetPath(unsafe), WriteTransactionError);
  }
  assert.equal(assertWriteTargetPath("docs/ok.md"), "docs/ok.md");
  assert.throws(() => assertWriteTargetPath(42), WriteTransactionError);
});
