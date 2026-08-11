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
  digestProductJourneyTransition,
  deriveProductDefinitionId,
  getProductDefinitionInteractionState,
  parseProductDefinitionCandidate,
  reduceProductDefinitionInteractionState,
  recoverSignedProductDefinition,
  signProductDefinition,
  verifyProductDefinitionInteraction,
  ProductDefinitionError,
  type ProductDefinitionDisplay,
  type ProductDefinitionInteractionStateEvent,
  type ProductSourceRef,
  type ProductDefinitionUserAction,
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
  return { kind: "direct" as const, value: value as string, source: { pointer, value_digest: digestJson(value) } };
}

function derivedFact(frozen: ReturnType<typeof frozenRequirement>, pointer: string, value: string, role: string) {
  const source = fact(frozen, pointer);
  return {
    kind: "derived" as const,
    value,
    derivation_summary: `role:${role}; 根据 ${source.value} 形成可审计定义`,
    source_refs: [source.source],
  };
}

function candidate(frozen = frozenRequirement()) {
  const intent = "/requirement_set/items/0/values/0";
  const goals = "/requirement_set/items/1/values/0";
  const scenarios = "/requirement_set/items/2/values/0";
  const constraints = "/requirement_set/items/3/values/0";
  const outputs = "/requirement_set/items/4/values/0";
  const nonGoals = "/requirement_set/items/5/values/0";
  const productDefinitionId = deriveProductDefinitionId(frozen);
  const semanticSource = fact(frozen, goals).source;
  const actor = derivedFact(frozen, scenarios, "社区志愿者", "actor");
  const steps = [
    {
      sequence: 1,
      actor,
      activity: derivedFact(frozen, goals, "社区志愿者开始安排每周活动", "activity"),
      result: derivedFact(frozen, goals, "每周活动进入安排中", "result"),
      semantic_source: semanticSource,
      action: "start" as const,
      state_change: { from: "not-started" as const, to: "in-progress" as const },
      outcome: "in-progress" as const,
    },
    {
      sequence: 2,
      actor,
      activity: derivedFact(frozen, goals, "社区志愿者完成每周活动安排", "activity"),
      result: derivedFact(frozen, outputs, "离线活动计划已形成", "result"),
      semantic_source: semanticSource,
      action: "complete" as const,
      state_change: { from: "in-progress" as const, to: "completed" as const },
      outcome: "completed" as const,
    },
  ];
  return {
    schema_version: "1.0",
    record_type: "product-definition-candidate",
    product_definition_id: productDefinitionId,
    frozen_requirement: frozen,
    frozen_requirement_digest: digestJson(frozen),
    prd: {
      product_name: fact(frozen, intent),
      problem: derivedFact(frozen, scenarios, "社区志愿者需要协调每周活动", "problem"),
      target_users: [fact(frozen, scenarios)],
      goals: [fact(frozen, goals)],
      scenarios: [derivedFact(frozen, scenarios, "社区志愿者在离线环境安排每周活动", "scenarios")],
      scope: [fact(frozen, outputs)],
      non_goals: [fact(frozen, nonGoals)],
      success_metrics: [{
        measurement: { kind: "completion-transition" as const },
        target: { semantic_source: semanticSource, required_state: "completed" as const },
        evidence: { journey_sequence: 2, transition_digest: digestProductJourneyTransition(productDefinitionId, steps[1]!) },
      }],
    },
    user_journey: {
      product_definition_id: productDefinitionId,
      steps,
    },
    capability_map: { product_definition_id: productDefinitionId, capabilities: [derivedFact(frozen, outputs, "提供离线活动计划工具", "capability")] },
  };
}

