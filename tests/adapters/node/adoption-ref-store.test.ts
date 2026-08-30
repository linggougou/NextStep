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
import { createAdoptionActivationReceipt } from "../../../src/domain/adoption-activation.ts";
import { createAdoptionConfirmationView, verifyAdoptionConfirmation } from "../../../src/domain/adopted-baseline.ts";
import { canonicalizeJson } from "../../../src/domain/canonical-json.ts";
import { digestJson } from "../../../src/domain/content-digest.ts";
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

function controlWithMode(root: string, receipt: any, path: string, mode: "100755" | "120000"): string {
  const entries = ["activation.json", "adopted-baseline.json", "checkpoint.json", "registry.json"].map((name) =>
    `${name === path ? mode : "100644"} blob ${git(root, "rev-parse", `${receipt.activation_oid}:${name}`)}\t${name}`
  );
  const tree = gitInput(root, `${entries.sort().join("\n")}\n`, "mktree");
  return git(root, "commit-tree", tree, "-p", receipt.genesis_oid, "-m", "mode-forged activation");
}

function parentedGenesisControl(root: string, receipt: any): { control: string; genesis: string; activation: any } {
  const genesisTree = git(root, "rev-parse", `${receipt.genesis_oid}^{tree}`);
  const genesis = git(root, "commit-tree", genesisTree, "-p", receipt.formal_oid, "-m", "parented genesis");
  const originalActivation = JSON.parse(git(root, "show", `${receipt.activation_oid}:activation.json`));
  const { activation_digest: _activationDigest, ...activationBody } = originalActivation;
  const nextActivationBody = { ...activationBody, genesis_oid: genesis, control_parent_oid: genesis };
  const activation = { ...nextActivationBody, activation_digest: digestJson(nextActivationBody) };
  const checkpoint = JSON.parse(git(root, "show", `${receipt.activation_oid}:checkpoint.json`));
  const entries = [
    `100644 blob ${gitInput(root, canonicalizeJson(activation), "hash-object", "-w", "--stdin")}\tactivation.json`,
    `100644 blob ${git(root, "rev-parse", `${receipt.activation_oid}:adopted-baseline.json`)}\tadopted-baseline.json`,
    `100644 blob ${gitInput(root, canonicalizeJson({ ...checkpoint, control_parent_oid: genesis }), "hash-object", "-w", "--stdin")}\tcheckpoint.json`,
    `100644 blob ${git(root, "rev-parse", `${receipt.activation_oid}:registry.json`)}\tregistry.json`,
  ];
  const tree = gitInput(root, `${entries.sort().join("\n")}\n`, "mktree");
  return { control: git(root, "commit-tree", tree, "-p", genesis, "-m", "parented activation"), genesis, activation };
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

test("existing-pair recovery 拒绝非 canonical/错误 genesis tree 与缺失 checkpoint/registry 的 activation tree", async (context) => {
  for (const scenario of ["wrong-genesis-tree", "noncanonical-genesis", "missing-control-state"] as const) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    const values = await input(root);
    const receipt = await activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    });
    const originalControl = receipt.activation_oid;
    const originalGenesis = receipt.genesis_oid;
    let parent = originalGenesis;
    let activationBlob = git(root, "rev-parse", `${originalControl}:activation.json`);
    let checkpointBlob = git(root, "rev-parse", `${originalControl}:checkpoint.json`);
    if (scenario !== "missing-control-state") {
      const genesisInput = scenario === "wrong-genesis-tree"
        ? JSON.stringify({ forged: true })
        : `${JSON.stringify(JSON.parse(git(root, "show", `${originalGenesis}:genesis.json`)), null, 2)}\n`;
      const wrongBlob = gitInput(root, genesisInput, "hash-object", "-w", "--stdin");
      const genesisPath = scenario === "wrong-genesis-tree" ? "wrong.json" : "genesis.json";
      const wrongTree = gitInput(root, `100644 blob ${wrongBlob}\t${genesisPath}\n`, "mktree");
      parent = git(root, "commit-tree", wrongTree, "-m", "forged genesis");
      const activation = JSON.parse(git(root, "show", `${originalControl}:activation.json`));
      const { activation_digest: _activationDigest, ...activationBody } = activation;
      const forgedActivationBody = { ...activationBody, genesis_oid: parent, control_parent_oid: parent };
      activationBlob = gitInput(root, canonicalizeJson({
        ...forgedActivationBody,
        activation_digest: digestJson(forgedActivationBody),
      }), "hash-object", "-w", "--stdin");
      const checkpoint = JSON.parse(git(root, "show", `${originalControl}:checkpoint.json`));
      checkpointBlob = gitInput(root, canonicalizeJson({ ...checkpoint, control_parent_oid: parent }), "hash-object", "-w", "--stdin");
    }
    const entries = [
      `100644 blob ${activationBlob}\tactivation.json`,
      `100644 blob ${git(root, "rev-parse", `${originalControl}:adopted-baseline.json`)}\tadopted-baseline.json`,
      ...(scenario === "missing-control-state" ? [] : [
        `100644 blob ${checkpointBlob}\tcheckpoint.json`,
        `100644 blob ${git(root, "rev-parse", `${originalControl}:registry.json`)}\tregistry.json`,
      ]),
    ];
    const forgedTree = gitInput(root, `${entries.sort().join("\n")}\n`, "mktree");
    const forgedControl = git(root, "commit-tree", forgedTree, "-p", parent, "-m", "forged activation");
    git(root, "update-ref", "refs/nextstep/control", forgedControl, originalControl);

    await assert.rejects(() => activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    }), AdoptionRefStoreError);
    assert.equal(git(root, "rev-parse", "refs/nextstep/control"), forgedControl);
  }
});

