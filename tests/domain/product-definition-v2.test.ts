import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  createProductDefinitionInteractionSession,
  createProductDefinitionSignoffChallenge,
  createUnverifiedProductDefinitionDisplay,
  createUnverifiedProductDefinitionUserAction,
  deriveProductDefinitionId,
  digestProductJourneyTransition,
  parseProductDefinitionCandidate,
  reduceProductDefinitionInteractionState,
  recoverSignedProductDefinition,
  signProductDefinition,
  verifyProductDefinitionInteraction,
  ProductDefinitionError,
} from "../../src/domain/product-definition.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";
import { createConfirmationChallenge, createConfirmationEnvelope, createConfirmationInteractionSession, createUnverifiedConfirmationViewDisplay, createUnverifiedUserConfirmationAction, reduceConfirmationInteractionState, verifyConfirmationInteraction } from "../../src/domain/requirement-confirmation.ts";
import { freezeRequirementSet, type FrozenRequirement } from "../../src/domain/requirement-freeze.ts";

// 非目标字段在 Requirement Set 中的固定位置：七个字段按 REQUIREMENT_FIELDS 顺序排列。
const NON_GOAL_ITEM_POINTER = "/requirement_set/items/5";
const CONSTRAINT_ITEM_POINTER = "/requirement_set/items/3";
const CLARIFICATION_ITEM_POINTER = "/requirement_set/items/6";

function frozenRequirement(nonGoalStatus: "identified" | "none" = "identified"): FrozenRequirement {
  const candidateNonGoals = nonGoalStatus === "identified"
    ? { status: "identified" as const, items: [{ value: "不连接外部服务", evidence: [{ start: 26, end: 33, quote: "不连接外部服务" }] }] }
    : { status: "missing" as const, items: [] as const, clarification_question: "是否还有额外非目标？" };
  const userResolutions = nonGoalStatus === "identified"
    ? [{ field: "clarification_gaps", status: "none", values: [] }]
    : [
        { field: "non_goal_gaps", status: "none", values: [] },
        { field: "clarification_gaps", status: "none", values: [] },
      ];
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: `req-product-definition-v2-${nonGoalStatus}`,
    project: {
      repository_id: `sha256:${"4".repeat(64)}`,
      formal_baseline: "b965fe5a49c45b35e99f83541c6d03c4a86e21b7",
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
        non_goal_gaps: candidateNonGoals,
        clarification_gaps: { status: "missing", items: [], clarification_question: "是否还有需要澄清的内容？" },
      },
    },
    user_resolutions: userResolutions,
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: `confirm-product-definition-v2-${nonGoalStatus}`,
    created_at: "2026-08-13T09:00:00.000Z",
    expires_at: "2026-08-13T10:00:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: `display-product-definition-v2-${nonGoalStatus}`,
    displayed_at: "2026-08-13T09:05:00.000Z",
  });
  const userAction = createUnverifiedUserConfirmationAction(display, {
    user_action_id: `action-product-definition-v2-${nonGoalStatus}`,
    action: "confirm",
    occurred_at: "2026-08-13T09:10:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
  const session = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-13T09:10:01.000Z",
  });
  return freezeRequirementSet({
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(verified),
  }, [], { verifier, verified_interaction: verified, interaction_session: session, now: () => new Date("2026-08-13T09:11:00.000Z") });
}

function fact(frozen: FrozenRequirement, pointer: string) {
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let value: unknown = frozen;
  for (const token of tokens) value = (value as Record<string, unknown>)[token];
  return { kind: "direct" as const, value: value as string, source: { pointer, value_digest: digestJson(value) } };
}

function derivedFact(frozen: FrozenRequirement, pointer: string, value: string, role: string) {
  const source = fact(frozen, pointer);
  return {
    kind: "derived" as const,
    value,
    derivation_summary: `role:${role}; 根据 ${source.value} 形成可审计定义`,
    source_refs: [source.source],
  };
}

function nonGoalSource(frozen: FrozenRequirement, pointer = NON_GOAL_ITEM_POINTER) {
  const itemIndex = Number(pointer.split("/")[3]);
  return { pointer, item_digest: digestJson(frozen.requirement_set.items[itemIndex]) };
}