type ProductDefinitionStateRuntime = {
  readonly reduceProductDefinitionInteractionState?: (
    session: ReturnType<typeof createProductDefinitionInteractionSession>,
    event:
      | { readonly type: "user-action"; readonly verified_interaction: ReturnType<typeof verifyProductDefinitionInteraction>; readonly evaluated_at: string }
      | { readonly type: "evaluate"; readonly evaluated_at: string }
      | { readonly type: "view-change"; readonly display: ReturnType<typeof createUnverifiedProductDefinitionDisplay>; readonly evaluated_at: string },
  ) => { readonly status: string };
  readonly getProductDefinitionInteractionState?: (
    session: ReturnType<typeof createProductDefinitionInteractionSession>,
  ) => { readonly status: string };
};

async function loadProductDefinitionStateRuntime(): Promise<ProductDefinitionStateRuntime> {
  return await import("../../src/domain/product-definition.ts") as unknown as ProductDefinitionStateRuntime;
}

test("完整产品定义只接受 Frozen Requirement 中可验证的事实来源", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  assert.equal(parsed.product_definition_id, deriveProductDefinitionId(parsed.frozen_requirement));
  assert.equal(parsed.status, "ready-for-signoff");
});

test("产品定义 ID 由 Frozen Requirement 稳定身份派生，调用方不能通过改 ID 形成另一候选", () => {
  const frozen = frozenRequirement();
  const expectedId = deriveProductDefinitionId(frozen);
  const value = candidate(frozen);
  assert.equal(value.product_definition_id, expectedId);
  assert.throws(
    () => parseProductDefinitionCandidate({
      ...value,
      product_definition_id: "pd-user-selected-id",
      user_journey: { ...value.user_journey, product_definition_id: "pd-user-selected-id" },
      capability_map: { ...value.capability_map, product_definition_id: "pd-user-selected-id" },
    }),
    ProductDefinitionError,
  );
});

test("产品字段角色阻断约束冒充指标和场景冒充能力", () => {
  const value = candidate();
  const scenarioFact = fact(value.frozen_requirement, "/requirement_set/items/2/values/0");
  const metricFromConstraint = {
    ...value,
    prd: {
      ...value.prd,
      success_metrics: [{
        measurement: { kind: "completion-transition" as const },
        target: { semantic_source: fact(value.frozen_requirement, "/requirement_set/items/3/values/0").source, required_state: "completed" as const },
        evidence: value.prd.success_metrics[0]!.evidence,
      }],
    },
  };
  assert.throws(() => parseProductDefinitionCandidate(metricFromConstraint), ProductDefinitionError);
  const journeyActionFromScenario = {
    ...value,
    user_journey: {
      ...value.user_journey,
      steps: [{ ...value.user_journey.steps[0]!, semantic_source: scenarioFact.source }],
    },
  };
  assert.throws(() => parseProductDefinitionCandidate(journeyActionFromScenario), ProductDefinitionError);
  const capabilityFromScenario = {
    ...value,
    capability_map: {
      ...value.capability_map,
      capabilities: [scenarioFact],
    },
  };
  assert.throws(() => parseProductDefinitionCandidate(capabilityFromScenario), ProductDefinitionError);
});

test("derived 产品事实必须声明推导摘要并保留合法来源", () => {
  const value = candidate();
  const derivedProblem = {
    ...value,
    prd: {
      ...value.prd,
      problem: {
        kind: "derived" as const,
        value: "志愿者需要离线协调每周活动",
        derivation_summary: "role:problem; 根据目标用户与场景归纳协调问题",
        source_refs: [fact(value.frozen_requirement, "/requirement_set/items/2/values/0").source],
      },
    },
  };
  assert.equal(parseProductDefinitionCandidate(derivedProblem).prd.problem.kind, "derived");
  assert.throws(
    () => parseProductDefinitionCandidate({ ...derivedProblem, prd: { ...derivedProblem.prd, problem: { ...derivedProblem.prd.problem, derivation_summary: "" } } }),
    ProductDefinitionError,
  );
  assert.throws(
    () => parseProductDefinitionCandidate({ ...derivedProblem, prd: { ...derivedProblem.prd, problem: { ...derivedProblem.prd.problem, derivation_summary: "role:scenarios; 错误角色" } } }),
    ProductDefinitionError,
  );
});

