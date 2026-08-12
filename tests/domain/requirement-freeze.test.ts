import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
  RequirementConfirmationError,
  type ConfirmationExecutionContext,
  type ConfirmationInteractionStateEvent,
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
  confirmSession = true,
  version = 1,
  repositoryId = `sha256:${"8".repeat(64)}`,
  requirementSetId = "req-freeze",
) {
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: requirementSetId,
    project: { repository_id: repositoryId, formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454" },
    version,
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
  if (confirmSession) {
    reduceConfirmationInteractionState(
      interactionSession,
      { type: "user-action", verified_interaction: verified, evaluated_at: userAction.occurred_at },
    );
  }
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

test("freeze requires one exact prior frozen version and rejects conflicting history", () => {
  const v1 = createCommand("confirm-version-v1", "第一版输出");
  const frozenV1 = freezeRequirementSet(v1.command, [], v1.context);
  const recoveredV1 = recoverFrozenRequirement(JSON.parse(JSON.stringify(frozenV1)));
  const v2 = createCommand("confirm-version-v2", "第二版输出", true, 2);

  assert.deepEqual(recoveredV1, frozenV1);
  assert.throws(
    () => freezeRequirementSet(v2.command, [], v2.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );
  assert.doesNotThrow(() => freezeRequirementSet(v2.command, [frozenV1], v2.context));
  assert.throws(
    () => freezeRequirementSet(v2.command, [frozenV1, frozenV1], v2.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );

  const foreignV1 = createCommand(
    "confirm-version-foreign-v1",
    "外部项目输出",
    true,
    1,
    `sha256:${"9".repeat(64)}`,
  );
  const foreignFrozenV1 = freezeRequirementSet(foreignV1.command, [], foreignV1.context);
  assert.throws(
    () => freezeRequirementSet(v2.command, [foreignFrozenV1], v2.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );

  const v3 = createCommand("confirm-version-v3", "第三版输出", true, 3);
  assert.throws(
    () => freezeRequirementSet(v3.command, [frozenV1], v3.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );

  const sameVersionDifferentContent = createCommand("confirm-version-v2-other", "冲突第二版输出", true, 2);
  const conflictingV2 = freezeRequirementSet(sameVersionDifferentContent.command, [frozenV1], sameVersionDifferentContent.context);
  assert.throws(
    () => freezeRequirementSet(v2.command, [frozenV1, conflictingV2], v2.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );

  const competingV1 = createCommand("confirm-version-v1-other", "冲突第一版输出");
  assert.throws(
    () => freezeRequirementSet(competingV1.command, [frozenV1], competingV1.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );

  const repeatedV1 = createCommand("confirm-version-v1-repeated", "第一版输出");
  assert.throws(
    () => freezeRequirementSet(repeatedV1.command, [frozenV1], repeatedV1.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );
  assert.throws(
    () => freezeRequirementSet(repeatedV1.command, [conflictingV2], repeatedV1.context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "IDENTITY_CONFLICT",
  );
});

test("historical version 1 Frozen Requirement remains independently recoverable", async () => {
  const fixture = JSON.parse(await readFile(
    resolve(process.cwd(), "tests/fixtures/product-definition/expense-reminder.json"),
    "utf8",
  )) as { readonly frozen_requirement: unknown };

  const recovered = recoverFrozenRequirement(fixture.frozen_requirement);

  assert.equal(recovered.requirement_set_version, 1);
  assert.equal(recovered.requirement_set.requirement_set_id, "req-expense-reminder");
  assert.equal(recovered.confirmation.confirmation_id, "confirm-expense-reminder");
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
      ? (() => {
        const decisionAction = createUnverifiedUserConfirmationAction(context.verified_interaction.display, {
          user_action_id: `user-action-terminal-${terminalKind}`,
          action: terminalKind,
          occurred_at: "2026-08-10T01:07:01.000Z",
        });
        const decision = verifyConfirmationInteraction({
          display: context.verified_interaction.display,
          user_action: decisionAction,
        }, context.verifier);
        return reduceConfirmationInteractionState(context.interaction_session, {
          type: "user-action",
          verified_interaction: decision,
          evaluated_at: "2026-08-10T01:07:02.000Z",
        });
      })()
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
    let replayVerifierCalls = 0;
    const replayVerifier = {
      verifier_kind: "manual-isolated-fixture" as const,
      verify: () => {
        replayVerifierCalls += 1;
        return true;
      },
    };
    const replayedVerified = verifyConfirmationInteraction({
      display: context.verified_interaction.display,
      user_action: confirmAction,
    }, replayVerifier);
    assert.equal(replayVerifierCalls, 1);
    assert.equal(replayedVerified, context.verified_interaction);
    assert.equal(createConfirmationInteractionSession(replayedVerified), context.interaction_session);
    assert.throws(
      () => freezeRequirementSet(command, [], {
        ...context,
        verifier: replayVerifier,
        verified_interaction: replayedVerified,
      }),
      (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
    );
  }
});

test("an unverified confirm action cannot advance a pending session or freeze its envelope", () => {
  const { command, context } = createCommand("confirm-unverified-injection", "本地清单", false);
  const injectedAction = createUnverifiedUserConfirmationAction(command.confirmation.display, {
    user_action_id: "unverified-confirm-action",
    action: "confirm",
    occurred_at: "2026-08-10T01:07:01.000Z",
  });

  assert.throws(
    () => reduceConfirmationInteractionState(context.interaction_session, {
      type: "user-action",
      user_action: injectedAction,
      evaluated_at: injectedAction.occurred_at,
    } as unknown as ConfirmationInteractionStateEvent),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.throws(
    () => freezeRequirementSet(command, [], context),
    (error: unknown) => error instanceof RequirementFreezeError && error.code === "CONFIRMATION_MISMATCH",
  );
});