function historicalFrozenWithItem(
  frozen: FrozenRequirement,
  itemIndex: number,
  status: "identified" | "none" | "unresolved" | "rejected" | "deferred",
): FrozenRequirement {
  const originalItems = frozen.requirement_set.items;
  const updatedItems = originalItems.map((item, index) => {
    if (index !== itemIndex) return item;
    return {
      ...item,
      status,
      values: status === "identified" ? ["历史待澄清事项"] : [],
      source: status === "unresolved" ? "unresolved" as const : status === "identified" ? item.source : "user" as const,
    };
  });
  const { content_digest: _contentDigest, ...requirementSetWithoutDigest } = frozen.requirement_set;
  const requirementSetBase = {
    ...requirementSetWithoutDigest,
    status: "ready-for-confirmation" as const,
    items: updatedItems,
    summary: updatedItems.map((item) => `${item.field}|${item.status}|${item.values.join("\u001f")}`).join("\n"),
  };
  const requirementSet = { ...requirementSetBase, content_digest: digestJson(requirementSetBase) };
  const oldEnvelope = frozen.confirmation;
  const oldChallenge = oldEnvelope.challenge;
  const oldView = oldChallenge.confirmation_view;
  const view = {
    ...oldView,
    requirement_set_digest: requirementSet.content_digest,
    summary: requirementSet.summary,
    items: requirementSet.items,
  };
  const viewDigest = digestJson(view);
  const challenge = {
    ...oldChallenge,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view: view,
    confirmation_view_digest: viewDigest,
  };
  const challengeDigest = digestJson(challenge);
  const display = {
    ...oldEnvelope.display,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view_digest: viewDigest,
    confirmation_view: view,
    challenge,
    challenge_digest: challengeDigest,
  };
  const displayDigest = digestJson(display);
  const userAction = {
    ...oldEnvelope.user_action,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view_digest: viewDigest,
    challenge_digest: challengeDigest,
    display_digest: displayDigest,
  };
  const envelope = {
    ...oldEnvelope,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view_digest: viewDigest,
    challenge,
    challenge_digest: challengeDigest,
    display,
    display_digest: displayDigest,
    user_action: userAction,
    user_action_digest: digestJson(userAction),
  };
  const confirmationDigest = digestJson(envelope);
  return {
    ...frozen,
    frozen_requirement_id: `frozen-${digestJson({ content_digest: requirementSet.content_digest, confirmation_digest: confirmationDigest }).slice("sha256:".length)}`,
    requirement_set: requirementSet,
    requirement_content_digest: requirementSet.content_digest,
    confirmation: envelope,
    confirmation_binding_digest: confirmationDigest,
    confirmation_view_digest: viewDigest,
  };
}