test("旅程按来源分区拒绝重复转换和仅含状态标签的活动结果", () => {
  const value = candidate();
  const duplicateComplete = {
    ...value,
    user_journey: {
      ...value.user_journey,
      steps: [
        ...value.user_journey.steps,
        { ...value.user_journey.steps[1]!, sequence: 3 },
      ],
    },
  };
  const duplicateStart = {
    ...value,
    user_journey: {
      ...value.user_journey,
      steps: [
        value.user_journey.steps[0]!,
        { ...value.user_journey.steps[0]!, sequence: 2 },
      ],
    },
  };
  const stateLabels = {
    ...value,
    user_journey: {
      ...value.user_journey,
      steps: [
        {
          ...value.user_journey.steps[0]!,
          activity: derivedFact(value.frozen_requirement, "/requirement_set/items/1/values/0", "start", "activity"),
        },
        {
          ...value.user_journey.steps[1]!,
          result: derivedFact(value.frozen_requirement, "/requirement_set/items/4/values/0", "completed", "result"),
        },
      ],
    },
  };

  for (const invalidCandidate of [duplicateComplete, duplicateStart, stateLabels]) {
    assert.throws(() => parseProductDefinitionCandidate(invalidCandidate), ProductDefinitionError);
  }
});

test("L3 磁盘 replay 拒绝跨 semantic source 的完成链和孤立 metric evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/l3-regressions.json"), "utf8")) as {
    readonly journey_replays: readonly {
      readonly expected: string;
      readonly start_semantic_source: unknown;
      readonly complete_semantic_source: unknown;
      readonly metric_target: unknown;
    }[];
  };

  for (const replay of fixture.journey_replays) {
    const value = candidate();
    const startSemanticSource = replay.start_semantic_source as ProductSourceRef;
    const completeSemanticSource = replay.complete_semantic_source as ProductSourceRef;
    const metricTarget = replay.metric_target as ProductSourceRef;
    const steps = [
      { ...value.user_journey.steps[0]!, semantic_source: startSemanticSource },
      { ...value.user_journey.steps[1]!, semantic_source: completeSemanticSource },
    ];
    const crossSourceCandidate = {
      ...value,
      prd: {
        ...value.prd,
        success_metrics: [{
          measurement: { kind: "completion-transition" as const },
          target: { semantic_source: metricTarget, required_state: "completed" as const },
          evidence: {
            journey_sequence: 2,
            transition_digest: digestProductJourneyTransition(value.product_definition_id, steps[1]!),
          },
        }],
      },
      user_journey: { ...value.user_journey, steps },
    };

    assert.equal(replay.expected, "reject");
    assert.throws(() => parseProductDefinitionCandidate(crossSourceCandidate), ProductDefinitionError);
  }
});

test("L3 磁盘 replay 拒绝同一 direct source 坍缩到多个核心产品角色", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/l3-regressions.json"), "utf8")) as {
    readonly role_replays: readonly {
      readonly expected: string;
      readonly direct_source: { readonly pointer: string; readonly value_digest: string };
      readonly roles: readonly string[];
    }[];
  };

  for (const replay of fixture.role_replays) {
    const value = candidate();
    const direct = fact(value.frozen_requirement, replay.direct_source.pointer);
    assert.deepEqual(direct.source, replay.direct_source);
    const collapsedCandidate = {
      ...value,
      prd: {
        ...value.prd,
        problem: direct,
        target_users: [direct],
        scenarios: [direct],
      },
      user_journey: {
        ...value.user_journey,
        steps: value.user_journey.steps.map((step) => ({ ...step, actor: direct })),
      },
    };

    assert.deepEqual(replay.roles, ["problem", "target_users", "scenarios", "actor"]);
    assert.equal(replay.expected, "reject");
    assert.throws(() => parseProductDefinitionCandidate(collapsedCandidate), ProductDefinitionError);
  }
});

