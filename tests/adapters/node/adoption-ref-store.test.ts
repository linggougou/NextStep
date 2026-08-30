import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { readAdoptionInspectSource } from "../../../src/adapters/node/adoption-inspect-source.ts";
import { readProjectStatusSource } from "../../../src/adapters/node/project-status-source.ts";
import {
  AdoptionRefStoreError,
  activateAdoption,
  rollbackAdoption,
} from "../../../src/adapters/node/adoption-ref-store.ts";
import { createAdoptionCandidate } from "../../../src/domain/adoption-candidate.ts";
import { createAdoptionConfirmationView, verifyAdoptionConfirmation } from "../../../src/domain/adopted-baseline.ts";
import { canonicalizeJson } from "../../../src/domain/canonical-json.ts";
import { projectProjectStatus } from "../../../src/domain/project-status-projection.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function gitInput(root: string, input: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", input }).trim();
}

function successorControl(root: string, parent: string, candidate: any, copyMarkers: boolean, mutatedBaseline = false): string {
  const checkpoint = {
    schema_version: "1.0", repository_id: candidate.repository_identity, route_generation: 1,
    plan_id: "adopted-existing-project", plan_generation: 1,
    formal_ref: "refs/nextstep/formal", formal_oid: candidate.candidate_head_oid,
    control_parent_oid: parent, highest_task_attempts: { "POST-ADOPT": 1 },
    next_stage: "POST-ADOPT generation 1 attempt 1 running; independent acceptance remains gated",
    updated_at: "2026-08-30T09:05:00.000Z", adoption_state: "rollback-blocked",
  };
  const registry = {
    schema_version: "1.0", repository_id: candidate.repository_identity, route_generation: 1,
    plan_id: "adopted-existing-project", plan_generation: 1,
    tasks: [{ stage_id: "S5/POST-ADOPT", task_id: "POST-ADOPT", task_attempt: 1,
      highest_confirmed_generation: 1, status: "running", updated_at: "2026-08-30T09:05:00.000Z" }],
  };
  const entries = [
    `100644 blob ${gitInput(root, JSON.stringify(checkpoint), "hash-object", "-w", "--stdin")}\tcheckpoint.json`,
    `100644 blob ${gitInput(root, JSON.stringify(registry), "hash-object", "-w", "--stdin")}\tregistry.json`,
  ];
  if (copyMarkers) {
    entries.push(`100644 blob ${git(root, "rev-parse", `${parent}:activation.json`)}\tactivation.json`);
    const baseline = mutatedBaseline
      ? gitInput(root, JSON.stringify({ forged: true }), "hash-object", "-w", "--stdin")
      : git(root, "rev-parse", `${parent}:adopted-baseline.json`);
    entries.push(`100644 blob ${baseline}\tadopted-baseline.json`);
  }
  const tree = gitInput(root, `${entries.sort().join("\n")}\n`, "mktree");
  return git(root, "commit-tree", tree, "-p", parent, "-m", "post adoption task");
}

async function repository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-activation-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await mkdir(resolve(root, "docs/exec-plans/active"), { recursive: true });
  await mkdir(resolve(root, ".codex"), { recursive: true });
  await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "route\n");
  await writeFile(resolve(root, "docs/exec-plans/active/current.md"), "plan\n");
  await writeFile(resolve(root, ".codex/verification-report.md"), "evidence\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  return root;
}

