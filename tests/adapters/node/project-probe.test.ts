import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import test from "node:test";

import {
  ProjectProbeInterruptedError,
  deriveNodeProjectProbeBinding,
  runProjectProbe,
  type ProjectProbeOperationEvidence,
  type ProjectProbeOperationPort,
} from "../../../src/adapters/node/project-probe.ts";
import type { CapabilityPreflightRequest } from "../../../src/domain/capability-preflight.ts";
import { digestJson } from "../../../src/domain/content-digest.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function makeRepository(parent?: string, name = "fixture-project") {
  const workspace = parent ?? await mkdtemp(resolve(tmpdir(), "nextstep-preflight-workspace-"));
  const root = resolve(workspace, name);
  await mkdir(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await writeFile(resolve(root, "seed.txt"), "seed\n");
  git(root, "add", "seed.txt");
  git(root, "commit", "-qm", "formal");
  const formal = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/nextstep/formal", formal);
  const tree = git(root, "rev-parse", "HEAD^{tree}");
  const control = execFileSync("git", ["-C", root, "commit-tree", tree, "-p", formal, "-m", "control"], { encoding: "utf8" }).trim();
  git(root, "update-ref", "refs/nextstep/control", control);
  const evidenceRoot = await mkdtemp(resolve(tmpdir(), "nextstep-preflight-evidence-"));
  return { workspace, root, evidenceRoot, ownWorkspace: parent === undefined };
}

function operations(overrides: Partial<ProjectProbeOperationPort> = {}): ProjectProbeOperationPort {
  const result: ProjectProbeOperationEvidence = {
    task_id: "probe-task-1",
    content_identity: digestJson({ payload: "stable-probe" }),
    envelope_roundtrip: true,
    immutable_candidate: true,
    readonly_validation: true,
    acknowledgement_recovery: true,
    final_snapshot: true,
    external_evidence: true,
    anchor: true,
    expected_old_cas: true,
    final_verification: true,
    atomic_create_or_return: true,
  };
  return {
    async run() { return result; },
    async recover() { return result; },
    async archive() { return true; },
    ...overrides,
  };
}

function requestFor(
  fixture: Awaited<ReturnType<typeof makeRepository>>,
  workspaceRoots = [fixture.workspace],
  explicitRoot = fixture.root,
): CapabilityPreflightRequest {
  const projectName = basename(fixture.root);
  const actual = deriveNodeProjectProbeBinding(fixture.root, projectName);
  return {
    schema_version: "1.0",
    record_type: "capability-preflight-request",
    expected_binding: {
      host_id: "codex-local",
      host_version: "0.144.1",
      permission_configuration_id: "perm-isolated-v1",
      repository_id: actual.repository_id,
      worktree_id: actual.worktree_id,
      formal_oid: actual.formal_oid,
      control_oid: actual.control_oid,
    },
    probe: {
      requested_project: projectName,
      workspace_roots: workspaceRoots,
      explicit_project_root: explicitRoot,
      expected_start_oid: actual.start_oid,
      external_evidence_root: fixture.evidenceRoot,
    },
    validity_seconds: 300,
  };
}

async function cleanup(context: test.TestContext, fixture: Awaited<ReturnType<typeof makeRepository>>) {
  context.after(async () => {
    if (fixture.ownWorkspace) await rm(fixture.workspace, { recursive: true, force: true });
    await rm(fixture.evidenceRoot, { recursive: true, force: true });
  });
}

test("clean 隔离仓库完整探针通过且 formal/control/业务树与工作树保持不变", async (context) => {
  const fixture = await makeRepository();
  await cleanup(context, fixture);
  const before = {
    formal: git(fixture.root, "rev-parse", "refs/nextstep/formal"),
    control: git(fixture.root, "rev-parse", "refs/nextstep/control"),
    tree: git(fixture.root, "rev-parse", "HEAD^{tree}"),
    status: git(fixture.root, "status", "--porcelain=v1", "--ignored", "--untracked-files=all"),
  };
  const evidence = await runProjectProbe(requestFor(fixture), operations());
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.start_state, "clean");
  assert.equal(evidence.atomic_create_or_return, true);
  assert.equal(evidence.automatic_archive, true);
  assert.deepEqual({
    formal: git(fixture.root, "rev-parse", "refs/nextstep/formal"),
    control: git(fixture.root, "rev-parse", "refs/nextstep/control"),
    tree: git(fixture.root, "rev-parse", "HEAD^{tree}"),
    status: git(fixture.root, "status", "--porcelain=v1", "--ignored", "--untracked-files=all"),
  }, before);
});