function candidate(frozen: FrozenRequirement = frozenRequirement()) {
  const intent = "/requirement_set/items/0/values/0";
  const goals = "/requirement_set/items/1/values/0";
  const scenarios = "/requirement_set/items/2/values/0";
  const outputs = "/requirement_set/items/4/values/0";
  const nonGoalItem = frozen.requirement_set.items[5]!;
  const nonGoals = nonGoalItem.status === "identified"
    ? { status: "identified" as const, items: [fact(frozen, `${NON_GOAL_ITEM_POINTER}/values/0`)], source: nonGoalSource(frozen) }
    : { status: "none" as const, items: [] as readonly unknown[], source: nonGoalSource(frozen) };
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
    schema_version: "2.0",
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
      non_goals: nonGoals,
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

// 2.0 非目标状态对象的结构化读取入口，供断言在版本升级前后保持同一校验口径。
type ParsedNonGoals = {
  readonly status: "identified" | "none";
  readonly items: readonly { readonly kind: "direct" | "derived"; readonly value: string }[];
  readonly source: { readonly pointer: string; readonly item_digest: string };
};

function parsedNonGoals(parsed: ReturnType<typeof parseProductDefinitionCandidate>): ParsedNonGoals {
  return (parsed.prd as unknown as { readonly non_goals: ParsedNonGoals }).non_goals;
}

function assertProductDefinitionRejected(value: unknown, expectedCode: ProductDefinitionError["code"] = "INVALID_PRODUCT_DEFINITION") {
  assert.throws(
    () => parseProductDefinitionCandidate(value),
    (error: unknown) => error instanceof ProductDefinitionError && error.code === expectedCode,
  );
}

test("2.0 identified 候选以字段级状态来源绑定非目标并成功解析", () => {
  const frozen = frozenRequirement("identified");
  const parsed = parseProductDefinitionCandidate(candidate(frozen));
  assert.equal(parsed.schema_version, "2.0");
  assert.equal(parsed.status, "ready-for-signoff");
  assert.equal(parsed.product_definition_id, deriveProductDefinitionId(parsed.frozen_requirement));
  const nonGoals = parsedNonGoals(parsed);
  assert.equal(nonGoals.status, "identified");
  assert.equal(nonGoals.items.length, 1);
  assert.equal(nonGoals.items[0]!.kind, "direct");
  assert.equal(nonGoals.items[0]!.value, "不连接外部服务");
  assert.equal(nonGoals.source.pointer, NON_GOAL_ITEM_POINTER);
  // 字段级来源摘要必须绑定完整 Requirement Set item，而非仅其取值。
  assert.equal(nonGoals.source.item_digest, digestJson(frozen.requirement_set.items[5]));
});

test("2.0 none 候选保留完整 non_goal_gaps item 的 RFC8785 摘要证据，不退化为裸空数组", () => {
  const frozen = frozenRequirement("none");
  const parsed = parseProductDefinitionCandidate(candidate(frozen));
  const nonGoals = parsedNonGoals(parsed);
  assert.equal(nonGoals.status, "none");
  assert.deepEqual(nonGoals.items, []);
  const noneItem = frozen.requirement_set.items[5]!;
  assert.equal(noneItem.field, "non_goal_gaps");
  assert.equal(noneItem.status, "none");
  assert.deepEqual(noneItem.values, []);
  // 显式 none 必须保留字段、状态、空值和用户来源证据的可验证摘要。
  assert.equal(nonGoals.source.pointer, NON_GOAL_ITEM_POINTER);
  assert.equal(nonGoals.source.item_digest, digestJson(noneItem));
});

test("产品专属版本判定只接受 2.0，旧 1.0 候选拒绝且不迁移不双读", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  // 1.0 线格式（non_goals 为事实数组）必须显式拒绝，不得自动迁移或猜测。
  const legacy = {
    ...value,
    schema_version: "1.0",
    prd: { ...value.prd, non_goals: [fact(frozen, `${NON_GOAL_ITEM_POINTER}/values/0`)] },
  };
  assertProductDefinitionRejected(legacy);
  for (const schemaVersion of ["1.1", "2", "2.0.0", "3.0", 2.0, null]) {
    assertProductDefinitionRejected({ ...value, schema_version: schemaVersion });
  }
  const missingVersion: Record<string, unknown> = { ...value };
  delete missingVersion.schema_version;
  assertProductDefinitionRejected(missingVersion);
});

test("identified/none 条件结构严格，状态与条目数量必须一致且根字段精确", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  // identified 要求至少一项；空条目属于非法 S1.2 数据，fail closed。
  assertProductDefinitionRejected({ ...value, prd: { ...value.prd, non_goals: { ...value.prd.non_goals, items: [] } } });
  // none 要求条目精确为空，不允许伪造占位事实。
  const noneFrozen = frozenRequirement("none");
  const noneValue = candidate(noneFrozen);
  const noneGoals = { status: "none" as const, items: [], source: nonGoalSource(noneFrozen) };
  assertProductDefinitionRejected({
    ...noneValue,
    prd: { ...noneValue.prd, non_goals: { ...noneGoals, items: [fact(noneFrozen, `${CONSTRAINT_ITEM_POINTER}/values/0`)] } },
  });
  // rejected/deferred/unresolved 已由 S1.2 readiness 阻断，不存在于合法候选。
  for (const status of ["rejected", "deferred", "unresolved"]) {
    assertProductDefinitionRejected({ ...value, prd: { ...value.prd, non_goals: { ...value.prd.non_goals, status, items: [] } } });
  }
  // 根字段必须且只能是 status、items、source。
  assertProductDefinitionRejected({ ...value, prd: { ...value.prd, non_goals: { ...value.prd.non_goals, note: "补充说明" } } });
  assertProductDefinitionRejected({ ...value, prd: { ...value.prd, non_goals: { status: "identified", items: value.prd.non_goals.items } } });
  assertProductDefinitionRejected({ ...value, prd: { ...value.prd, non_goals: { status: "identified", source: value.prd.non_goals.source } } });
});