async function input(root: string) {
  const now = new Date("2026-08-30T09:00:00.000Z");
  const candidate = createAdoptionCandidate(await readAdoptionInspectSource({
    projectRoot: root,
    routeLockPath: "PROJECT_ROUTE_LOCK.md",
    activePlanPath: "docs/exec-plans/active/current.md",
    evidencePaths: [".codex/verification-report.md"],
  }, { now: () => now }));
  const projection = { stage: "S5", milestone: "M1", scope: "existing-project-baseline" } as const;
  const confirmationView = createAdoptionConfirmationView(candidate, projection);
  const verifier = {
    verifier_kind: "trusted-host" as const,
    verify: () => true,
    reconstructConfirmationView: () => confirmationView,
  };
  const confirmation = verifyAdoptionConfirmation(candidate, {
    candidate_digest: candidate.candidate_digest,
    confirmation_view: confirmationView,
    displayed_view_digest: confirmationView.view_digest,
    user_action_ref: "host-user-action-1",
    session_identity: `sha256:${"b".repeat(64)}`,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:01:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "activation-nonce-1",
    decision: "confirm",
  }, verifier, () => new Date("2026-08-30T09:02:00.000Z"));
  return { candidate, confirmation, projection };
}

const roles = {
  candidate_actor_id: "inspect-worker",
  activation_actor_id: "trusted-host-activation",
  independent_acceptance_actor_id: "future-independent-reviewer",
} as const;

function rollbackAction(receipt: any, nonce: string) {
  return {
    decision: "rollback" as const,
    receipt_digest: receipt.receipt_digest,
    current_namespace_digest: receipt.activated_namespace_digest,
    user_action_ref: `rollback-${nonce}`,
    nonce_or_replay_key: nonce,
    occurred_at_trusted: "2026-08-30T09:04:00.000Z",
  };
}

test("可信激活创建零父 genesis、单父 activation 与同一 expected-missing ref transaction", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  const formal = git(root, "rev-parse", "refs/nextstep/formal");
  const control = git(root, "rev-parse", "refs/nextstep/control");
  assert.equal(formal, values.candidate.candidate_head_oid);
  assert.equal(control, receipt.activation_oid);
  const parents = git(root, "rev-list", "--parents", "-n", "1", control).split(" ");
  assert.equal(parents.length, 2);
  const genesis = parents[1] as string;
  assert.equal(git(root, "rev-list", "--parents", "-n", "1", genesis).split(" ").length, 1);
  assert.notEqual(genesis, formal);
  assert.equal(JSON.parse(git(root, "show", `${control}:registry.json`)).tasks.length, 0);
  const status = projectProjectStatus(await readProjectStatusSource(root, new Date("2026-08-30T09:04:00.000Z")));
  assert.equal(status.status, "available");
  assert.equal(status.latest_formal_conclusion, null);
  assert.equal(status.source.kind, "adopted-baseline");
});

test("事务后回执丢失可 create-or-return，同 effect 不产生第二 genesis", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  let interrupted = false;
  await assert.rejects(() => activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
    afterRefTransaction() { interrupted = true; throw new Error("lost receipt"); },
  }), AdoptionRefStoreError);
  assert.equal(interrupted, true);
  const before = git(root, "rev-parse", "refs/nextstep/control");
  const recovered = await activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  assert.equal(recovered.activation_oid, before);
  assert.equal(git(root, "rev-parse", "refs/nextstep/control"), before);
});

test("事务后 worktree 漂移使 post-check fail closed，清除临时漂移后可精确恢复", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const drift = resolve(root, "post-transaction-drift");
  await assert.rejects(() => activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
    afterRefTransaction() { writeFileSync(drift, "drift"); },
  }), AdoptionRefStoreError);
  const control = git(root, "rev-parse", "refs/nextstep/control");
  await rm(drift);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  assert.equal(receipt.activation_oid, control);
});

test("精确双 ref 回滚成功；额外 namespace 或后继 control 状态时零副作用阻塞", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles,
    projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt,
    action: rollbackAction(receipt, "rejected"),
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => false },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt,
    action: rollbackAction(receipt, "no-verifier"),
    verifier: undefined,
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  git(root, "update-ref", "refs/nextstep/extra", values.candidate.candidate_head_oid);
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt,
    action: rollbackAction(receipt, "extra-ref"),
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  assert.equal(git(root, "rev-parse", "refs/nextstep/control"), receipt.activation_oid);
  git(root, "update-ref", "-d", "refs/nextstep/extra");
  const result = await rollbackAdoption({
    projectRoot: root, receipt,
    action: rollbackAction(receipt, "success"),
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  });
  assert.equal(result.status, "rolled-back");
  assert.equal(git(root, "for-each-ref", "--format=%(refname)", "refs/nextstep/"), "");
});

