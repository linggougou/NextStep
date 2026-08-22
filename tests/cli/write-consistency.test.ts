import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { createNodeWriteFileSystem } from "../../src/adapters/node/file-write.ts";
import {
  runCandidateChangePreview,
  runWriteTransaction,
  createNodeCandidateChangeProbe,
  createNodeProjectRootProbe,
  type CandidateChangePreviewContext,
  type WriteTransactionCliContext,
} from "../../src/cli/write-consistency.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import {
  deriveWorkingBaselineDigest,
  digestFileContent,
  type CandidateChange,
} from "../../src/domain/candidate-change.ts";
import { assertWriteCommandPolicy } from "../../src/domain/command-policy.ts";
import {
  createUnverifiedWriteConfirmationAction,
  createUnverifiedWriteConfirmationViewDisplay,
  createWriteConfirmationChallenge,
  createWriteConfirmationEnvelope,
  verifyWriteConfirmationInteraction,
} from "../../src/domain/confirmation-node.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  projectContextDigest,
  resolveProjectContext,
  type ProjectContext,
  type ProjectRootProbe,
} from "../../src/domain/project-context.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import {
  digestUtf8Content,
  type WritePlan,
} from "../../src/domain/write-transaction.ts";

const execFileAsync = promisify(execFile);

async function runGit(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", ["-c", "user.name=NextStep Fixture", "-c", "user.email=fixture@nextstep.invalid", ...args], { cwd: root });
  return result.stdout.trim();
}

interface WriteFixture {
  readonly baseline: { readonly files: readonly { readonly path: string; readonly content: string }[] };
  readonly candidate_change: { readonly writes: readonly { readonly path: string; readonly content: string }[] };
  readonly target_project: {
    readonly project_id: string;
    readonly repository_id: `sha256:${string}`;
    readonly formal_baseline: string;
  };
}

