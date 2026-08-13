import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { deriveProductDefinitionId, digestProductJourneyTransition, type ProductJourneyStep } from "../../src/domain/product-definition.ts";
import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
} from "../../src/domain/requirement-confirmation.ts";
import { freezeRequirementSet, recoverFrozenRequirement, type FrozenRequirement } from "../../src/domain/requirement-freeze.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";

const targetProjectFixtures = [
  "community-workshop",
  "expense-reminder",
  "project-delivery-tool",
] as const;

type TargetProjectFixture = (typeof targetProjectFixtures)[number];

async function replayFrozenRequirement(fixtureName: TargetProjectFixture) {
  const freezeFixture = JSON.parse(
    await readFile(resolve(process.cwd(), `tests/fixtures/requirement-freeze/${fixtureName}.json`), "utf8"),
  ) as {
    readonly intake_fixture: string;
    readonly project: { readonly repository_id: string; readonly formal_baseline: string };
    readonly requirement_set_id: string;
    readonly version: number;
    readonly confirmation_id: string;
    readonly known_frozen_records?: readonly unknown[];
    readonly user_resolutions: readonly unknown[];
    readonly host_replay: {
      readonly challenge_created_at: string;
      readonly expires_at: string;
      readonly display_id: string;
      readonly displayed_at: string;
      readonly user_action_id: string;
      readonly occurred_at: string;
    };
  };
  const intake = JSON.parse(
    await readFile(resolve(process.cwd(), `tests/fixtures/requirement-intake/${freezeFixture.intake_fixture}`), "utf8"),
  ) as unknown;
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: freezeFixture.requirement_set_id,
    project: freezeFixture.project,
    version: freezeFixture.version,
    candidate: intake,
    user_resolutions: freezeFixture.user_resolutions,
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: freezeFixture.confirmation_id,
    created_at: freezeFixture.host_replay.challenge_created_at,
    expires_at: freezeFixture.host_replay.expires_at,
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: freezeFixture.host_replay.display_id,
    displayed_at: freezeFixture.host_replay.displayed_at,
  });
  const userAction = createUnverifiedUserConfirmationAction(display, {
    user_action_id: freezeFixture.host_replay.user_action_id,
    action: "confirm",
    occurred_at: freezeFixture.host_replay.occurred_at,
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
  const session = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: freezeFixture.host_replay.occurred_at,
  });
  const frozen = freezeRequirementSet({
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(verified),
    ...(freezeFixture.known_frozen_records === undefined
      ? {}
      : { known_frozen_records: freezeFixture.known_frozen_records }),
  }, undefined, {
    verifier,
    verified_interaction: verified,
    interaction_session: session,
    now: () => new Date(new Date(freezeFixture.host_replay.occurred_at).valueOf() + 1),
  });
  const canonical = canonicalizeJson(frozen);
  return { frozen, canonical, restored: recoverFrozenRequirement(JSON.parse(canonical)) };
}

async function loadCompleteFixture(fixtureName: TargetProjectFixture) {
  const fixture = JSON.parse(
    await readFile(resolve(process.cwd(), `tests/fixtures/product-definition/${fixtureName}.json`), "utf8"),
  ) as {
    readonly fixture_type: string;
    readonly evidence_scope: string;
    readonly target_project: string;
    readonly frozen_requirement: unknown;
    readonly product_definition: Record<string, unknown>;
  };
  return fixture;
}

function resolvePointer(root: unknown, pointer: string): unknown {
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      current = current[Number(token)];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function fieldAtPointer(frozen: FrozenRequirement, pointer: string): string | undefined {
  const match = /^\/requirement_set\/items\/(\d+)/.exec(pointer);
  const index = match?.[1];
  if (index === undefined) return undefined;
  return frozen.requirement_set.items[Number(index)]?.field;
}

function visitSourceRefs(value: unknown, visit: (ref: { readonly pointer: string; readonly value_digest: string }) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) visitSourceRefs(entry, visit);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.pointer === "string" && typeof record.value_digest === "string") {
    visit({ pointer: record.pointer, value_digest: record.value_digest });
  }
  for (const entry of Object.values(record)) visitSourceRefs(entry, visit);
}

function visitDirectFacts(value: unknown, visit: (fact: { readonly value: string; readonly pointer: string }) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) visitDirectFacts(entry, visit);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.kind === "direct" && typeof record.value === "string" && record.source !== null && typeof record.source === "object" && typeof (record.source as Record<string, unknown>).pointer === "string") {
    visit({ value: record.value, pointer: (record.source as Record<string, unknown>).pointer as string });
  }
  for (const entry of Object.values(record)) visitDirectFacts(entry, visit);
}