test("三类目标项目 fixture 仅以 manual-isolated 消费者契约验证完整候选", async () => {
  const identities = new Set<string>();
  for (const fixtureName of ["community-workshop", "expense-reminder", "project-delivery-tool"]) {
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), `tests/fixtures/product-definition/${fixtureName}.json`), "utf8")) as Record<string, unknown>;
    assert.equal(fixture.fixture_type, "complete-product-definition");
    assert.equal(fixture.evidence_scope, "manual-isolated consumer contract");
    assert.ok(fixture.frozen_requirement);
    assert.ok(fixture.product_definition);
    const parsed = parseProductDefinitionCandidate(fixture.product_definition);
    assert.equal(parsed.frozen_requirement.frozen_requirement_id, (fixture.frozen_requirement as Record<string, unknown>).frozen_requirement_id);
    assert.equal(parsed.product_definition_id, deriveProductDefinitionId(parsed.frozen_requirement));
    const metric = parsed.prd.success_metrics[0]!;
    assert.equal(metric.measurement.kind, "completion-transition");
    assert.equal(metric.target.required_state, "completed");
    assert.equal(metric.evidence.journey_sequence, 2);
    assert.deepEqual(parsed.user_journey.steps.map((step) => step.sequence), [1, 2]);
    for (const step of parsed.user_journey.steps) {
      assert.equal(step.actor.kind, "derived");
      assert.equal(step.activity.kind, "derived");
      assert.equal(step.result.kind, "derived");
      assert.equal(step.outcome, step.state_change.to);
    }
    assert.equal(parsed.prd.problem.kind, "derived");
    assert.equal(parsed.prd.target_users[0]!.kind, "direct");
    assert.equal(metric.evidence.transition_digest, digestProductJourneyTransition(parsed.product_definition_id, parsed.user_journey.steps[1]!));
    identities.add(`${parsed.frozen_requirement.project.repository_id}|${parsed.frozen_requirement.frozen_requirement_id}|${parsed.product_definition_id}`);
  }
  assert.equal(identities.size, 3);
});

test("磁盘指标负例会拒绝 direct goal 三重复用和带目标词的无关 evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/metric-evidence-mismatch.json"), "utf8")) as Record<string, unknown>;
  assert.equal(fixture.fixture_type, "metric-evidence-mismatch");
  assert.equal(fixture.expected, "reject");
  for (const metrics of Object.values(fixture.bypasses as Record<string, unknown>)) {
    const value = candidate();
    assert.throws(
      () => parseProductDefinitionCandidate({
        ...value,
        prd: { ...value.prd, success_metrics: metrics },
      }),
      ProductDefinitionError,
    );
  }
});

test("磁盘旅程负例会拒绝 no-op action、任意状态和无用 outcome", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/journey-action-missing.json"), "utf8")) as Record<string, unknown>;
  assert.equal(fixture.fixture_type, "journey-action-missing");
  assert.equal(fixture.expected, "reject");
  for (const steps of Object.values(fixture.bypasses as Record<string, unknown>)) {
    const value = candidate();
    assert.throws(
      () => parseProductDefinitionCandidate({
        ...value,
        user_journey: { ...value.user_journey, steps },
      }),
      ProductDefinitionError,
    );
  }
});

