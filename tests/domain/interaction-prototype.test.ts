import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  InteractionPrototypeError,
  parseInteractionPrototype,
  type InteractionPrototypeErrorCode,
} from "../../src/domain/interaction-prototype.ts";

// fixture 契约：根为 envelope（evidence_scope/fixture_type/target_project/expected/candidate），
// candidate 为完整 InteractionPrototype 1.0 候选；上游 Product Definition 2.0 记录整体内嵌，
// 其摘要与身份由生成器从 tests/fixtures/product-definition/*.json 回放派生，禁止手抄。
interface FixtureEnvelope {
  readonly evidence_scope: string;
  readonly fixture_type: string;
  readonly target_project: string;
  readonly expected: { readonly ok: true } | { readonly ok: false; readonly code: InteractionPrototypeErrorCode };
  readonly candidate: Record<string, unknown>;
}

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/interaction-prototype");
const positiveProjects = ["community-workshop", "expense-reminder", "project-delivery-tool"] as const;

async function loadFixture(fileName: string): Promise<FixtureEnvelope> {
  const raw = await readFile(resolve(fixtureDirectory, fileName), "utf8");
  return JSON.parse(raw) as FixtureEnvelope;
}

async function loadCandidate(fileName: string): Promise<Record<string, unknown>> {
  const envelope = await loadFixture(fileName);
  return structuredClone(envelope.candidate) as Record<string, unknown>;
}

function assertRejectedWith(value: unknown, code: InteractionPrototypeErrorCode): InteractionPrototypeError {
  try {
    parseInteractionPrototype(value);
  } catch (error) {
    if (!(error instanceof InteractionPrototypeError)) {
      assert.fail(`期望 InteractionPrototypeError，实际为 ${String(error)}`);
    }
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    return error;
  }
  assert.fail(`期望以 ${code} 拒绝，但解析通过`);
}

test("三类目标项目正例 fixture 通过载体无关原型校验并保持上游身份绑定", async () => {
  for (const project of positiveProjects) {
    const envelope = await loadFixture(`${project}.json`);
    assert.equal(envelope.fixture_type, "interaction-prototype-positive");
    assert.equal(envelope.evidence_scope, "manual-isolated consumer contract");
    assert.equal(envelope.target_project, project);
    assert.deepEqual(envelope.expected, { ok: true });

    const parsed = parseInteractionPrototype(envelope.candidate);
    assert.ok(Object.isFrozen(parsed));
    assert.equal(parsed.schema_version, "1.0");
    assert.equal(parsed.record_type, "interaction-prototype");
    assert.equal(parsed.status, "ready-for-signoff");
    assert.equal(parsed.carrier_scope, "carrier-agnostic");
    assert.equal(parsed.project.repository_id, envelope.candidate.project && (envelope.candidate.project as Record<string, unknown>).repository_id);
    assert.equal(parsed.project.formal_baseline, (envelope.candidate.project as Record<string, unknown>).formal_baseline);

    const embedded = parsed.product_definition as Record<string, unknown>;
    assert.equal(parsed.product_definition_id, embedded.product_definition_id);
    assert.equal(parsed.product_definition_digest, digestJson(embedded));
    const upstreamProject = ((embedded.frozen_requirement as Record<string, unknown>).project as Record<string, unknown>);
    assert.equal(parsed.project.repository_id, upstreamProject.repository_id);
    assert.equal(parsed.project.formal_baseline, upstreamProject.formal_baseline);

    assert.ok(parsed.inputs.length >= 1);
    assert.ok(parsed.responses.length >= 1);
    assert.ok(parsed.confirmation_nodes.length >= 1);
    assert.ok(parsed.stages.length >= 2);
    assert.ok(parsed.stage_transitions.length >= 1);
    assert.ok(parsed.exceptions.length >= 1);
    for (const exception of parsed.exceptions) {
      assert.ok(exception.recovery, "正例 fixture 的每个异常必须携带恢复入口");
    }
    assert.ok(parsed.invariants.length >= 1);
    for (const confirmation of parsed.confirmation_nodes) {
      assert.equal(confirmation.confirmation_kind, "explicit-user-confirmation");
    }
  }
});