test("S1.3 在历史 Frozen Requirement 恢复后重新执行当前 readiness", () => {
  const base = frozenRequirement("identified");
  const baseCandidate = candidate(base);
  for (const status of ["rejected", "deferred", "unresolved"] as const) {
    const historical = historicalFrozenWithItem(base, 5, status);
    assertProductDefinitionRejected({ ...baseCandidate, frozen_requirement: historical, frozen_requirement_digest: digestJson(historical) }, "REQUIREMENT_NOT_FROZEN");
  }
  for (const status of ["identified", "rejected", "deferred", "unresolved"] as const) {
    const historical = historicalFrozenWithItem(base, 6, status);
    assertProductDefinitionRejected({ ...baseCandidate, frozen_requirement: historical, frozen_requirement_digest: digestJson(historical) }, "REQUIREMENT_NOT_FROZEN");
  }
});

test("S1.3 非目标产品状态必须与完整 non_goal_gaps 源条目状态精确一致", () => {
  const identified = frozenRequirement("identified");
  const none = frozenRequirement("none");
  const identifiedCandidate = candidate(identified);
  const noneCandidate = candidate(none);
  assertProductDefinitionRejected({
    ...identifiedCandidate,
    prd: {
      ...identifiedCandidate.prd,
      non_goals: {
        status: "none",
        items: [],
        source: nonGoalSource(identified),
      },
    },
  }, "SOURCE_BINDING_MISMATCH");
  assertProductDefinitionRejected({
    ...noneCandidate,
    prd: {
      ...noneCandidate.prd,
      non_goals: {
        status: "identified",
        items: [{
          kind: "direct",
          value: "伪造的非目标",
          source: { pointer: `${NON_GOAL_ITEM_POINTER}/values/0`, value_digest: digestJson("伪造的非目标") },
        }],
        source: nonGoalSource(none),
      },
    },
  }, "SOURCE_BINDING_MISMATCH");
});

test("字段级来源必须精确指向完整 non_goal_gaps item，摘要绑定整个 item", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  // 不得指向任意 /values/N：该指针形状即非法，Schema 层直接拒绝。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: { pointer: `${NON_GOAL_ITEM_POINTER}/values/0`, item_digest: digestJson(frozen.requirement_set.items[5]) } } },
  });
  // 不得指向 constraint item。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: nonGoalSource(frozen, CONSTRAINT_ITEM_POINTER) } },
  }, "SOURCE_BINDING_MISMATCH");
  // 不得指向 clarification item。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: nonGoalSource(frozen, CLARIFICATION_ITEM_POINTER) } },
  }, "SOURCE_BINDING_MISMATCH");
  // 摘要必须是完整 item 的 RFC8785 SHA-256；仅 values 的摘要不满足字段级证据。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: { pointer: NON_GOAL_ITEM_POINTER, item_digest: digestJson(frozen.requirement_set.items[5]!.values) } } },
  }, "SOURCE_BINDING_MISMATCH");
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: { pointer: NON_GOAL_ITEM_POINTER, item_digest: `sha256:${"0".repeat(64)}` } } },
  }, "SOURCE_BINDING_MISMATCH");
  // 越界 item 指针 fail closed。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, source: { pointer: "/requirement_set/items/99", item_digest: digestJson(frozen.requirement_set.items[5]) } } },
  }, "SOURCE_BINDING_MISMATCH");
});

test("constraint 与 clarification 不得冒充非目标条目来源", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  // direct 条目绑定 constraint 值必须拒绝。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, items: [fact(frozen, `${CONSTRAINT_ITEM_POINTER}/values/0`)] } },
  }, "SOURCE_BINDING_MISMATCH");
  // derived 条目的来源引用绑定 constraint 值同样拒绝。
  assertProductDefinitionRejected({
    ...value,
    prd: {
      ...value.prd,
      non_goals: {
        ...value.prd.non_goals,
        items: [derivedFact(frozen, `${CONSTRAINT_ITEM_POINTER}/values/0`, "低成本不能成为产品目标", "non_goals")],
      },
    },
  }, "SOURCE_BINDING_MISMATCH");
  // 条目也不能绑定 clarification_gaps 之外的任意字段值（例如 goals）。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, items: [fact(frozen, "/requirement_set/items/1/values/0")] } },
  }, "SOURCE_BINDING_MISMATCH");
});