test("缺少范围、非目标、成功指标、旅程或能力映射会确定性阻断", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/missing-required-field.json"), "utf8")) as Record<string, unknown>;
  assert.equal(fixture.fixture_type, "missing-required-field");
  assert.equal(fixture.field, "scope");
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

test("来源 JSON Pointer 越界、摘要篡改、未知字段和未冻结输入均 fail closed", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/source-binding-mismatch.json"), "utf8")) as Record<string, unknown>;
  assert.equal(fixture.fixture_type, "source-binding-mismatch");
  assert.equal(fixture.field, "goals");
  const sourceMismatch = candidate();
  sourceMismatch.prd.goals[0] = { ...sourceMismatch.prd.goals[0]!, source: { pointer: "/requirement_set/items/1/values/0", value_digest: `sha256:${"0".repeat(64)}` } };
  assert.throws(() => parseProductDefinitionCandidate(sourceMismatch), ProductDefinitionError);
  assert.throws(() => parseProductDefinitionCandidate({ ...candidate(), unexpected: true }), ProductDefinitionError);
  assert.throws(() => parseProductDefinitionCandidate({ ...candidate(), frozen_requirement: { status: "frozen" } }), ProductDefinitionError);
});

test("会签仅接受进程内可信 verifier capability，且绑定完整展示与产品定义", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/untrusted-signoff.json"), "utf8")) as Record<string, unknown>;
  assert.equal(fixture.fixture_type, "untrusted-signoff");
  assert.equal(fixture.expected, "reject");
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
  reduceProductDefinitionInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-11T11:10:01.000Z",
  });
  const signed = signProductDefinition(parsed, verified, session, () => new Date("2026-08-11T11:11:00.000Z"));
  assert.equal(recoverSignedProductDefinition(signed).status, "signed");
  assert.throws(() => recoverSignedProductDefinition({ ...signed, self_described_signed: true }), ProductDefinitionError);

  assert.throws(
    () => signProductDefinition(parsed, { ...verified }, session, () => new Date("2026-08-11T11:11:00.000Z")),
    ProductDefinitionError,
  );
  assert.throws(
    () => parseProductDefinitionCandidate({ ...candidate(), product_definition_id: "pd-other", user_journey: { ...candidate().user_journey, product_definition_id: "pd-other" }, capability_map: { ...candidate().capability_map, product_definition_id: "pd-other" } }),
    ProductDefinitionError,
  );
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

test("L3 磁盘 replay 要求会签 session 保持当前 confirmed 状态", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/l3-regressions.json"), "utf8")) as {
    readonly signoff_replays: readonly {
      readonly expected: string;
      readonly expected_state: string;
      readonly event:
        | { readonly type: "user-action"; readonly action: "reject" | "cancel"; readonly user_action_id: string; readonly occurred_at: string; readonly evaluated_at: string }
        | { readonly type: "evaluate"; readonly evaluated_at: string }
        | { readonly type: "view-change"; readonly display_id: string; readonly displayed_at: string; readonly evaluated_at: string };
      readonly sign_at: string;
    }[];
  };
  const runtime = await loadProductDefinitionStateRuntime();
  assert.equal(typeof runtime.reduceProductDefinitionInteractionState, "function");
  assert.equal(typeof runtime.getProductDefinitionInteractionState, "function");
  const reduce = runtime.reduceProductDefinitionInteractionState!;
  const getState = runtime.getProductDefinitionInteractionState!;
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "l3-product-signoff",
    created_at: "2026-08-11T11:00:00.000Z",
    expires_at: "2026-08-11T12:00:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;

  for (const [index, replay] of fixture.signoff_replays.entries()) {
    const display = createUnverifiedProductDefinitionDisplay(challenge, {
      display_id: `l3-product-display-${index}`,
      displayed_at: "2026-08-11T11:05:00.000Z",
    });
    const confirmedAction = createUnverifiedProductDefinitionUserAction(display, {
      user_action_id: `l3-product-confirm-${index}`,
      action: "confirm",
      occurred_at: "2026-08-11T11:10:00.000Z",
    });
    const confirmed = verifyProductDefinitionInteraction({ display, user_action: confirmedAction }, verifier);
    const session = createProductDefinitionInteractionSession(confirmed);
    assert.equal(getState(session).status, "pending");
    assert.throws(() => getState({ ...session }), ProductDefinitionError);
    assert.equal(reduce(session, {
      type: "user-action",
      verified_interaction: confirmed,
      evaluated_at: "2026-08-11T11:10:01.000Z",
    }).status, "confirmed");
    assert.throws(
      () => reduce(session, { type: "evaluate", evaluated_at: "2026-08-11T11:10:00.000Z" }),
      ProductDefinitionError,
    );

    if (replay.event.type === "user-action") {
      const action = createUnverifiedProductDefinitionUserAction(display, {
        user_action_id: replay.event.user_action_id,
        action: replay.event.action,
        occurred_at: replay.event.occurred_at,
      });
      const verified = verifyProductDefinitionInteraction({ display, user_action: action }, verifier);
      reduce(session, { type: "user-action", verified_interaction: verified, evaluated_at: replay.event.evaluated_at });
    } else if (replay.event.type === "view-change") {
      const changedDisplay = createUnverifiedProductDefinitionDisplay(challenge, {
        display_id: replay.event.display_id,
        displayed_at: replay.event.displayed_at,
      });
      reduce(session, { type: "view-change", display: changedDisplay, evaluated_at: replay.event.evaluated_at });
    } else {
      reduce(session, replay.event);
    }

    assert.equal(replay.expected, "reject");
    assert.equal(getState(session).status, replay.expected_state);
    assert.throws(() => signProductDefinition(parsed, confirmed, session, () => new Date(replay.sign_at)), ProductDefinitionError);
  }
});