test("raw tree entry mode 伪装在 recovery、rollback、status 前零副作用拒绝", async (context) => {
  for (const mode of ["100755", "120000"] as const) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    const values = await input(root);
    const receipt = await activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    });
    const control = controlWithMode(root, receipt, "activation.json", mode);
    git(root, "update-ref", "refs/nextstep/control", control, receipt.activation_oid);
    const forgedReceipt = createAdoptionActivationReceipt(
      JSON.parse(git(root, "cat-file", "blob", git(root, "rev-parse", `${control}:activation.json`))),
      control,
    );
    const objectsBefore = git(root, "count-objects", "-v");
    let verifierCalls = 0;

    await assert.rejects(() => activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    }), AdoptionRefStoreError);
    await assert.rejects(() => readProjectStatusSource(root));
    await assert.rejects(() => rollbackAdoption({
      projectRoot: root, receipt: forgedReceipt, action: rollbackAction(forgedReceipt, `mode-${mode}`),
      verifier: { verifier_kind: "trusted-host", verifyRollback: () => { verifierCalls += 1; return true; } },
      now: () => new Date("2026-08-30T09:05:00.000Z"),
    }), AdoptionRefStoreError);
    assert.equal(verifierCalls, 0);
    assert.equal(git(root, "count-objects", "-v"), objectsBefore);
    assert.equal(git(root, "rev-parse", "refs/nextstep/control"), control);
    assert.equal(git(root, "rev-parse", "refs/nextstep/formal"), receipt.formal_oid);
  }
});

test("raw genesis parent 被 shallow 或 grafts 隐藏时 recovery、rollback、status 零副作用拒绝", async (context) => {
  for (const topologyMask of ["shallow", "grafts"] as const) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    const values = await input(root);
    const receipt = await activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    });
    const forged = parentedGenesisControl(root, receipt);
    git(root, "update-ref", "refs/nextstep/control", forged.control, receipt.activation_oid);
    if (topologyMask === "shallow") await writeFile(resolve(root, ".git/shallow"), `${forged.genesis}\n`);
    else await writeFile(resolve(root, ".git/info/grafts"), `${forged.genesis}\n`);
    const forgedReceipt = createAdoptionActivationReceipt(forged.activation, forged.control);
    const objectsBefore = git(root, "count-objects", "-v");
    let verifierCalls = 0;

    await assert.rejects(() => activateAdoption({
      projectRoot: root, ...values, roles, projection: values.projection,
      now: () => new Date("2026-08-30T09:03:00.000Z"),
    }), AdoptionRefStoreError);
    await assert.rejects(() => readProjectStatusSource(root));
    await assert.rejects(() => rollbackAdoption({
      projectRoot: root, receipt: forgedReceipt, action: rollbackAction(forgedReceipt, topologyMask),
      verifier: { verifier_kind: "trusted-host", verifyRollback: () => { verifierCalls += 1; return true; } },
      now: () => new Date("2026-08-30T09:05:00.000Z"),
    }), AdoptionRefStoreError);
    assert.equal(verifierCalls, 0);
    assert.equal(git(root, "count-objects", "-v"), objectsBefore);
    assert.equal(git(root, "rev-parse", "refs/nextstep/control"), forged.control);
    assert.equal(git(root, "rev-parse", "refs/nextstep/formal"), receipt.formal_oid);
  }
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

test("forged receipt 在 verifier、对象写入与 ref transaction 前被 ancestry 绑定拒绝", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = await input(root);
  const receipt = await activateAdoption({
    projectRoot: root, ...values, roles, projection: values.projection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  const { receipt_digest: _receiptDigest, ...receiptBody } = receipt;
  const forgedBody = { ...receiptBody, activated_at_trusted: "2026-08-30T09:02:00.000Z" };
  const forged = { ...forgedBody, receipt_digest: digestJson(forgedBody) };
  const action = rollbackAction(forged, "forged-receipt");
  const objectsBefore = git(root, "count-objects", "-v");
  let verifierCalls = 0;
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root, receipt: forged, action,
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => { verifierCalls += 1; return true; } },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  assert.equal(verifierCalls, 0);
  assert.equal(git(root, "count-objects", "-v"), objectsBefore);
  assert.equal(git(root, "rev-parse", "refs/nextstep/control"), receipt.activation_oid);
  assert.equal(git(root, "rev-parse", "refs/nextstep/formal"), receipt.formal_oid);

  const { receipt_digest: _forgedDigest, ...derivedBody } = receipt;
  const derivedForgeryBody = { ...derivedBody, effect_identity: `sha256:${"e".repeat(64)}` };
  await assert.rejects(() => rollbackAdoption({
    projectRoot: root,
    receipt: { ...derivedForgeryBody, receipt_digest: digestJson(derivedForgeryBody) } as any,
    action,
    verifier: { verifier_kind: "trusted-host", verifyRollback: () => { verifierCalls += 1; return true; } },
    now: () => new Date("2026-08-30T09:05:00.000Z"),
  }), AdoptionRefStoreError);
  assert.equal(verifierCalls, 0);
  assert.equal(git(root, "count-objects", "-v"), objectsBefore);
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
