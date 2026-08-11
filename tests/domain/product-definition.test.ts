import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import {
  createProductDefinitionInteractionSession,
  createProductDefinitionSignoffChallenge,
  createUnverifiedProductDefinitionDisplay,
  createUnverifiedProductDefinitionUserAction,
  parseProductDefinitionCandidate,
  recoverSignedProductDefinition,
  signProductDefinition,
  verifyProductDefinitionInteraction,
  ProductDefinitionError,
} from "../../src/domain/product-definition.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";
import { createConfirmationChallenge, createConfirmationEnvelope, createConfirmationInteractionSession, createUnverifiedConfirmationViewDisplay, createUnverifiedUserConfirmationAction, reduceConfirmationInteractionState, verifyConfirmationInteraction } from "../../src/domain/requirement-confirmation.ts";
import { freezeRequirementSet } from "../../src/domain/requirement-freeze.ts";

function frozenRequirement() {
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: "req-product-definition",
    project: {
      repository_id: `sha256:${"3".repeat(64)}`,
      formal_baseline: "a854fd4938b34ab24d88e72430be52b397c91096",
    },
    version: 1,
    candidate: {
      schema_version: "1.0",
      candidate: {
        raw_expression: "为社区志愿者建立离线活动计划工具，帮助协调每周活动；不连接外部服务。",
        intent_summary: { status: "identified", source: "derived", value: "建立离线活动计划工具", evidence: [{ start: 6, end: 16, quote: "建立离线活动计划工具" }] },
        goals: { status: "identified", items: [{ value: "协调每周活动", evidence: [{ start: 19, end: 25, quote: "协调每周活动" }] }] },
        scenarios: { status: "identified", items: [{ value: "社区志愿者", evidence: [{ start: 1, end: 6, quote: "社区志愿者" }] }] },
        constraints: { status: "identified", items: [{ value: "不连接外部服务", evidence: [{ start: 26, end: 33, quote: "不连接外部服务" }] }] },
        expected_outputs: { status: "identified", items: [{ value: "建立离线活动计划工具", evidence: [{ start: 6, end: 16, quote: "建立离线活动计划工具" }] }] },
        non_goal_gaps: { status: "identified", items: [{ value: "不连接外部服务", evidence: [{ start: 26, end: 33, quote: "不连接外部服务" }] }] },
        clarification_gaps: { status: "missing", items: [], clarification_question: "是否还有需要澄清的内容？" },
      },
    },
    user_resolutions: [{ field: "clarification_gaps", status: "none", values: [] }],
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: "confirm-product-definition",
    created_at: "2026-08-11T09:00:00.000Z",
    expires_at: "2026-08-11T10:00:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: "display-product-definition",
    displayed_at: "2026-08-11T09:05:00.000Z",
  });
  const userAction = createUnverifiedUserConfirmationAction(display, {
    user_action_id: "action-product-definition",
    action: "confirm",
    occurred_at: "2026-08-11T09:10:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
  const session = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-11T09:10:01.000Z",
  });
  return freezeRequirementSet({
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(verified),
  }, [], { verifier, verified_interaction: verified, interaction_session: session, now: () => new Date("2026-08-11T09:11:00.000Z") });
}

function fact(frozen: ReturnType<typeof frozenRequirement>, pointer: string) {
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let value: unknown = frozen;
  for (const token of tokens) value = (value as Record<string, unknown>)[token];
  return { value, source: { pointer, value_digest: digestJson(value) } };
}

function candidate(frozen = frozenRequirement()) {
  const intent = "/requirement_set/items/0/values/0";
  const goals = "/requirement_set/items/1/values/0";
  const scenarios = "/requirement_set/items/2/values/0";
  const constraints = "/requirement_set/items/3/values/0";
  const outputs = "/requirement_set/items/4/values/0";
  const nonGoals = "/requirement_set/items/5/values/0";
  return {
    schema_version: "1.0",
    record_type: "product-definition-candidate",
    product_definition_id: "pd-community-workshop-v1",
    frozen_requirement: frozen,
    frozen_requirement_digest: digestJson(frozen),
    prd: {
      product_name: fact(frozen, intent),
      problem: fact(frozen, scenarios),
      target_users: [fact(frozen, scenarios)],
      goals: [fact(frozen, goals)],
      scenarios: [fact(frozen, scenarios)],
      scope: [fact(frozen, outputs)],
      non_goals: [fact(frozen, nonGoals)],
      success_metrics: [fact(frozen, constraints)],
    },
    user_journey: { product_definition_id: "pd-community-workshop-v1", steps: [fact(frozen, scenarios)] },
    capability_map: { product_definition_id: "pd-community-workshop-v1", capabilities: [fact(frozen, goals)] },
  };
}

test("完整产品定义只接受 Frozen Requirement 中可验证的事实来源", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  assert.equal(parsed.product_definition_id, "pd-community-workshop-v1");
  assert.equal(parsed.status, "ready-for-signoff");
});