test("产品定义会签 reducer 拒绝可变访问器事件，不能绕过 verified capability", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "signoff-accessor-event",
    created_at: "2026-08-11T11:00:00.000Z",
    expires_at: "2026-08-11T12:00:00.000Z",
  });
  const display = createUnverifiedProductDefinitionDisplay(challenge, {
    display_id: "product-display-accessor-event",
    displayed_at: "2026-08-11T11:05:00.000Z",
  });
  const action = createUnverifiedProductDefinitionUserAction(display, {
    user_action_id: "product-action-accessor-event",
    action: "confirm",
    occurred_at: "2026-08-11T11:10:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyProductDefinitionInteraction({ display, user_action: action }, verifier);
  const session = createProductDefinitionInteractionSession(verified);
  let capabilityReads = 0;
  const mutableEvent = Object.defineProperty({
    type: "user-action",
    evaluated_at: "2026-08-11T11:10:01.000Z",
  }, "verified_interaction", {
    enumerable: true,
    get: () => {
      capabilityReads += 1;
      return capabilityReads === 1
        ? verified
        : { user_action: { user_action: "cancel", occurred_at: action.occurred_at } };
    },
  });

  assert.throws(
    () => reduceProductDefinitionInteractionState(
      session,
      mutableEvent as unknown as ProductDefinitionInteractionStateEvent,
    ),
    ProductDefinitionError,
  );
  assert.equal(capabilityReads, 0);
  assert.equal(getProductDefinitionInteractionState(session).status, "pending");
});