function fakeIo(input: string, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return Buffer.from(input, "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

function memoryProjectProbe(root: string, files: ReadonlyMap<string, string>): ProjectRootProbe {
  const directories = new Set<string>([root]);
  for (const path of files.keys()) {
    let current = dirname(path);
    while (current.startsWith(root)) {
      directories.add(current);
      if (current === root) break;
      current = dirname(current);
    }
  }
  return {
    exists: (path) => files.has(path) || directories.has(path),
    isDirectory: (path) => directories.has(path),
    isSymbolicLink: () => false,
    isReadable: (path) => files.has(path) || directories.has(path),
    isWritable: (path) => files.has(path) || directories.has(path),
    realpath: (path) => path,
    readFileUtf8: (path) => {
      const value = files.get(path);
      if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value;
    },
  };
}

function candidateProbe(root: string, files: ReadonlyMap<string, string>) {
  return {
    exists: (path: string) => files.has(path) || [...files.keys()].some((entry) => entry.startsWith(`${path}/`)),
    isDirectory: (path: string) => path === root || [...files.keys()].some((entry) => entry.startsWith(`${path}/`)),
    isWritable: () => true,
    realpath: (path: string) => path,
    readFileUtf8: (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value;
    },
  };
}

function normalizedRouteLock(projectId: string): string {
  return [
    "# PROJECT_ROUTE_LOCK",
    "",
    "- 生命周期阶段: S5 / P5",
    "- 阶段名称: V1 / M1.2 / S1.5",
    "- 里程碑编号: M1.2",
    `- project_id: ${projectId}`,
    "",
  ].join("\n");
}

async function loadFixture(name: string): Promise<WriteFixture> {
  return JSON.parse(await readFile(resolve(process.cwd(), `tests/fixtures/write-consistency/positive/${name}-write.json`), "utf8")) as WriteFixture;
}

function buildContext(
  root: string,
  fixture: WriteFixture,
  files: ReadonlyMap<string, string>,
): ProjectContext {
  return resolveProjectContext({
    workspace_roots: [root],
    requested_project: fixture.target_project.project_id,
    explicit_canonical_root: root,
    action_summary: "预览并回写已确认的候选变更",
  }, memoryProjectProbe(root, files));
}

function buildPlan(fixture: WriteFixture, context: ProjectContext, files: ReadonlyMap<string, string>): WritePlan {
  const baseline = { head_oid: "a".repeat(40), dirty: false };
  return {
    schema_version: "1.0",
    record_type: "write-plan",
    plan_id: `write-plan-${fixture.target_project.project_id}`,
    project: { repository_id: fixture.target_project.repository_id },
    project_context_digest: projectContextDigest(context),
    formal_baseline: fixture.target_project.formal_baseline,
    working_baseline_digest: deriveWorkingBaselineDigest(baseline),
    targets: fixture.candidate_change.writes.map(({ path, content }) => {
      const before = files.get(join(context.project_root, path));
      return {
        path,
        mode: before === undefined ? "create" as const : "update" as const,
        before_digest: before === undefined ? null : digestUtf8Content(before),
        after_digest: digestUtf8Content(content),
        content,
      };
    }),
    created_at: "2026-08-14T00:00:00.000Z",
  };
}

function buildCandidate(fixture: WriteFixture, context: ProjectContext, plan: WritePlan): CandidateChange {
  return {
    schema_version: "1.0",
    record_type: "candidate-change",
    candidate_change_id: `candidate-change-${fixture.target_project.project_id}`,
    project: {
      repository_id: fixture.target_project.repository_id,
      formal_baseline: fixture.target_project.formal_baseline,
    },
    project_context_digest: projectContextDigest(context),
    working_baseline: {
      head_oid: "a".repeat(40),
      dirty: false,
      baseline_digest: plan.working_baseline_digest,
    },
    targets: plan.targets.map(({ path, mode, before_digest, after_digest, content }) => ({
      path,
      kind: mode,
      before_digest,
      after_digest,
      after_content: content,
    })),
    impact_summary: "只修改 fixture 声明的目标文件",
    signoff_consequence: "全部写入和重读验证成功前不提升阶段状态",
    expires_at: "2026-08-14T00:10:00Z",
  };
}

function buildEnvelope(plan: WritePlan) {
  const challenge = createWriteConfirmationChallenge({
    project: plan.project,
    project_context_digest: plan.project_context_digest,
    formal_baseline: plan.formal_baseline,
    working_baseline_digest: plan.working_baseline_digest,
    candidate_digest: digestJson(plan),
    targets: plan.targets.map(({ path, mode, before_digest, after_digest }) => ({ path, mode, before_digest, after_digest })),
    confirmation_id: `confirmation-${plan.plan_id}`,
    proposer_id: "integration-proposer",
    created_at: "2026-08-14T00:01:00.000Z",
    expires_at: "2026-08-14T00:09:00.000Z",
  });
  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: `display-${plan.plan_id}`,
    displayed_at: "2026-08-14T00:02:00.000Z",
  });
  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: `action-${plan.plan_id}`,
    actor_id: "fixture-user",
    action: "confirm",
    occurred_at: "2026-08-14T00:03:00.000Z",
  });
  return createWriteConfirmationEnvelope(verifyWriteConfirmationInteraction(
    { display, user_action: action },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  ));
}

test("S1.5 主对话和无集成能力的直接 CLI 均不得写目标项目", async () => {
  const input = canonicalizeJson({ transaction_id: "tx-denied", project_context: {}, write_plan: {} });
  for (const context of [undefined, { actor_role: "main-conversation-agent" } as unknown as WriteTransactionCliContext]) {
    const { io, output, diagnostics, exitCodes } = fakeIo(input, ["--commit"]);
    await runWriteTransaction(io, context);
    assert.equal(output.length, 1);
    const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
    assert.equal(receipt.ok, false);
    assert.equal(receipt.code, "WRITE_ACCESS_BLOCKED");
    assert.deepEqual(exitCodes, [1]);
    assert.equal(diagnostics.length, 1);
  }
});