test("NextStep Skill replays S1.3 stage entry and fail-closed product-definition boundaries", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  const replay = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/l3-regressions.json"), "utf8")) as {
    readonly skill_stage_replay: {
      readonly allowed_stage: string;
      readonly required_command: string;
      readonly required_boundary: string;
    };
  };
  const frontmatterEnd = skill.indexOf("---", 4);
  const inspectEnd = skill.indexOf("## Build An Evidence-Backed Candidate");
  const frontmatter = skill.slice(0, frontmatterEnd + 3);
  const inspectStage = skill.slice(0, inspectEnd);

  assert.ok(frontmatter.includes(replay.skill_stage_replay.allowed_stage));
  assert.ok(inspectStage.includes(replay.skill_stage_replay.allowed_stage));
  assert.ok(skill.includes(replay.skill_stage_replay.required_command));
  assert.ok(skill.includes(replay.skill_stage_replay.required_boundary));

  for (const expected of [
    /S1\.3/,
    /Frozen Requirement/i,
    /PRD/,
    /用户旅程/,
    /能力映射/,
    /JSON Pointer/i,
    /source binding|来源绑定/i,
    /deterministically derived|确定性派生/i,
    /kind: direct|kind.*derived/i,
    /completion-transition/i,
    /transition_digest/i,
    /not-started.*in-progress.*completed/i,
    /actor.*semantic_source.*action.*state_change.*outcome/i,
    /session capability|session.*能力/i,
    /pending.*confirmed.*rejected.*cancelled.*expired.*superseded/i,
    /replacement display.*reducer|新.*display.*reducer/i,
    /semantic.source.*partition|按.*semantic.source.*分区/i,
    /activity.*result|活动.*结果/i,
    /independent user action|独立用户动作/i,
    /manual-isolated consumer contract/i,
    /stdin.*fail closed|fail closed.*stdin/i,
    /bare boolean|裸布尔值|普通文本/i,
  ]) assert.match(skill, expected);
});

test("NextStep Skill declares Product Definition 2.0-only generation, readiness precondition, and legacy 1.0 rejection", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");

  assert.match(skill, /Product Definition 2\.0/);
  assert.match(skill, /generate.*validate.*only.*2\.0|only.*generate.*validate.*2\.0/is);
  assert.match(skill, /schema_version.*2\.0/s);
  assert.match(skill, /readiness.*non_goal_gaps|non_goal_gaps.*readiness/is);
  assert.match(skill, /clarification_gaps.*none.*proceed|only explicit `none`.*clarification_gaps|clarification_gaps.*only explicit/is);
  assert.match(skill, /non_goals.*status object|status object.*non_goals/is);
  assert.match(skill, /item_digest|item digest/i);
  assert.match(skill, /constraints.*never.*non-goal|non-goal.*never.*constraint|cannot.*act as.*non-goal|不得.*constraint.*non-goal/is);
  assert.match(skill, /legacy.*1\.0.*reject|1\.0.*product candidate.*reject/is);
  assert.match(skill, /PRODUCT_DEFINITION_REJECTED/);
  assert.match(skill, /no automatic migration|no.*1\.0.*2\.0.*converter|不.*自动迁移/i);
});