test("nested repo、同名项目、symlink 越界和权限不足全部 blocked", async (context) => {
  const outer = await makeRepository(undefined, "outer");
  await cleanup(context, outer);
  const nested = await makeRepository(outer.root, "fixture-project");
  await cleanup(context, nested);
  assert.equal((await runProjectProbe(requestFor(nested, [outer.workspace]), operations())).status, "blocked");

  const first = await makeRepository();
  const second = await makeRepository();
  await cleanup(context, first);
  await cleanup(context, second);
  assert.equal((await runProjectProbe(requestFor(first, [first.workspace, second.workspace]), operations())).status, "blocked");

  const target = await makeRepository();
  await cleanup(context, target);
  const link = resolve(dirname(target.root), "fixture-project-link");
  await symlink(target.root, link);
  context.after(() => rm(link, { force: true }));
  const linkRequest = requestFor(target, [target.workspace], link);
  assert.equal((await runProjectProbe(linkRequest, operations())).status, "blocked");

  const denied = await makeRepository();
  await cleanup(context, denied);
  const deniedRequest = requestFor(denied);
  await chmod(denied.root, 0o000);
  try {
    assert.equal((await runProjectProbe(deniedRequest, operations())).status, "blocked");
  } finally {
    await chmod(denied.root, 0o700);
  }
});

test("staged/unstaged/untracked/ignored 起点均被识别且不得误判 clean/full", async (context) => {
  const cases = ["staged", "unstaged", "untracked", "ignored"] as const;
  for (const kind of cases) {
    const fixture = await makeRepository();
    await cleanup(context, fixture);
    if (kind === "staged") {
      await writeFile(resolve(fixture.root, "staged.txt"), "staged\n");
      git(fixture.root, "add", "staged.txt");
    } else if (kind === "unstaged") {
      await writeFile(resolve(fixture.root, "seed.txt"), "changed\n");
    } else if (kind === "untracked") {
      await writeFile(resolve(fixture.root, "untracked.txt"), "untracked\n");
    } else {
      await writeFile(resolve(fixture.root, ".gitignore"), "ignored.txt\n");
      git(fixture.root, "add", ".gitignore");
      git(fixture.root, "commit", "-qm", "ignore rule");
      git(fixture.root, "update-ref", "refs/nextstep/formal", git(fixture.root, "rev-parse", "HEAD"));
      const tree = git(fixture.root, "rev-parse", "HEAD^{tree}");
      const formal = git(fixture.root, "rev-parse", "HEAD");
      const control = execFileSync("git", ["-C", fixture.root, "commit-tree", tree, "-p", formal, "-m", "control ignored"], { encoding: "utf8" }).trim();
      git(fixture.root, "update-ref", "refs/nextstep/control", control);
      await writeFile(resolve(fixture.root, "ignored.txt"), "ignored\n");
    }
    const evidence = await runProjectProbe(requestFor(fixture), operations());
    assert.equal(evidence.status, "blocked", kind);
    assert.equal(evidence.start_state, kind, kind);
  }
});

test("中断、ACK 丢失/重复与归档失败按同一内容身份恢复；身份冲突则 blocked", async (context) => {
  const fixture = await makeRepository();
  await cleanup(context, fixture);
  const stable = operations();
  const interrupted = operations({
    async run() { throw new ProjectProbeInterruptedError("injected interruption"); },
    recover: stable.recover,
    async archive() { return false; },
  });
  const recovered = await runProjectProbe(requestFor(fixture), interrupted);
  assert.equal(recovered.status, "passed");
  assert.equal(recovered.automatic_archive, false);
  assert.ok(recovered.checks.includes("same-content-recovery"));

  const conflict = await runProjectProbe(requestFor(fixture), operations({
    async recover() {
      return { ...(await stable.recover("x", "y")), content_identity: digestJson({ payload: "different" }) };
    },
  }));
  assert.equal(conflict.status, "blocked");
  assert.ok(conflict.blockers.includes("PROBE_RECOVERY_IDENTITY_CONFLICT"));
});

test("敏感探针值只产生通用阻塞，不进入证据或错误", async (context) => {
  const fixture = await makeRepository();
  await cleanup(context, fixture);
  const secret = "sk-sensitive-probe-value-123456";
  const evidence = await runProjectProbe(requestFor(fixture), operations({
    async run() { return { ...(await operations().run("x", "y")), task_id: secret }; },
  }));
  assert.equal(evidence.status, "blocked");
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secret));
  assert.equal(await readFile(resolve(fixture.root, "seed.txt"), "utf8"), "seed\n");
});