test("identified 条目仍按 direct/derived 规则绑定同一 non_goal_gaps item 下的值", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  const direct = fact(frozen, `${NON_GOAL_ITEM_POINTER}/values/0`);
  const derived = {
    kind: "derived" as const,
    value: "不替代人工协调职责",
    derivation_summary: "role:non_goals; 根据 不连接外部服务 归纳非目标边界",
    source_refs: [direct.source],
  };
  const parsed = parseProductDefinitionCandidate({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, items: [direct, derived] } },
  });
  assert.equal(parsedNonGoals(parsed).items.length, 2);
  assert.equal(parsedNonGoals(parsed).items[1]!.kind, "derived");
  // direct 事实必须等于来源值；篡改条目文本即破坏绑定。
  assertProductDefinitionRejected({
    ...value,
    prd: { ...value.prd, non_goals: { ...value.prd.non_goals, items: [{ ...direct, value: "不连接外部服务（改写）" }] } },
  }, "SOURCE_BINDING_MISMATCH");
});

test("同步篡改内嵌 Frozen Requirement 与非目标字段级摘要仍然 fail closed", () => {
  const frozen = frozenRequirement("identified");
  const value = candidate(frozen);
  const tamperedItem = { ...frozen.requirement_set.items[5]!, values: ["篡改后的非目标"] };
  const tamperedFrozen = {
    ...frozen,
    requirement_set: {
      ...frozen.requirement_set,
      items: frozen.requirement_set.items.map((item, index) => (index === 5 ? tamperedItem : item)),
    },
  };
  // 同时改写内嵌 Frozen Requirement、其 digest 与非目标字段级摘要，仍必须拒绝。
  assertProductDefinitionRejected({
    ...value,
    frozen_requirement: tamperedFrozen,
    frozen_requirement_digest: digestJson(tamperedFrozen),
    prd: {
      ...value.prd,
      non_goals: {
        status: "identified" as const,
        items: [{ kind: "direct" as const, value: "篡改后的非目标", source: { pointer: `${NON_GOAL_ITEM_POINTER}/values/0`, value_digest: digestJson("篡改后的非目标") } }],
        source: { pointer: NON_GOAL_ITEM_POINTER, item_digest: digestJson(tamperedItem) },
      },
    },
  }, "REQUIREMENT_NOT_FROZEN");
});

test("2.0 候选完整会签链保持既有签署与恢复安全规则", () => {
  const parsed = parseProductDefinitionCandidate(candidate());
  const challenge = createProductDefinitionSignoffChallenge(parsed, {
    signoff_id: "signoff-product-definition-v2",
    created_at: "2026-08-13T11:00:00.000Z",
    expires_at: "2026-08-13T12:00:00.000Z",
  });
  const display = createUnverifiedProductDefinitionDisplay(challenge, {
    display_id: "product-display-v2",
    displayed_at: "2026-08-13T11:05:00.000Z",
  });
  const action = createUnverifiedProductDefinitionUserAction(display, {
    user_action_id: "product-action-v2",
    action: "confirm",
    occurred_at: "2026-08-13T11:10:00.000Z",
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyProductDefinitionInteraction({ display, user_action: action }, verifier);
  const session = createProductDefinitionInteractionSession(verified);
  reduceProductDefinitionInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-13T11:10:01.000Z",
  });
  const signed = signProductDefinition(parsed, verified, session, () => new Date("2026-08-13T11:11:00.000Z"));
  const restored = recoverSignedProductDefinition(JSON.parse(canonicalizeJson(signed)));
  assert.equal(restored.status, "signed");
  assert.equal(restored.product_definition.schema_version, "2.0");
  assert.equal(restored.product_definition_digest, signed.product_definition_digest);
  // 恢复安全规则不放宽：附加字段与摘要篡改仍被拒绝。
  assert.throws(() => recoverSignedProductDefinition({ ...signed, self_described_signed: true }), ProductDefinitionError);
  assert.throws(
    () => recoverSignedProductDefinition({ ...signed, product_definition_digest: `sha256:${"e".repeat(64)}` }),
    ProductDefinitionError,
  );
});