test("三类目标项目 fixture 均为 Product Definition 2.0 且独立绑定 F12 S1.2 回放产物", async () => {
  const identities = new Set<string>();
  for (const fixtureName of targetProjectFixtures) {
    const fixture = await loadCompleteFixture(fixtureName);
    assert.equal(fixture.fixture_type, "complete-product-definition");
    assert.equal(fixture.evidence_scope, "manual-isolated consumer contract");
    assert.equal(fixture.target_project, fixtureName);

    const candidate = fixture.product_definition;
    assert.equal(candidate.schema_version, "2.0");
    assert.equal(candidate.record_type, "product-definition-candidate");

    // S1.2 readiness 前置：字段级状态必须满足进入 S1.3 的门禁。
    const replay = await replayFrozenRequirement(fixtureName);
    const nonGoalItem = replay.frozen.requirement_set.items.find((item) => item.field === "non_goal_gaps");
    const clarificationItem = replay.frozen.requirement_set.items.find((item) => item.field === "clarification_gaps");
    assert.ok(nonGoalItem !== undefined && (nonGoalItem.status === "identified" || nonGoalItem.status === "none"));
    if (nonGoalItem !== undefined && nonGoalItem.status === "identified") {
      assert.ok(nonGoalItem.values.length > 0);
    }
    assert.ok(clarificationItem !== undefined && clarificationItem.status === "none" && clarificationItem.values.length === 0);

    // Frozen Requirement 与独立 S1.2 回放产物逐字节连续（ID、canonical JSON、digest）。
    assert.equal(canonicalizeJson(fixture.frozen_requirement), replay.canonical);
    assert.equal(digestJson(fixture.frozen_requirement), digestJson(replay.frozen));
    assert.equal(canonicalizeJson(candidate.frozen_requirement), replay.canonical);
    assert.equal(candidate.frozen_requirement_digest, digestJson(replay.frozen));
    assert.equal(recoverFrozenRequirement(fixture.frozen_requirement).frozen_requirement_id, replay.frozen.frozen_requirement_id);
    assert.equal(candidate.product_definition_id, deriveProductDefinitionId(replay.frozen));
    identities.add(`${replay.frozen.project.repository_id}|${replay.frozen.frozen_requirement_id}|${candidate.product_definition_id}`);

    // non_goals 是 2.0 状态对象：identified/none、items、字段级来源。
    const prd = candidate.prd as Record<string, unknown>;
    const nonGoals = prd.non_goals as Record<string, unknown>;
    assert.deepEqual(Object.keys(nonGoals).sort(), ["items", "source", "status"]);
    assert.ok(nonGoals.status === "identified" || nonGoals.status === "none");
    const nonGoalItems = nonGoals.items;
    assert.ok(Array.isArray(nonGoalItems));
    if (nonGoals.status === "none") {
      assert.equal(nonGoalItems.length, 0);
    } else {
      assert.ok(nonGoalItems.length > 0);
    }
    const nonGoalSource = nonGoals.source as Record<string, unknown>;
    assert.ok(typeof nonGoalSource.pointer === "string" && /^\/requirement_set\/items\/\d+$/.test(nonGoalSource.pointer));
    const nonGoalSourceItem = resolvePointer(replay.frozen, nonGoalSource.pointer);
    assert.ok(nonGoalSourceItem !== null && typeof nonGoalSourceItem === "object");
    assert.equal((nonGoalSourceItem as Record<string, unknown>).field, "non_goal_gaps");
    assert.equal(nonGoalSource.item_digest, digestJson(nonGoalSourceItem));

    // 所有 value 来源摘要可由 Frozen Requirement 机械复算；direct 事实等于来源值。
    visitSourceRefs(candidate, (ref) => {
      assert.equal(fieldAtPointer(replay.frozen, ref.pointer) === "clarification_gaps", false);
      const resolved = resolvePointer(replay.frozen, ref.pointer);
      assert.notEqual(resolved, undefined);
      assert.equal(digestJson(resolved), ref.value_digest);
    });
    visitDirectFacts(candidate, (fact) => {
      assert.equal(resolvePointer(replay.frozen, fact.pointer), fact.value);
    });

    // metric evidence 的 transition_digest 由产品定义 ID 与完成步机械派生。
    const journey = candidate.user_journey as Record<string, unknown>;
    const steps = journey.steps as readonly Record<string, unknown>[];
    const metrics = prd.success_metrics as readonly Record<string, unknown>[];
    assert.ok(steps.length > 0 && metrics.length > 0);
    for (const metric of metrics) {
      const evidence = metric.evidence as Record<string, unknown>;
      const sequence = evidence.journey_sequence as number;
      const step = steps.find((entry) => entry.sequence === sequence);
      assert.ok(step !== undefined);
      assert.equal(
        evidence.transition_digest,
        digestProductJourneyTransition(candidate.product_definition_id as string, step as unknown as ProductJourneyStep),
      );
    }
  }
  assert.equal(identities.size, 3);
});

test("expense-reminder 的工作日早上提醒只来自 constraints，clarification_gaps 不被 S1.3 消费", async () => {
  const replay = await replayFrozenRequirement("expense-reminder");
  for (const item of replay.frozen.requirement_set.items) {
    if (item.field === "constraints") {
      assert.ok(item.status === "identified" && item.values.includes("工作日早上提醒"));
    } else {
      assert.equal(item.values.includes("工作日早上提醒"), false);
    }
  }

  const fixture = await loadCompleteFixture("expense-reminder");
  visitDirectFacts(fixture.product_definition, (fact) => {
    if (fact.value === "工作日早上提醒") {
      assert.equal(fieldAtPointer(replay.frozen, fact.pointer), "constraints");
    }
  });
});