test("独立重算 confirmation view，projection 漂移在任何 Git object/ref 写前拒绝", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const before = git(root, "count-objects", "-v");
  await assert.rejects(() => activateAdoption({
    projectRoot: root, candidate: values.candidate, confirmation: values.confirmation, roles,
    projection: { ...values.projection, scope: "attacker-recomputed-scope" },
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  }), (error: unknown) => {
    assert.ok(error instanceof AdoptionRefStoreError);
    assert.equal(error.code, "ADOPTION_CONFIRMATION_UNTRUSTED");
    return true;
  });
  assert.equal(git(root, "count-objects", "-v"), before);
  assert.equal(git(root, "for-each-ref", "--format=%(refname)", "refs/nextstep/"), "");
});

test("rollback 绑定 current namespace digest，删除后回执丢失可由内容寻址 blob 原样恢复", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles, projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  const wrong = rollbackAction(receipt, "wrong-namespace");
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt,
    action: { ...wrong, current_namespace_digest: `sha256:${"0".repeat(64)}` },
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  assert.equal(git(root, "rev-parse", "refs/nextstep/control"), receipt.activation_oid);

  for (const scenario of [
    { action: Object.defineProperty({}, "decision", { enumerable: true, get() { throw new Error("getter"); } }), verifier: { verifier_kind: "trusted-host", verifyRollback: () => true } },
    { action: { ...rollbackAction(receipt, "extra-field"), extra: true }, verifier: { verifier_kind: "trusted-host", verifyRollback: () => true } },
    { action: { ...rollbackAction(receipt, "empty-action"), user_action_ref: "" }, verifier: { verifier_kind: "trusted-host", verifyRollback: () => true } },
    { action: rollbackAction(receipt, "verifier-throws"), verifier: { verifier_kind: "trusted-host", verifyRollback() { throw new Error("verifier"); } } },
    { action: { ...rollbackAction(receipt, "future-action"), occurred_at_trusted: "2026-08-30T09:06:00.000Z" }, verifier: { verifier_kind: "trusted-host", verifyRollback: () => true } },
  ]) {
    await assert.rejects(() => rollbackAdoption({
      projectRoot: root, receipt, action: scenario.action as any, verifier: scenario.verifier as any,
      now: () => new Date("2026-08-30T09:05:00.000Z"),
    }), AdoptionRefStoreError);
    assert.equal(git(root, "rev-parse", "refs/nextstep/control"), receipt.activation_oid);
  }

  const action = rollbackAction(receipt, "recover-result-loss");
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt, action,
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
    afterRefTransaction() { throw new Error("result lost"); },
  }), AdoptionRefStoreError);
  assert.equal(git(root, "for-each-ref", "--format=%(refname)", "refs/nextstep/"), "");
  const recovered = await rollbackAdoption({
    projectRoot: root, receipt, action,
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
    now: () => new Date("2026-08-30T09:06:00.000Z"),
  });
  assert.equal(recovered.status, "rolled-back");
  assert.match(recovered.receipt_blob_oid, /^[a-f0-9]{40,64}$/);
  assert.equal(canonicalizeJson(JSON.parse(git(root, "cat-file", "blob", recovered.receipt_blob_oid))), canonicalizeJson(recovered.receipt));

  for (const changed of [
    { ...action, nonce_or_replay_key: "different-nonce" },
    { ...action, user_action_ref: "rollback-different-action" },
    { ...action, receipt_digest: `sha256:${"9".repeat(64)}` },
  ]) {
    await assert.rejects(() => rollbackAdoption({
      projectRoot: root, receipt, action: changed,
      verifier: { verifier_kind: "trusted-host", verifyRollback: () => true },
      now: () => new Date("2026-08-30T09:06:00.000Z"),
    }), AdoptionRefStoreError);
  }
});

