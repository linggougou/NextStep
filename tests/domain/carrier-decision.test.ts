import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  CarrierDecisionError,
  parseCarrierDecision,
} from "../../src/domain/carrier-decision.ts";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/carrier-decision");
const productDefinitionDirectory = resolve(process.cwd(), "tests/fixtures/product-definition");

const TARGET_PROJECTS = ["community-workshop", "expense-reminder", "project-delivery-tool"] as const;

// 006 裁决固定下来的三份 Web/UI 候选材料，候选分支必须只以候选身份引用它们。
const WEB_UI_CANDIDATE_MATERIALS = [
  "docs/design-docs/p2-product-prototype.md",
  "docs/design-docs/p2-ui-design-source-requirements.md",
  "docs/design-docs/s3-ui-design-source.md",
] as const;

interface FixtureExpectation {
  readonly outcome: "accepted" | "rejected";
  readonly code?: string;
}

interface CarrierDecisionFixture {
  readonly fixture_type: string;
  readonly evidence_scope: string;
  readonly case_id: string;
  readonly target_project: string;
  readonly expectation: FixtureExpectation;
  readonly candidate: unknown;
}

async function readFixture(name: string): Promise<CarrierDecisionFixture> {
  const fixture = JSON.parse(await readFile(resolve(fixtureDirectory, name), "utf8")) as CarrierDecisionFixture;
  assert.equal(fixture.fixture_type, "carrier-decision-case");
  assert.equal(fixture.evidence_scope, "manual-isolated consumer contract");
  assert.equal(fixture.case_id, name.replace(/\.json$/, ""));
  return fixture;
}