test("S1.5 CLI 的 Node 同步探针覆盖真实目录、文件、缺失路径与读取", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-sync-probe-"));
  try {
    const file = join(root, "probe.txt");
    await writeFile(file, "probe\n", "utf8");
    const projectProbe = createNodeProjectRootProbe();
    assert.equal(projectProbe.exists(file), true);
    assert.equal(projectProbe.isDirectory(root), true);
    assert.equal(projectProbe.isDirectory(join(root, "missing")), false);
    assert.equal(projectProbe.isSymbolicLink(file), false);
    assert.equal(projectProbe.isSymbolicLink(join(root, "missing")), false);
    assert.equal(projectProbe.isReadable(file), true);
    assert.equal(projectProbe.isWritable(file), true);
    const canonicalRoot = projectProbe.realpath(root);
    assert.equal(canonicalRoot.endsWith(root.split("/").at(-1)!), true);
    assert.equal(projectProbe.readFileUtf8(file), "probe\n");

    const candidate = createNodeCandidateChangeProbe();
    assert.equal(candidate.exists(file), true);
    assert.equal(candidate.isDirectory(root), true);
    assert.equal(candidate.isDirectory(join(root, "missing")), false);
    assert.equal(candidate.isWritable(file), true);
    assert.equal(candidate.realpath(root), canonicalRoot);
    assert.equal(candidate.readFileUtf8(file), "probe\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("S1.5 command policy 只允许集成职责在显式确认后 commit，execution 只能 dry-run", () => {
  assert.doesNotThrow(() => assertWriteCommandPolicy({
    command: "write-transaction",
    dry_run: true,
    actor_role: "execution-agent",
    explicit_confirmation: false,
  }));
  assert.doesNotThrow(() => assertWriteCommandPolicy({
    command: "write-transaction",
    dry_run: false,
    actor_role: "integration-agent",
    explicit_confirmation: true,
  }));
  for (const invocation of [
    { command: "write-transaction", dry_run: false, actor_role: "execution-agent", explicit_confirmation: true },
    { command: "write-transaction", dry_run: false, actor_role: "integration-agent", explicit_confirmation: false },
    { command: "write-transaction", dry_run: true, actor_role: "main-conversation-agent", explicit_confirmation: true },
  ]) assert.throws(() => assertWriteCommandPolicy(invocation), /integration|confirmation|main conversation|write/i);
});

test("S1.5 三类 fixture 完成入口预览→显式确认→dry-run→回写→重读，stdout 始终单一 JCS 回执", async (t) => {
  for (const name of ["community-workshop", "expense-reminder", "project-delivery-tool"]) {
    await t.test(name, async () => {
      const fixture = await loadFixture(name);
      const root = await mkdtemp(join(tmpdir(), `nextstep-${name}-`));
      try {
        const files = new Map<string, string>();
        for (const entry of fixture.baseline.files) {
          const content = entry.path === "PROJECT_ROUTE_LOCK.md"
            ? normalizedRouteLock(fixture.target_project.project_id)
            : entry.content;
          const path = join(root, entry.path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content, "utf8");
          files.set(path, content);
        }
        await runGit(root, ["init", "-q"]);
        await runGit(root, ["add", "."]);
        await runGit(root, ["commit", "-q", "-m", `fixture baseline: ${name}`]);
        const baselineHead = await runGit(root, ["rev-parse", "HEAD"]);
        const baselineTree = await runGit(root, ["rev-parse", "HEAD^{tree}"]);
        const context = buildContext(root, fixture, files);
        const plan = buildPlan(fixture, context, files);
        const candidate = buildCandidate(fixture, context, plan);
        const previewInput = canonicalizeJson({
          project_resolution: {
            workspace_roots: [root],
            requested_project: fixture.target_project.project_id,
            explicit_canonical_root: root,
            action_summary: "预览并回写已确认的候选变更",
          },
          candidate_change: candidate,
          working_baseline: { head_oid: "a".repeat(40), dirty: false },
        });
        const previewContext: CandidateChangePreviewContext = {
          project_probe: memoryProjectProbe(root, files),
          candidate_probe: candidateProbe(root, files),
          now: () => new Date("2026-08-14T00:04:00.000Z"),
        };
        const previewIo = fakeIo(previewInput);
        await runCandidateChangePreview(previewIo.io, previewContext);
        assert.deepEqual(previewIo.diagnostics, []);
        assert.deepEqual(previewIo.exitCodes, []);
        assert.equal(previewIo.output.length, 1);
        assert.equal(parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(previewIo.output[0]!, "utf8"))).code, "CANDIDATE_CHANGE_PREVIEWED");

        const envelope = buildEnvelope(plan);
        const nodeFileSystem = createNodeWriteFileSystem({ project_root: root });
        let atomicWrites = 0;
        let removals = 0;
        const fileSystem = {
          probe: nodeFileSystem.probe,
          readContent: nodeFileSystem.readContent,
          async atomicWrite(path: string, content: Uint8Array) {
            atomicWrites += 1;
            await nodeFileSystem.atomicWrite(path, content);
          },
          async removeCreated(path: string) {
            removals += 1;
            await nodeFileSystem.removeCreated(path);
          },
        };
        const runnerContext: WriteTransactionCliContext = {
          actor_role: "integration-agent",
          confirmation_envelope: envelope,
          file_system: fileSystem,
          now: () => new Date("2026-08-14T00:05:00.000Z"),
        };
        const input = canonicalizeJson({ transaction_id: `tx-${name}`, project_context: context, write_plan: plan });
        const dryRun = fakeIo(input, ["--dry-run"]);
        await runWriteTransaction(dryRun.io, runnerContext);
        assert.deepEqual(dryRun.diagnostics, []);
        assert.deepEqual(dryRun.exitCodes, []);
        assert.equal(parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(dryRun.output[0]!, "utf8"))).code, "WRITE_PREVIEWED");
        assert.equal(atomicWrites, 0);
        assert.equal(removals, 0);
        assert.equal(await runGit(root, ["rev-parse", "HEAD"]), baselineHead);
        assert.equal(await runGit(root, ["rev-parse", "HEAD^{tree}"]), baselineTree);
        assert.equal(await runGit(root, ["status", "--porcelain"]), "");
        for (const target of plan.targets) {
          const baseline = files.get(join(root, target.path));
          if (baseline === undefined) await assert.rejects(readFile(join(root, target.path)));
          else assert.equal(await readFile(join(root, target.path), "utf8"), baseline);
        }

        if (name === "community-workshop") {
          const update = plan.targets.find((target) => target.mode === "update");
          assert.ok(update !== undefined);
          await writeFile(join(root, update.path), "确认后外部修改，不得覆盖\n", "utf8");
          const conflict = fakeIo(input, ["--commit"]);
          await runWriteTransaction(conflict.io, runnerContext);
          const conflictReceipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(conflict.output[0]!, "utf8")));
          assert.equal(conflictReceipt.code, "WRITE_CONFLICT_REJECTED");
          assert.deepEqual(conflict.exitCodes, [1]);
          assert.equal(await readFile(join(root, update.path), "utf8"), "确认后外部修改，不得覆盖\n");
          const baseline = files.get(join(root, update.path));
          assert.notEqual(baseline, undefined);
          await writeFile(join(root, update.path), baseline!, "utf8");
        }

        if (name === "project-delivery-tool") {
          const expired = fakeIo(input, ["--commit"]);
          await runWriteTransaction(expired.io, {
            ...runnerContext,
            now: () => new Date("2026-08-14T00:09:00.000Z"),
          });
          assert.equal(
            parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(expired.output[0]!, "utf8"))).code,
            "WRITE_CONFIRMATION_REJECTED",
          );
          assert.deepEqual(expired.exitCodes, [1]);
          assert.equal(atomicWrites, 0);
        }

        const commit = fakeIo(input, ["--commit"]);
        await runWriteTransaction(commit.io, runnerContext);
        assert.deepEqual(commit.diagnostics, []);
        assert.deepEqual(commit.exitCodes, []);
        assert.equal(commit.output.length, 1);
        assert.equal(parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(commit.output[0]!, "utf8"))).code, "WRITE_COMMITTED");
        for (const target of plan.targets) {
          assert.equal(await readFile(join(root, target.path), "utf8"), target.content);
        }
        await runGit(root, ["add", "."]);
        await runGit(root, ["commit", "-q", "-m", `fixture write: ${name}`]);
        assert.notEqual(await runGit(root, ["rev-parse", "HEAD"]), baselineHead);
        for (const target of plan.targets) {
          assert.equal(await runGit(root, ["show", `HEAD:${target.path}`]), target.content.trim());
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("S1.5 candidate preview 对领域可表达但 write-plan 不支持的 delete 目标 fail closed", async () => {
  const root = "/workspace/delete-target";
  const routeLock = normalizedRouteLock("delete-target");
  const targetContent = "保留我\n";
  const files = new Map([
    [join(root, "PROJECT_ROUTE_LOCK.md"), routeLock],
    [join(root, "docs/keep.md"), targetContent],
  ]);
  const project = resolveProjectContext({
    workspace_roots: [root],
    requested_project: "delete-target",
    explicit_canonical_root: root,
  }, memoryProjectProbe(root, files));
  const workingBaseline = { head_oid: "b".repeat(40), dirty: false };
  const candidate: CandidateChange = {
    schema_version: "1.0",
    record_type: "candidate-change",
    candidate_change_id: "candidate-change-delete-target",
    project: { repository_id: `sha256:${"1".repeat(64)}`, formal_baseline: "c".repeat(40) },
    project_context_digest: projectContextDigest(project),
    working_baseline: { ...workingBaseline, baseline_digest: deriveWorkingBaselineDigest(workingBaseline) },
    targets: [{
      path: "docs/keep.md",
      kind: "delete",
      before_digest: digestFileContent(targetContent),
      after_digest: null,
    }],
    impact_summary: "删除目标",
    signoff_consequence: "必须显式确认",
    expires_at: "2026-08-14T00:10:00Z",
  };
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson({
    project_resolution: {
      workspace_roots: [root],
      requested_project: "delete-target",
      explicit_canonical_root: root,
    },
    candidate_change: candidate,
    working_baseline: workingBaseline,
  }));
  await runCandidateChangePreview(io, {
    project_probe: memoryProjectProbe(root, files),
    candidate_probe: candidateProbe(root, files),
    now: () => new Date("2026-08-14T00:04:00.000Z"),
  });
  assert.equal(parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8"))).code, "CANDIDATE_CHANGE_REJECTED");
  assert.deepEqual(exitCodes, [1]);
  assert.equal(diagnostics.length, 1);
  assert.equal(files.get(join(root, "docs/keep.md")), targetContent);
});

test("S1.5 阶段守卫拒绝非 S1.5 路线锁且失败仅写一个回执", async () => {
  const root = "/workspace/off-stage";
  const routeLock = normalizedRouteLock("off-stage").replace("S1.5", "S1.6");
  const files = new Map([[join(root, "PROJECT_ROUTE_LOCK.md"), routeLock]]);
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson({
    project_resolution: {
      workspace_roots: ["/workspace"],
      requested_project: "off-stage",
      explicit_canonical_root: root,
    },
    candidate_change: {},
    working_baseline: { head_oid: "a".repeat(40), dirty: false },
  }));
  await runCandidateChangePreview(io, {
    project_probe: memoryProjectProbe(root, files),
    candidate_probe: candidateProbe(root, files),
    now: () => new Date("2026-08-14T00:04:00.000Z"),
  });
  assert.equal(output.length, 1);
  assert.equal(parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8"))).code, "WRITE_ACCESS_BLOCKED");
  assert.deepEqual(exitCodes, [1]);
  assert.equal(diagnostics.length, 1);
});

test("S1.5 写入冲突回执与 PROFILE_CONFLICT_REJECTED 并存且不互相降级", () => {
  for (const code of ["WRITE_CONFLICT_REJECTED", "WRITE_PARTIAL_BLOCKED", "WRITE_ACCESS_BLOCKED", "PROFILE_CONFLICT_REJECTED"] as const) {
    assert.equal(parseMachineReceipt({
      schema_version: "1.0",
      receipt_id: `receipt-${code.toLowerCase()}`,
      ok: false,
      code,
      data: { dry_run: false },
    }).code, code);
  }
});