test("status 沿无 merge 单父 ancestry 定位唯一 adoption anchor，真实 successor task 优先", async (context) => {
  for (const copyMarkers of [false, true]) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    const values = await input(root);
    const receipt = await activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    });
    const successor = successorControl(root, receipt.activation_oid, values.candidate, copyMarkers);
    git(root, "update-ref", "refs/nextstep/control", successor, receipt.activation_oid);
    const status = projectProjectStatus(await readProjectStatusSource(root, new Date("2026-08-30T09:06:00.000Z")));
    assert.equal(status.status, "available");
    assert.equal(status.current_stage, "S5/POST-ADOPT");
    assert.equal(status.current_scope, "POST-ADOPT generation 1 attempt 1");
    assert.equal(status.latest_formal_conclusion, null);
    assert.equal(status.source.kind, "adopted-baseline");
  }
});

test("status 拒绝 successor 中冲突的 adoption marker，不把伪造 baseline 当成新锚", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles, projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  const successor = successorControl(root, receipt.activation_oid, values.candidate, true, true);
  git(root, "update-ref", "refs/nextstep/control", successor, receipt.activation_oid);
  await assert.rejects(() => readProjectStatusSource(root), (error: unknown) => {
    assert.equal((error as any).code, "INVALID_CONTROL_COMMIT");
    return true;
  });
});

test("角色重叠、非可信 envelope、过期、脏工作区与已有单 ref 均在 ref 副作用前拒绝", async (context) => {
  for (const scenario of ["bad-root", "roles", "bad-role", "untrusted", "expired", "dirty", "single-ref"] as const) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    const values = await input(root);
    if (scenario === "dirty") await writeFile(resolve(root, "untracked"), "dirty");
    if (scenario === "single-ref") git(root, "update-ref", "refs/nextstep/formal", values.candidate.candidate_head_oid);
    await assert.rejects(() => activateAdoption({
      projectRoot: scenario === "bad-root" ? "relative" : root,
      candidate: values.candidate,
      confirmation: scenario === "untrusted" ? structuredClone(values.confirmation) : values.confirmation,
      roles: scenario === "roles"
        ? { ...roles, activation_actor_id: roles.candidate_actor_id }
        : scenario === "bad-role" ? { ...roles, activation_actor_id: "bad role" } : roles,
      projection: { stage: "S5", milestone: "M1", scope: "existing-project-baseline" },
      now: () => new Date(scenario === "expired" ? "2026-08-30T09:11:00.000Z" : "2026-08-30T09:03:00.000Z"),
    }), AdoptionRefStoreError);
    if (scenario !== "single-ref") assert.equal(git(root, "for-each-ref", "--format=%(refname)", "refs/nextstep/"), "");
  }
});

test("adapter 只有一个 update-ref transaction 实现且无 shell 拼接", async () => {
  const source = await readFile(resolve(process.cwd(), "src/adapters/node/adoption-ref-store.ts"), "utf8");
  assert.equal(source.match(/function refTransaction/g)?.length, 1);
  assert.doesNotMatch(source, /(?<!\.)\bexec\(|shell:\s*true|spawn\([^,]+,\s*[^[]/);
});

test("不存在的绝对项目根在可信验证和 Git 副作用前拒绝", async () => {
  const missing = resolve(tmpdir(), `nextstep-adoption-missing-root-${process.pid}`);
  const fake = {} as any;
  await assert.rejects(() => activateAdoption({
    projectRoot: missing,
    candidate: fake,
    confirmation: fake,
    roles,
    projection: { stage: "S5", milestone: "M1", scope: "baseline" },
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  }), AdoptionRefStoreError);
  await assert.rejects(() => rollbackAdoption({
    projectRoot: missing,
    receipt: fake,
    action: fake,
    verifier: undefined,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  }), AdoptionRefStoreError);
});