test("三类目标项目 fixture 仅以 manual-isolated 消费者契约验证完整候选", async () => {
  for (const fixtureName of ["community-workshop", "expense-reminder", "project-delivery-tool"]) {
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), `tests/fixtures/product-definition/${fixtureName}.json`), "utf8")) as Record<string, unknown>;
    assert.equal(fixture.fixture_type, "complete-product-definition");
    assert.equal(fixture.evidence_scope, "manual-isolated consumer contract");
    const productDefinitionId = `pd-${fixture.target_project as string}`;
    const value = candidate();
    const parsed = parseProductDefinitionCandidate({
      ...value,
      product_definition_id: productDefinitionId,
      user_journey: { ...value.user_journey, product_definition_id: productDefinitionId },
      capability_map: { ...value.capability_map, product_definition_id: productDefinitionId },
    });
    assert.equal(parsed.product_definition_id, productDefinitionId);
  }
});

test("缺少范围、非目标、成功指标、旅程或能力映射会确定性阻断", () => {
  for (const mutate of [
    (value: ReturnType<typeof candidate>) => ({ ...value, prd: { ...value.prd, scope: [] } }),
    (value: ReturnType<typeof candidate>) => ({ ...value, prd: { ...value.prd, non_goals: [] } }),
    (value: ReturnType<typeof candidate>) => ({ ...value, prd: { ...value.prd, success_metrics: [] } }),
    (value: ReturnType<typeof candidate>) => ({ ...value, user_journey: { ...value.user_journey, steps: [] } }),
    (value: ReturnType<typeof candidate>) => ({ ...value, capability_map: { ...value.capability_map, capabilities: [] } }),
  ]) {
    assert.throws(() => parseProductDefinitionCandidate(mutate(candidate())), ProductDefinitionError);
  }
});

test("来源 JSON Pointer 越界、摘要篡改、未知字段和未冻结输入均 fail closed", () => {
  const sourceMismatch = candidate();
  sourceMismatch.prd.goals[0] = { ...sourceMismatch.prd.goals[0]!, source: { pointer: "/requirement_set/items/1/values/0", value_digest: `sha256:${"0".repeat(64)}` } };
  assert.throws(() => parseProductDefinitionCandidate(sourceMismatch), ProductDefinitionError);
  assert.throws(() => parseProductDefinitionCandidate({ ...candidate(), unexpected: true }), ProductDefinitionError);
  assert.throws(() => parseProductDefinitionCandidate({ ...candidate(), frozen_requirement: { status: "frozen" } }), ProductDefinitionError);
});

test("会签仅接受进程内可信 verifier capability，且绑定完整展示与产品定义", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "signoff-community-workshop",
    created_at: "2026-08-11T11:00:00.000Z",
    expires_at: "2026-08-11T12:00:00.000Z",
  });
  const display = createUnverifiedProductDefinitionDisplay(challenge, {
    display_id: "product-display-community-workshop",
    displayed_at: "2026-08-11T11:05:00.000Z",
  });
  const action = createUnverifiedProductDefinitionUserAction(display, {
    user_action_id: "product-action-community-workshop",
    action: "confirm",
    occurred_at: "2026-08-11T11:10:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyProductDefinitionInteraction({ display, user_action: action }, verifier);
  const session = createProductDefinitionInteractionSession(verified);
  const signed = signProductDefinition(parsed, verified, session, () => new Date("2026-08-11T11:11:00.000Z"));
  assert.equal(recoverSignedProductDefinition(signed).status, "signed");
  assert.throws(() => recoverSignedProductDefinition({ ...signed, self_described_signed: true }), ProductDefinitionError);

  assert.throws(
    () => signProductDefinition(parsed, { ...verified }, session, () => new Date("2026-08-11T11:11:00.000Z")),
    ProductDefinitionError,
  );
  const other = parseProductDefinitionCandidate({ ...candidate(), product_definition_id: "pd-other", user_journey: { ...candidate().user_journey, product_definition_id: "pd-other" }, capability_map: { ...candidate().capability_map, product_definition_id: "pd-other" } });
  assert.throws(() => signProductDefinition(other, verified, session, () => new Date("2026-08-11T11:11:00.000Z")), ProductDefinitionError);
  assert.throws(() => signProductDefinition(parsed, verified, session, () => new Date("2026-08-11T12:00:00.000Z")), ProductDefinitionError);

  const rejectedAction = createUnverifiedProductDefinitionUserAction(display, {
    user_action_id: "product-action-rejected",
    action: "reject",
    occurred_at: "2026-08-11T11:12:00.000Z",
  });
  const rejected = verifyProductDefinitionInteraction({ display, user_action: rejectedAction }, verifier);
  assert.throws(
    () => signProductDefinition(parsed, rejected, createProductDefinitionInteractionSession(rejected), () => new Date("2026-08-11T11:13:00.000Z")),
    ProductDefinitionError,
  );
});

test("成功机器回执精确绑定完整产品定义的 JCS 与摘要", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const { status: _status, ...record } = parsed;
  const receipt = parseMachineReceipt({
    schema_version: "1.0",
    receipt_id: "receipt-product-definition",
    ok: true,
    code: "PRODUCT_DEFINITION_ACCEPTED",
    data: {
      canonical_json: canonicalizeJson(record),
      digest: digestJson(record),
      product_definition: record,
      schema_version: "1.0",
    },
  });
  assert.equal(receipt.code, "PRODUCT_DEFINITION_ACCEPTED");
  assert.throws(
    () => parseMachineReceipt({ ...receipt, data: { ...receipt.data, digest: `sha256:${"f".repeat(64)}` } }),
    /digest|receipt|identity/i,
  );
});
