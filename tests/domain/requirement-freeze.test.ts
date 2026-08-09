import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmationChallenge, createConfirmationEnvelope } from "../../src/domain/requirement-confirmation.ts";
import {
  freezeRequirementSet,
  recoverFrozenRequirement,
  resolveProductDefinitionEntry,
  RequirementFreezeError,
} from "../../src/domain/requirement-freeze.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";

function createCommand(
  confirmationId = "confirm-freeze-001",
  expectedOutput = "本地清单",
) {
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: "req-freeze",
    project: { repository_id: `sha256:${"8".repeat(64)}`, formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454" },
    version: 1,
    candidate: {
      schema_version: "1.0",
      candidate: {
        raw_expression: "我想做一个离线清单工具。",
        intent_summary: { status: "identified", source: "derived", value: "创建离线清单工具", evidence: [{ start: 2, end: 11, quote: "做一个离线清单工具" }] },
        goals: { status: "identified", items: [{ value: "做一个离线清单工具", evidence: [{ start: 2, end: 11, quote: "做一个离线清单工具" }] }] },
        scenarios: { status: "missing", items: [], clarification_question: "谁使用？" },
        constraints: { status: "missing", items: [], clarification_question: "限制？" },
        expected_outputs: { status: "missing", items: [], clarification_question: "输出？" },
        non_goal_gaps: { status: "missing", items: [], clarification_question: "不做？" },
        clarification_gaps: { status: "missing", items: [], clarification_question: "澄清？" },
      },
    },
    user_resolutions: [
      { field: "scenarios", status: "identified", values: ["个人整理待办"] },
      { field: "constraints", status: "none", values: [] },
      { field: "expected_outputs", status: "identified", values: [expectedOutput] },
      { field: "non_goal_gaps", status: "none", values: [] },
      { field: "clarification_gaps", status: "none", values: [] },
    ],
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: confirmationId,
    created_at: "2026-08-10T01:05:00.000Z",
  });
  const confirmation = createConfirmationEnvelope(challenge, {
    confirmation_kind: "explicit-user-confirmation",
    confirmed_at: "2026-08-10T01:06:00.000Z",
  });
  return {
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation,
  };
}

test("freeze returns one immutable identity and recovery is chat-independent", () => {
  const command = createCommand();
  const frozen = freezeRequirementSet(command);
  const duplicate = freezeRequirementSet(command, [frozen]);
  const recovered = recoverFrozenRequirement(JSON.parse(JSON.stringify(frozen)));

  assert.equal(frozen.status, "frozen");
  assert.equal(frozen.frozen_requirement_id, duplicate.frozen_requirement_id);
  assert.deepEqual(recovered, frozen);
  assert.ok(Object.isFrozen(recovered));
  assert.equal(Object.getPrototypeOf(recovered), null);
  assert.deepEqual(resolveProductDefinitionEntry(recovered), {
    status: "frozen",
    next_step: "S1.3.product-definition",
  });
});

test("freeze blocks unresolved, unconfirmed, mismatched, tampered, and same-id conflicting inputs", () => {
  const command = createCommand();
  const frozen = freezeRequirementSet(command);
  const incomplete = {
    ...command,
    requirement_set: {
      ...command.requirement_set,
      status: "incomplete",
    },
  };

  for (const value of [
    incomplete,
    { ...command, confirmation: true },
    { ...command, confirmation: { ...command.confirmation, action: "wrong" } },
    { ...frozen, status: "candidate" },
    { ...frozen, requirement_set: { ...frozen.requirement_set, summary: "tampered" } },
    { ...frozen, project: { ...frozen.project, repository_id: `sha256:${"9".repeat(64)}` } },
    { ...frozen, confirmation: { ...frozen.confirmation, confirmation_view_digest: `sha256:${"a".repeat(64)}` } },
  ]) {
    assert.throws(() => recoverFrozenRequirement(value), RequirementFreezeError);
  }
  assert.throws(() => freezeRequirementSet(incomplete), (error: unknown) => error instanceof Error);
  assert.throws(
    () => resolveProductDefinitionEntry(command.requirement_set),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "REQUIREMENT_NOT_FROZEN",
  );

  const conflicting = createCommand("confirm-freeze-001", "另一份本地清单");
  assert.throws(
    () => freezeRequirementSet(conflicting, [frozen]),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );
});