test("全部负例 fixture 均 fail closed 且错误码专属", async () => {
  const negativeFixtures: readonly { readonly file: string; readonly code: InteractionPrototypeErrorCode }[] = [
    { file: "confirmation-node-missing.json", code: "CONFIRMATION_NODE_MISSING" },
    { file: "terminal-confirmation-missing.json", code: "CONFIRMATION_NODE_MISSING" },
    { file: "stage-transition-invalid.json", code: "INVALID_STAGE_TRANSITION" },
    { file: "stage-transition-self-loop.json", code: "INVALID_STAGE_TRANSITION" },
    { file: "unrecoverable-exception.json", code: "RECOVERY_ENTRY_MISSING" },
    { file: "web-mainline-claim.json", code: "WEB_UI_MAINLINE_REJECTED" },
    { file: "codex-script-narrowing.json", code: "CARRIER_NARROWING_REJECTED" },
    { file: "unknown-field.json", code: "INVALID_INTERACTION_PROTOTYPE" },
    { file: "unknown-version.json", code: "INVALID_INTERACTION_PROTOTYPE" },
    { file: "missing-required-field.json", code: "INVALID_INTERACTION_PROTOTYPE" },
    { file: "sensitive-field.json", code: "SENSITIVE_CONTENT_DETECTED" },
    { file: "sensitive-content.json", code: "SENSITIVE_CONTENT_DETECTED" },
    { file: "invariant-binding-mismatch.json", code: "UPSTREAM_BINDING_MISMATCH" },
  ];
  for (const { file, code } of negativeFixtures) {
    const envelope = await loadFixture(file);
    assert.equal(envelope.fixture_type, "interaction-prototype-negative", file);
    assert.deepEqual(envelope.expected, { ok: false, code }, file);
    assertRejectedWith(envelope.candidate, code);
  }
});

test("上游摘要与身份错配 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");

  const digestTampered = structuredClone(base);
  digestTampered.product_definition_digest = `sha256:${"0".repeat(64)}`;
  assertRejectedWith(digestTampered, "UPSTREAM_BINDING_MISMATCH");

  const contentTampered = structuredClone(base);
  const embedded = contentTampered.product_definition as Record<string, unknown>;
  const prd = embedded.prd as Record<string, unknown>;
  const productName = prd.product_name as Record<string, unknown>;
  productName.value = "被篡改的产品名";
  assertRejectedWith(contentTampered, "UPSTREAM_BINDING_MISMATCH");

  const idMismatch = structuredClone(base);
  idMismatch.product_definition_id = "pd-does-not-match";
  assertRejectedWith(idMismatch, "UPSTREAM_BINDING_MISMATCH");

  const baselineMismatch = structuredClone(base);
  (baselineMismatch.project as Record<string, unknown>).formal_baseline = `${"9".repeat(40)}`;
  assertRejectedWith(baselineMismatch, "UPSTREAM_BINDING_MISMATCH");

  const repositoryMismatch = structuredClone(base);
  (repositoryMismatch.project as Record<string, unknown>).repository_id = `sha256:${"8".repeat(64)}`;
  assertRejectedWith(repositoryMismatch, "UPSTREAM_BINDING_MISMATCH");

  const upstreamInvalid = structuredClone(base);
  delete (upstreamInvalid.product_definition as Record<string, unknown>).prd;
  assertRejectedWith(upstreamInvalid, "UPSTREAM_BINDING_MISMATCH");
});