test("project-delivery-tool 只迁移 2.0 线格式，不改变已通过的产品语义", async () => {
  const fixture = await loadCompleteFixture("project-delivery-tool");
  const replay = await replayFrozenRequirement("project-delivery-tool");
  assert.equal(replay.frozen.requirement_set_version, 1);
  assert.equal(replay.frozen.confirmation.confirmation_id, "confirm-project-delivery-tool");

  const prd = fixture.product_definition.prd as Record<string, unknown>;
  const factValues = (facts: unknown) => (facts as readonly Record<string, unknown>[]).map((fact) => fact.value);
  assert.equal((prd.product_name as Record<string, unknown>).value, "建立一个 AI 项目推进工具");
  assert.deepEqual(factValues(prd.goals), ["做一个 AI 项目推进工具"]);
  assert.deepEqual(factValues(prd.target_users), ["企业团队规划项目时"]);
  assert.deepEqual(factValues(prd.scope), ["可确认的项目计划"]);
  const nonGoals = prd.non_goals as Record<string, unknown>;
  assert.equal(nonGoals.status, "none");
  assert.deepEqual(nonGoals.items, []);
  const journey = fixture.product_definition.user_journey as Record<string, unknown>;
  assert.equal((journey.steps as readonly unknown[]).length, 2);
  const capabilityMap = fixture.product_definition.capability_map as Record<string, unknown>;
  assert.ok((capabilityMap.capabilities as readonly unknown[]).length > 0);
});

test("legacy 1.0 产品候选保留为拒绝负例，不作为 2.0 候选消费", async () => {
  const legacy = JSON.parse(
    await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/legacy-1.0-candidate.json"), "utf8"),
  ) as {
    readonly fixture_type: string;
    readonly expected: string;
    readonly expected_code: string;
    readonly product_definition: Record<string, unknown>;
  };
  assert.equal(legacy.fixture_type, "legacy-1.0-candidate");
  assert.equal(legacy.expected, "reject");
  assert.equal(legacy.expected_code, "PRODUCT_DEFINITION_REJECTED");
  const record = legacy.product_definition;
  assert.equal(record.schema_version, "1.0");
  assert.equal(record.record_type, "product-definition-candidate");
  // 1.0 线格式的 non_goals 是事实数组；2.0 是状态对象，二者不可互换。
  assert.ok(Array.isArray((record.prd as Record<string, unknown>).non_goals));

  for (const fixtureName of targetProjectFixtures) {
    const fixture = await loadCompleteFixture(fixtureName);
    assert.notEqual(fixture.product_definition.schema_version, "1.0");
    assert.ok(!Array.isArray((fixture.product_definition.prd as Record<string, unknown>).non_goals));
  }
});

test("constraint 冒充 non-goal 的 2.0 候选作为负例 fail closed", async () => {
  const negative = JSON.parse(
    await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/constraint-as-non-goal.json"), "utf8"),
  ) as {
    readonly fixture_type: string;
    readonly expected: string;
    readonly product_definition: Record<string, unknown>;
  };
  assert.equal(negative.fixture_type, "constraint-as-non-goal");
  assert.equal(negative.expected, "reject");
  const candidate = negative.product_definition;
  assert.equal(candidate.schema_version, "2.0");

  // 负例必须基于真实的 F12 回放 Frozen Requirement，拒绝原因是角色而非摘要。
  const replay = await replayFrozenRequirement("expense-reminder");
  assert.equal(canonicalizeJson(candidate.frozen_requirement), replay.canonical);

  const nonGoals = (candidate.prd as Record<string, unknown>).non_goals as Record<string, unknown>;
  const source = nonGoals.source as Record<string, unknown>;
  assert.equal(fieldAtPointer(replay.frozen, source.pointer as string), "constraints");
  const items = nonGoals.items as readonly Record<string, unknown>[];
  assert.ok(items.length > 0);
  for (const item of items) {
    const itemSource = item.source as Record<string, unknown>;
    assert.equal(fieldAtPointer(replay.frozen, itemSource.pointer as string), "constraints");
    assert.equal(digestJson(resolvePointer(replay.frozen, itemSource.pointer as string)), itemSource.value_digest);
  }
});
