import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
  type ConfirmationExecutionContext,
} from "../../src/domain/requirement-confirmation.ts";
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
    expires_at: "2026-08-10T01:10:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: `display-${confirmationId}`,
    displayed_at: "2026-08-10T01:06:00.000Z",
  });
  const userAction = createUnverifiedUserConfirmationAction(display, {
    user_action_id: `user-action-${confirmationId}`,
    action: "confirm",
    occurred_at: "2026-08-10T01:07:00.000Z",
  });
  const verifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => true,
  };
  const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
  const interactionSession = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(
    interactionSession,
    { type: "user-action", user_action: userAction, evaluated_at: userAction.occurred_at },
  );
  const context: ConfirmationExecutionContext = {
    verifier,
    verified_interaction: verified,
    interaction_session: interactionSession,
    now: () => new Date("2026-08-10T01:08:00.000Z"),
  };
  return {
    command: {
      schema_version: "1.0",
      action: "freeze-requirement-set",
      requirement_set: requirementSet,
      confirmation: createConfirmationEnvelope(verified),
    },
    context,
  };
}

test("freeze returns one immutable identity and recovery is chat-independent", () => {
  const { command, context } = createCommand();
  const frozen = freezeRequirementSet(command, undefined, context);
  const duplicate = freezeRequirementSet(command, [frozen], context);
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
  const { command, context } = createCommand();
  const frozen = freezeRequirementSet(command, undefined, context);
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
  assert.throws(() => freezeRequirementSet(incomplete, undefined, context), (error: unknown) => error instanceof Error);
  assert.throws(
    () => resolveProductDefinitionEntry(command.requirement_set),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "REQUIREMENT_NOT_FROZEN",
  );

  const conflicting = createCommand("confirm-freeze-001", "另一份本地清单");
  assert.throws(
    () => freezeRequirementSet(conflicting.command, [frozen], conflicting.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );
});

test("freeze scans every matching confirmation history record before deciding idempotency", () => {
  const exactInput = createCommand();
  const exact = freezeRequirementSet(exactInput.command, undefined, exactInput.context);
  const conflictInput = createCommand("confirm-freeze-001", "另一份本地清单");
  const conflict = freezeRequirementSet(conflictInput.command, undefined, conflictInput.context);

  for (const history of [[exact, conflict], [conflict, exact]]) {
    assert.throws(
      () => freezeRequirementSet(exactInput.command, history, exactInput.context),
      (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
    );
  }

  const idempotent = freezeRequirementSet(exactInput.command, [exact, exact], exactInput.context);
  assert.equal(idempotent.frozen_requirement_id, exact.frozen_requirement_id);
});

test("freeze fails closed without a trusted execution context", () => {
  const { command, context } = createCommand();

  assert.throws(
    () => freezeRequirementSet(command, [], undefined),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );

  const incompleteContext = {} as ConfirmationExecutionContext;
  assert.throws(
    () => freezeRequirementSet(command, [], incompleteContext),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );

  assert.throws(
    () => freezeRequirementSet(command, [], {
      ...context,
      interaction_session: { runtime_boundary: "confirmation-interaction-session" },
    }),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );
});

test("freeze uses the trusted execution clock even after a valid confirm action", () => {
  const { command, context } = createCommand();
  const expiredContext: ConfirmationExecutionContext = {
    ...context,
    now: () => new Date(command.confirmation.challenge.expires_at),
  };

  assert.throws(
    () => freezeRequirementSet(command, [], expiredContext),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );

  const beforeActionContext: ConfirmationExecutionContext = {
    ...context,
    now: () => new Date(new Date(command.confirmation.confirmed_at).valueOf() - 1),
  };
  assert.throws(
    () => freezeRequirementSet(command, [], beforeActionContext),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );

  const exactBoundary = createCommand("confirm-clock-exact");
  assert.doesNotThrow(() => freezeRequirementSet(exactBoundary.command, [], {
    ...exactBoundary.context,
    now: () => new Date(exactBoundary.command.confirmation.confirmed_at),
  }));
});

test("freeze never accepts a saved confirmed snapshot after its session reaches a terminal state", () => {
  for (const terminalKind of ["reject", "cancel", "expire", "view-change"] as const) {
    const { command, context } = createCommand(`confirm-terminal-${terminalKind}`);
    const confirmAction = context.verified_interaction.user_action;
    const savedConfirmedSnapshot = { status: "confirmed" };
    const terminalState = terminalKind === "reject" || terminalKind === "cancel"
      ? reduceConfirmationInteractionState(context.interaction_session, {
        type: "user-action",
        user_action: { ...confirmAction, user_action: terminalKind },
        evaluated_at: "2026-08-10T01:07:02.000Z",
      })
      : terminalKind === "expire"
        ? reduceConfirmationInteractionState(context.interaction_session, {
          type: "evaluate",
          evaluated_at: command.confirmation.challenge.expires_at,
        })
        : reduceConfirmationInteractionState(context.interaction_session, {
          type: "view-change",
          display: { ...command.confirmation.display, display_id: "display-replacement" },
          evaluated_at: "2026-08-10T01:08:00.000Z",
        });

    assert.equal(savedConfirmedSnapshot.status, "confirmed");
    const expectedStatus = {
      reject: "rejected",
      cancel: "cancelled",
      expire: "expired",
      "view-change": "superseded",
    } as const;
    assert.equal(terminalState.status, expectedStatus[terminalKind]);
    const replayedVerified = verifyConfirmationInteraction({
      display: context.verified_interaction.display,
      user_action: confirmAction,
    }, context.verifier);
    assert.equal(createConfirmationInteractionSession(replayedVerified), context.interaction_session);
    assert.throws(
      () => freezeRequirementSet(command, [], context),
      (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
    );
  }
});