test("阶段结构缺陷 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");
  const stages = base.stages as Array<Record<string, unknown>>;

  const noInitial = structuredClone(base);
  (noInitial.stages as Array<Record<string, unknown>>).forEach((stage) => {
    if (stage.kind === "initial") stage.kind = "working";
  });
  assertRejectedWith(noInitial, "INVALID_INTERACTION_PROTOTYPE");

  const twoInitials = structuredClone(base);
  const twoInitialsStages = twoInitials.stages as Array<Record<string, unknown>>;
  const firstWorking = twoInitialsStages.find((stage) => stage.kind === "working");
  assert.ok(firstWorking);
  firstWorking!.kind = "initial";
  assertRejectedWith(twoInitials, "INVALID_INTERACTION_PROTOTYPE");

  const noTerminal = structuredClone(base);
  (noTerminal.stages as Array<Record<string, unknown>>).forEach((stage) => {
    if (stage.kind === "terminal") stage.kind = "working";
  });
  assertRejectedWith(noTerminal, "INVALID_INTERACTION_PROTOTYPE");

  const duplicateStageId = structuredClone(base);
  const duplicateStages = duplicateStageId.stages as Array<Record<string, unknown>>;
  duplicateStages[duplicateStages.length - 1]!.stage_id = duplicateStages[0]!.stage_id;
  assertRejectedWith(duplicateStageId, "INVALID_INTERACTION_PROTOTYPE");
});

test("阶段转换规则 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");
  const stages = base.stages as Array<Record<string, unknown>>;
  const terminalStage = stages.find((stage) => stage.kind === "terminal");
  assert.ok(terminalStage);

  const terminalExit = structuredClone(base);
  (terminalExit.stage_transitions as Array<Record<string, unknown>>).push({
    transition_id: "transition-terminal-exit",
    from: terminalStage!.stage_id,
    to: stages[0]!.stage_id,
    trigger: "user-action",
  });
  assertRejectedWith(terminalExit, "INVALID_STAGE_TRANSITION");

  const unreachable = structuredClone(base);
  (unreachable.stages as Array<Record<string, unknown>>).push({
    stage_id: "stage-orphan",
    name: "孤立阶段",
    kind: "working",
  });
  (unreachable.stage_transitions as Array<Record<string, unknown>>).push({
    transition_id: "transition-orphan-exit",
    from: "stage-orphan",
    to: terminalStage!.stage_id,
    trigger: "user-action",
  });
  assertRejectedWith(unreachable, "INVALID_STAGE_TRANSITION");

  const deadEnd = structuredClone(base);
  (deadEnd.stages as Array<Record<string, unknown>>).push({
    stage_id: "stage-dead-end",
    name: "无出口阶段",
    kind: "working",
  });
  const deadEndTransitions = deadEnd.stage_transitions as Array<Record<string, unknown>>;
  deadEndTransitions[0]!.to = "stage-dead-end";
  assertRejectedWith(deadEnd, "INVALID_STAGE_TRANSITION");

  const duplicatePair = structuredClone(base);
  const pairTransitions = duplicatePair.stage_transitions as Array<Record<string, unknown>>;
  pairTransitions.push({ ...structuredClone(pairTransitions[0]!), transition_id: "transition-duplicate-pair" });
  assertRejectedWith(duplicatePair, "INVALID_STAGE_TRANSITION");

  const duplicateTransitionId = structuredClone(base);
  const idTransitions = duplicateTransitionId.stage_transitions as Array<Record<string, unknown>>;
  idTransitions.push({ ...structuredClone(idTransitions[0]!), to: terminalStage!.stage_id });
  assertRejectedWith(duplicateTransitionId, "INVALID_STAGE_TRANSITION");
});

test("确认节点覆盖规则 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");

  const undeclaredConfirmationStage = structuredClone(base);
  (undeclaredConfirmationStage.confirmation_nodes as Array<Record<string, unknown>>)[0]!.stage = "stage-ghost";
  assertRejectedWith(undeclaredConfirmationStage, "INVALID_INTERACTION_PROTOTYPE");

  const duplicateConfirmationStage = structuredClone(base);
  const nodes = duplicateConfirmationStage.confirmation_nodes as Array<Record<string, unknown>>;
  nodes.push({ ...structuredClone(nodes[0]!), confirmation_node_id: "confirmation-duplicate-stage" });
  assertRejectedWith(duplicateConfirmationStage, "INVALID_INTERACTION_PROTOTYPE");
});