test("产品定义会签 reducer 的 Proxy 快照重入不能用陈旧状态复活终态 session", () => {
  for (const terminalAction of ["reject", "cancel"] as const) {
    const expectedStatus = terminalAction === "reject" ? "rejected" : "cancelled";
    const parsed = parseProductDefinitionCandidate(candidate());
    const challenge = createProductDefinitionSignoffChallenge(parsed, {
      signoff_id: `signoff-proxy-reentry-${terminalAction}`,
      created_at: "2026-08-11T11:00:00.000Z",
      expires_at: "2026-08-11T12:00:00.000Z",
    });
    const display = createUnverifiedProductDefinitionDisplay(challenge, {
      display_id: `product-display-proxy-reentry-${terminalAction}`,
      displayed_at: "2026-08-11T11:05:00.000Z",
    });
    const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
    const confirm = verifyProductDefinitionInteraction({
      display,
      user_action: createUnverifiedProductDefinitionUserAction(display, {
        user_action_id: `product-action-proxy-confirm-${terminalAction}`,
        action: "confirm",
        occurred_at: "2026-08-11T11:10:00.000Z",
      }),
    }, verifier);
    const terminal = verifyProductDefinitionInteraction({
      display,
      user_action: createUnverifiedProductDefinitionUserAction(display, {
        user_action_id: `product-action-proxy-${terminalAction}`,
        action: terminalAction,
        occurred_at: "2026-08-11T11:10:00.000Z",
      }),
    }, verifier);
    const session = createProductDefinitionInteractionSession(confirm);
    const outerEvent = {
      type: "user-action" as const,
      verified_interaction: confirm,
      evaluated_at: "2026-08-11T11:10:01.000Z",
    };
    let reentered = false;
    const reentrantEvent = new Proxy(outerEvent, {
      ownKeys: (target) => {
        if (!reentered) {
          reentered = true;
          reduceProductDefinitionInteractionState(session, {
            type: "user-action",
            verified_interaction: terminal,
            evaluated_at: "2026-08-11T11:10:01.000Z",
          });
        }
        return Reflect.ownKeys(target);
      },
    });

    reduceProductDefinitionInteractionState(session, reentrantEvent);

    assert.equal(getProductDefinitionInteractionState(session).status, expectedStatus);
    assert.throws(
      () => signProductDefinition(parsed, confirm, session, () => new Date("2026-08-11T11:11:00.000Z")),
      ProductDefinitionError,
    );
  }
});

test("产品定义会签 reducer 深快照 view-change display，嵌套 Proxy 重入不能复活终态", () => {
  for (const terminalAction of ["reject", "cancel"] as const) {
    const expectedStatus = terminalAction === "reject" ? "rejected" : "cancelled";
    const parsed = parseProductDefinitionCandidate(candidate());
    const challenge = createProductDefinitionSignoffChallenge(parsed, {
      signoff_id: `signoff-view-proxy-reentry-${terminalAction}`,
      created_at: "2026-08-11T11:00:00.000Z",
      expires_at: "2026-08-11T12:00:00.000Z",
    });
    const display = createUnverifiedProductDefinitionDisplay(challenge, {
      display_id: `product-display-view-proxy-reentry-${terminalAction}`,
      displayed_at: "2026-08-11T11:05:00.000Z",
    });
    const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
    const confirm = verifyProductDefinitionInteraction({
      display,
      user_action: createUnverifiedProductDefinitionUserAction(display, {
        user_action_id: `product-action-view-proxy-confirm-${terminalAction}`,
        action: "confirm",
        occurred_at: "2026-08-11T11:10:00.000Z",
      }),
    }, verifier);
    const terminal = verifyProductDefinitionInteraction({
      display,
      user_action: createUnverifiedProductDefinitionUserAction(display, {
        user_action_id: `product-action-view-proxy-${terminalAction}`,
        action: terminalAction,
        occurred_at: "2026-08-11T11:11:00.000Z",
      }),
    }, verifier);
    const session = createProductDefinitionInteractionSession(confirm);
    reduceProductDefinitionInteractionState(session, {
      type: "user-action",
      verified_interaction: confirm,
      evaluated_at: "2026-08-11T11:10:01.000Z",
    });
    let reentered = false;
    const reentrantDisplay = new Proxy(display, {
      ownKeys: (target) => {
        if (!reentered) {
          reentered = true;
          reduceProductDefinitionInteractionState(session, {
            type: "user-action",
            verified_interaction: terminal,
            evaluated_at: "2026-08-11T11:11:01.000Z",
          });
        }
        return Reflect.ownKeys(target);
      },
    });

    reduceProductDefinitionInteractionState(session, {
      type: "view-change",
      display: reentrantDisplay,
      evaluated_at: "2026-08-11T11:11:02.000Z",
    });

    assert.equal(getProductDefinitionInteractionState(session).status, expectedStatus);
    assert.throws(
      () => signProductDefinition(parsed, confirm, session, () => new Date("2026-08-11T11:12:00.000Z")),
      ProductDefinitionError,
    );
  }
});