function expectCarrierDecisionError(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof CarrierDecisionError, `expected CarrierDecisionError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.notEqual(error.message, "");
    return true;
  };
}

test("三类目标项目载体裁决 fixture 均通过并绑定 S1.3 产品定义身份链", async () => {
  for (const target of TARGET_PROJECTS) {
    const fixture = await readFixture(`${target}.json`);
    const decision = parseCarrierDecision(fixture.candidate);

    assert.equal(decision.schema_version, "1.0");
    assert.equal(decision.record_type, "carrier-decision");
    assert.equal(decision.status, "adjudicated");
    assert.ok(Object.isFrozen(decision));
    assert.ok(Object.isFrozen(decision.decision));

    // 主载体与真源承载只允许 006 会签值。
    assert.equal(decision.decision.primary_carrier, "skill-chat");
    assert.equal(decision.decision.truth_source_carrier, "project-documents-git");
    assert.equal(decision.decision.auxiliary_entry_policy, "no-new-mainline-entry");

    // 身份链必须与 S1.3 Product Definition fixture 完全一致，不得手抄。
    const pdFixture = JSON.parse(
      await readFile(resolve(productDefinitionDirectory, `${target}.json`), "utf8"),
    ) as {
      frozen_requirement: { project: { repository_id: string; formal_baseline: string } };
      product_definition: { product_definition_id: string };
    };
    assert.equal(decision.binding.product_definition_id, pdFixture.product_definition.product_definition_id);
    assert.equal(decision.binding.product_definition_digest, digestJson(pdFixture.product_definition));
    assert.equal(decision.project.repository_id, pdFixture.frozen_requirement.project.repository_id);
    assert.equal(decision.project.formal_baseline, pdFixture.frozen_requirement.project.formal_baseline);

    // 006 裁决来源摘要必须与结论内容自洽。
    assert.equal(decision.binding.source_adjudication.adjudication_id, "006-product-carrier-decision");
    assert.equal(decision.binding.source_adjudication.document, "docs/product-specs/006-product-carrier-decision.md");
    assert.equal(
      decision.binding.source_adjudication.conclusions_digest,
      digestJson(decision.binding.source_adjudication.conclusions),
    );
    assert.equal(decision.binding_digest, digestJson(decision.binding));

    // Web/UI 只能以候选分支身份存在，且恢复条件必须要求 Change Request 与重新裁决。
    assert.equal(decision.decision.candidate_branches.length, 1);
    const branch = decision.decision.candidate_branches[0];
    assert.ok(branch !== undefined);
    assert.equal(branch.carrier_kind, "web-ui");
    assert.equal(branch.status, "candidate-not-mainline");
    assert.deepEqual(
      branch.materials.map((material) => material.document),
      [...WEB_UI_CANDIDATE_MATERIALS],
    );
    assert.equal(branch.recovery_conditions.requires_change_request, true);
    assert.equal(branch.recovery_conditions.requires_re_adjudication, true);
    assert.notEqual(branch.recovery_conditions.trigger_summary, "");

    // MCP/API 仅作为后续集成面，不得成为主载体。
    assert.deepEqual(
      decision.decision.integration_surfaces.map((surface) => `${surface.surface}:${surface.status}`),
      ["mcp-service:future-integration-surface", "api:future-integration-surface"],
    );
  }
});

test("经 Change Request 覆盖已会签裁决允许通过，且必须同时绑定覆盖目标与 CR 身份", async () => {
  const fixture = await readFixture("supersede-with-change-request.json");
  const decision = parseCarrierDecision(fixture.candidate);
  assert.ok(Object.isFrozen(decision));
  const supersedes = decision.supersedes;
  const changeRequest = decision.change_request;
  assert.ok(supersedes !== undefined);
  assert.ok(changeRequest !== undefined);
  assert.notEqual(supersedes.carrier_decision_id, decision.carrier_decision_id);
  assert.match(changeRequest.change_request_id, /^CR-\d{3,}$/);
});

test("fixture 目录中全部通过用例可被接受，全部拒绝用例按预期错误码 fail closed", async () => {
  const entries = (await readdir(fixtureDirectory)).filter((entry) => entry.endsWith(".json")).sort();
  assert.ok(entries.length >= 19, `expected at least 19 carrier decision fixtures, got ${entries.length}`);
  let acceptedCount = 0;
  let rejectedCount = 0;
  for (const entry of entries) {
    const fixture = await readFixture(entry);
    if (fixture.expectation.outcome === "accepted") {
      acceptedCount += 1;
      parseCarrierDecision(fixture.candidate);
      continue;
    }
    rejectedCount += 1;
    assert.ok(fixture.expectation.code !== undefined, `${entry} must declare an expected rejection code`);
    assert.throws(() => parseCarrierDecision(fixture.candidate), expectCarrierDecisionError(fixture.expectation.code as string), entry);
  }
  assert.equal(acceptedCount, 4);
  assert.equal(rejectedCount, entries.length - 4);
});

test("Web 驾驶舱或其他非 Skill 载体冒充当前主线必须拒绝", async () => {
  const fixture = await readFixture("community-workshop.json");
  for (const impersonator of ["web-cockpit", "app-only", "mcp-only", "headless-only"]) {
    const candidate = structuredClone(fixture.candidate) as { decision: { primary_carrier: string } };
    candidate.decision.primary_carrier = impersonator;
    assert.throws(() => parseCarrierDecision(candidate), expectCarrierDecisionError("MAINLINE_IMPERSONATION"), impersonator);
  }
});

test("纯聊天无文档真源必须拒绝", async () => {
  const fixture = await readFixture("community-workshop.json");
  for (const truthSource of ["chat-history", "none"]) {
    const candidate = structuredClone(fixture.candidate) as { decision: { truth_source_carrier: string } };
    candidate.decision.truth_source_carrier = truthSource;
    assert.throws(() => parseCarrierDecision(candidate), expectCarrierDecisionError("TRUTH_SOURCE_REJECTED"), truthSource);
  }
});

test("候选分支声明主线、缺恢复条件或恢复条件不强制时必须拒绝", async () => {
  const fixture = await readFixture("community-workshop.json");
  const mainlineClaim = structuredClone(fixture.candidate) as {
    decision: { candidate_branches: { status: string }[] };
  };
  mainlineClaim.decision.candidate_branches[0]!.status = "mainline";
  assert.throws(() => parseCarrierDecision(mainlineClaim), expectCarrierDecisionError("MAINLINE_IMPERSONATION"));

  const noChangeRequest = structuredClone(fixture.candidate) as {
    decision: { candidate_branches: { recovery_conditions: { requires_change_request: boolean } }[] };
  };
  noChangeRequest.decision.candidate_branches[0]!.recovery_conditions.requires_change_request = false;
  assert.throws(() => parseCarrierDecision(noChangeRequest), expectCarrierDecisionError("CANDIDATE_BRANCH_INVALID"));

  const noReAdjudication = structuredClone(fixture.candidate) as {
    decision: { candidate_branches: { recovery_conditions: { requires_re_adjudication: boolean } }[] };
  };
  noReAdjudication.decision.candidate_branches[0]!.recovery_conditions.requires_re_adjudication = false;
  assert.throws(() => parseCarrierDecision(noReAdjudication), expectCarrierDecisionError("CANDIDATE_BRANCH_INVALID"));
});

test("未经 Change Request 覆盖已会签裁决必须拒绝，且不允许自我覆盖", async () => {
  const fixture = await readFixture("community-workshop.json");
  const unauthorized = structuredClone(fixture.candidate) as {
    carrier_decision_id: string;
    supersedes?: { carrier_decision_id: string; carrier_decision_digest: string };
  };
  unauthorized.supersedes = {
    carrier_decision_id: "carrier-decision-community-workshop-006-20260710",
    carrier_decision_digest: `sha256:${"9".repeat(64)}`,
  };
  assert.throws(() => parseCarrierDecision(unauthorized), expectCarrierDecisionError("UNAUTHORIZED_OVERRIDE"));

  const selfOverride = structuredClone(unauthorized) as {
    carrier_decision_id: string;
    supersedes?: { carrier_decision_id: string; carrier_decision_digest: string };
    change_request?: { change_request_id: string; change_request_digest: string };
  };
  selfOverride.supersedes = {
    carrier_decision_id: unauthorized.carrier_decision_id,
    carrier_decision_digest: `sha256:${"9".repeat(64)}`,
  };
  selfOverride.change_request = {
    change_request_id: "CR-006",
    change_request_digest: `sha256:${"8".repeat(64)}`,
  };
  assert.throws(() => parseCarrierDecision(selfOverride), expectCarrierDecisionError("UNAUTHORIZED_OVERRIDE"));
});

test("未知版本、未知字段、缺必填字段均 fail closed", async () => {
  const fixture = await readFixture("community-workshop.json");

  const unknownVersion = structuredClone(fixture.candidate) as { schema_version: string };
  unknownVersion.schema_version = "2.0";
  assert.throws(() => parseCarrierDecision(unknownVersion), expectCarrierDecisionError("INVALID_CARRIER_DECISION"));

  const unknownField = structuredClone(fixture.candidate) as Record<string, unknown>;
  unknownField.extra_field = "未声明字段";
  assert.throws(() => parseCarrierDecision(unknownField), expectCarrierDecisionError("INVALID_CARRIER_DECISION"));

  const missingBinding = structuredClone(fixture.candidate) as Record<string, unknown>;
  delete missingBinding.binding;
  assert.throws(() => parseCarrierDecision(missingBinding), expectCarrierDecisionError("INVALID_CARRIER_DECISION"));

  assert.throws(() => parseCarrierDecision(undefined), expectCarrierDecisionError("INVALID_CARRIER_DECISION"));
  assert.throws(() => parseCarrierDecision("carrier-decision"), expectCarrierDecisionError("INVALID_CARRIER_DECISION"));
});

test("绑定摘要与 006 结论摘要错配均 fail closed", async () => {
  const fixture = await readFixture("community-workshop.json");

  const bindingMismatch = structuredClone(fixture.candidate) as { binding_digest: string };
  bindingMismatch.binding_digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => parseCarrierDecision(bindingMismatch), expectCarrierDecisionError("BINDING_DIGEST_MISMATCH"));

  const conclusionsMismatch = structuredClone(fixture.candidate) as {
    binding: { source_adjudication: { conclusions_digest: string } };
  };
  conclusionsMismatch.binding.source_adjudication.conclusions_digest = `sha256:${"1".repeat(64)}`;
  assert.throws(() => parseCarrierDecision(conclusionsMismatch), expectCarrierDecisionError("SOURCE_ADJUDICATION_MISMATCH"));
});

test("敏感字段与敏感内容在载体裁决候选中一律拒绝", async () => {
  const fixture = await readFixture("community-workshop.json");

  const sensitiveField = structuredClone(fixture.candidate) as Record<string, unknown>;
  sensitiveField.api_token = "sk-w2fixturedummyvalue1234567890";
  assert.throws(() => parseCarrierDecision(sensitiveField), expectCarrierDecisionError("SENSITIVE_CONTENT_DETECTED"));

  const sensitiveContent = structuredClone(fixture.candidate) as {
    decision: { candidate_branches: { recovery_conditions: { trigger_summary: string } }[] };
  };
  sensitiveContent.decision.candidate_branches[0]!.recovery_conditions.trigger_summary =
    "恢复条件 authorization: bearer ghp_abcdefghij1234567890abcd";
  assert.throws(() => parseCarrierDecision(sensitiveContent), expectCarrierDecisionError("SENSITIVE_CONTENT_DETECTED"));
});