test("异常与恢复入口规则 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");

  const zeroExceptions = structuredClone(base);
  zeroExceptions.exceptions = [];
  assertRejectedWith(zeroExceptions, "RECOVERY_ENTRY_MISSING");

  const recoveryTargetUndeclared = structuredClone(base);
  ((recoveryTargetUndeclared.exceptions as Array<Record<string, unknown>>)[0]!.recovery as Record<string, unknown>).target_stage = "stage-ghost";
  assertRejectedWith(recoveryTargetUndeclared, "RECOVERY_ENTRY_MISSING");

  const duplicateRecoveryId = structuredClone(base);
  const duplicateExceptions = duplicateRecoveryId.exceptions as Array<Record<string, unknown>>;
  duplicateExceptions.push({
    ...structuredClone(duplicateExceptions[0]!),
    exception_id: "exception-duplicate-recovery",
  });
  assertRejectedWith(duplicateRecoveryId, "RECOVERY_ENTRY_MISSING");

  const exceptionStageUndeclared = structuredClone(base);
  (exceptionStageUndeclared.exceptions as Array<Record<string, unknown>>)[0]!.stage = "stage-ghost";
  assertRejectedWith(exceptionStageUndeclared, "INVALID_INTERACTION_PROTOTYPE");
});

test("不变量证据绑定规则 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");

  const pointerMissing = structuredClone(base);
  (pointerMissing.invariants as Array<Record<string, unknown>>)[0]!.source = {
    pointer: "/prd/does-not-exist/value",
    value_digest: `sha256:${"1".repeat(64)}`,
  };
  assertRejectedWith(pointerMissing, "UPSTREAM_BINDING_MISMATCH");

  const pointerEmpty = structuredClone(base);
  (pointerEmpty.invariants as Array<Record<string, unknown>>)[0]!.source = {
    pointer: "",
    value_digest: `sha256:${"1".repeat(64)}`,
  };
  assertRejectedWith(pointerEmpty, "UPSTREAM_BINDING_MISMATCH");

  const duplicateInvariantId = structuredClone(base);
  const invariants = duplicateInvariantId.invariants as Array<Record<string, unknown>>;
  invariants.push(structuredClone(invariants[0]!));
  assertRejectedWith(duplicateInvariantId, "INVALID_INTERACTION_PROTOTYPE");
});

test("输入与回应绑定规则 fail closed", async () => {
  const base = await loadCandidate("community-workshop.json");

  const unknownTrigger = structuredClone(base);
  (unknownTrigger.responses as Array<Record<string, unknown>>)[0]!.triggered_by = "input-does-not-exist";
  assertRejectedWith(unknownTrigger, "INVALID_INTERACTION_PROTOTYPE");

  const inputStageUndeclared = structuredClone(base);
  (inputStageUndeclared.inputs as Array<Record<string, unknown>>)[0]!.bound_stage = "stage-ghost";
  assertRejectedWith(inputStageUndeclared, "INVALID_INTERACTION_PROTOTYPE");

  const responseStageUndeclared = structuredClone(base);
  (responseStageUndeclared.responses as Array<Record<string, unknown>>)[0]!.bound_stage = "stage-ghost";
  assertRejectedWith(responseStageUndeclared, "INVALID_INTERACTION_PROTOTYPE");

  const emptyInputs = structuredClone(base);
  emptyInputs.inputs = [];
  assertRejectedWith(emptyInputs, "INVALID_INTERACTION_PROTOTYPE");
});

test("非对象输入与结构变体 fail closed", async () => {
  for (const value of [null, [], "interaction-prototype", 1, true]) {
    assertRejectedWith(value, "INVALID_INTERACTION_PROTOTYPE");
  }

  const base = await loadCandidate("community-workshop.json");
  const wrongRecordType = structuredClone(base);
  wrongRecordType.record_type = "carrier-decision";
  assertRejectedWith(wrongRecordType, "INVALID_INTERACTION_PROTOTYPE");

  const wrongStatus = structuredClone(base);
  wrongStatus.status = "signed";
  assertRejectedWith(wrongStatus, "INVALID_INTERACTION_PROTOTYPE");
});

test("错误类型契约保持冻结导出面", () => {
  const error = new InteractionPrototypeError("INVALID_INTERACTION_PROTOTYPE", "契约错误");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof InteractionPrototypeError);
  assert.equal(error.code, "INVALID_INTERACTION_PROTOTYPE");
  assert.equal(error.message, "契约错误");
  assert.equal(typeof parseInteractionPrototype, "function");
});
