import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  parseConfirmationEnvelope,
  RequirementConfirmationError,
} from "../../src/domain/requirement-confirmation.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";

function completeRequirementSet() {
  return buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: "req-confirmation",
    project: {
      repository_id: `sha256:${"4".repeat(64)}`,
      formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454",
    },
    version: 3,
    candidate: {
      schema_version: "1.0",
      candidate: {
        raw_expression: "我要创建一个本地日程提醒工具。",
        intent_summary: { status: "identified", source: "derived", value: "创建本地日程提醒工具", evidence: [{ start: 2, end: 14, quote: "创建一个本地日程提醒工具" }] },
        goals: { status: "identified", items: [{ value: "创建一个本地日程提醒工具", evidence: [{ start: 2, end: 14, quote: "创建一个本地日程提醒工具" }] }] },
        scenarios: { status: "missing", items: [], clarification_question: "谁会使用？" },
        constraints: { status: "missing", items: [], clarification_question: "有什么限制？" },
        expected_outputs: { status: "missing", items: [], clarification_question: "输出什么？" },
        non_goal_gaps: { status: "missing", items: [], clarification_question: "不做什么？" },
        clarification_gaps: { status: "missing", items: [], clarification_question: "还要澄清什么？" },
      },
    },
    user_resolutions: [
      { field: "scenarios", status: "identified", values: ["个人安排工作日程"] },
      { field: "constraints", status: "none", values: [] },
      { field: "expected_outputs", status: "identified", values: ["每日提醒"] },
      { field: "non_goal_gaps", status: "none", values: [] },
      { field: "clarification_gaps", status: "none", values: [] },
    ],
  });
}

test("explicit confirmation challenge and envelope bind the exact user-visible Requirement Set", () => {
  const requirementSet = completeRequirementSet();
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: "confirm-001",
    created_at: "2026-08-10T01:03:00.000Z",
  });
  const envelope = createConfirmationEnvelope(challenge, {
    confirmation_kind: "explicit-user-confirmation",
    confirmed_at: "2026-08-10T01:04:00.000Z",
  });
  const parsed = parseConfirmationEnvelope(envelope);

  assert.equal(parsed.action, "freeze-requirement-set");
  assert.equal(parsed.confirmation_id, "confirm-001");
  assert.equal(parsed.requirement_set_digest, requirementSet.content_digest);
  assert.equal(parsed.confirmation_view_digest, challenge.confirmation_view_digest);
  assert.ok(Object.isFrozen(parsed));
  assert.equal(Object.getPrototypeOf(parsed), null);
});

test("confirmation parsing fails closed for bare confirmation and each binding mismatch", () => {
  const requirementSet = completeRequirementSet();
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: "confirm-002",
    created_at: "2026-08-10T01:03:00.000Z",
  });
  const envelope = createConfirmationEnvelope(challenge, {
    confirmation_kind: "explicit-user-confirmation",
    confirmed_at: "2026-08-10T01:04:00.000Z",
  });

  for (const value of [
    true,
    "确认",
    { ...envelope, action: "write-product-definition" },
    { ...envelope, project: { ...envelope.project, repository_id: `sha256:${"5".repeat(64)}` } },
    { ...envelope, formal_baseline: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { ...envelope, requirement_set_digest: `sha256:${"6".repeat(64)}` },
    { ...envelope, confirmation_view_digest: `sha256:${"7".repeat(64)}` },
  ]) {
    assert.throws(
      () => parseConfirmationEnvelope(value),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }
});