test("产品定义 verifier 深快照 replay，验证后的可变 reject 不能改成 confirm", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "signoff-mutable-replay",
    created_at: "2026-08-11T11:00:00.000Z",
    expires_at: "2026-08-11T12:00:00.000Z",
  });
  const display = JSON.parse(JSON.stringify(createUnverifiedProductDefinitionDisplay(challenge, {
    display_id: "product-display-mutable-replay",
    displayed_at: "2026-08-11T11:05:00.000Z",
  }))) as ProductDefinitionDisplay;
  const action = JSON.parse(JSON.stringify(createUnverifiedProductDefinitionUserAction(display, {
    user_action_id: "product-action-mutable-replay",
    action: "reject",
    occurred_at: "2026-08-11T11:10:00.000Z",
  }))) as ProductDefinitionUserAction;
  const verified = verifyProductDefinitionInteraction(
    { display, user_action: action },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  const session = createProductDefinitionInteractionSession(verified);

  (action as { user_action: string }).user_action = "confirm";

  assert.equal(reduceProductDefinitionInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-11T11:10:01.000Z",
  }).status, "rejected");
  (display as { display_id: string }).display_id = "mutated-after-verification";
  assert.equal(verified.user_action.user_action, "reject");
  assert.equal(verified.display.display_id, "product-display-mutable-replay");
  assert.throws(
    () => signProductDefinition(parsed, verified, session, () => new Date("2026-08-11T11:11:00.000Z")),
    ProductDefinitionError,
  );
});

test("同一旧 display 的新 confirm replay 复用终态 session，不能重新签署", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "signoff-old-display-replay",
    created_at: "2026-08-11T11:00:00.000Z",
    expires_at: "2026-08-11T12:00:00.000Z",
  });
  const display = createUnverifiedProductDefinitionDisplay(challenge, {
    display_id: "product-display-old-replay",
    displayed_at: "2026-08-11T11:05:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const firstConfirm = verifyProductDefinitionInteraction({
    display,
    user_action: createUnverifiedProductDefinitionUserAction(display, {
      user_action_id: "product-action-first-confirm",
      action: "confirm",
      occurred_at: "2026-08-11T11:10:00.000Z",
    }),
  }, verifier);
  const session = createProductDefinitionInteractionSession(firstConfirm);
  reduceProductDefinitionInteractionState(session, {
    type: "user-action",
    verified_interaction: firstConfirm,
    evaluated_at: "2026-08-11T11:10:01.000Z",
  });
  const reject = verifyProductDefinitionInteraction({
    display,
    user_action: createUnverifiedProductDefinitionUserAction(display, {
      user_action_id: "product-action-terminal-reject",
      action: "reject",
      occurred_at: "2026-08-11T11:11:00.000Z",
    }),
  }, verifier);
  reduceProductDefinitionInteractionState(session, {
    type: "user-action",
    verified_interaction: reject,
    evaluated_at: "2026-08-11T11:11:01.000Z",
  });
  const secondConfirm = verifyProductDefinitionInteraction({
    display,
    user_action: createUnverifiedProductDefinitionUserAction(display, {
      user_action_id: "product-action-second-confirm",
      action: "confirm",
      occurred_at: "2026-08-11T11:12:00.000Z",
    }),
  }, verifier);
  const reusedSession = createProductDefinitionInteractionSession(secondConfirm);

  assert.equal(reusedSession, session);
  assert.equal(reduceProductDefinitionInteractionState(reusedSession, {
    type: "user-action",
    verified_interaction: secondConfirm,
    evaluated_at: "2026-08-11T11:12:01.000Z",
  }).status, "rejected");
  assert.throws(
    () => signProductDefinition(parsed, secondConfirm, reusedSession, () => new Date("2026-08-11T11:13:00.000Z")),
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
