import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  getConfirmationInteractionState,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
  parseConfirmationChallenge,
  parseConfirmationEnvelope,
  RequirementConfirmationError,
  type ConfirmationInteractionStateEvent,
  type ConfirmationInteractionVerifier,
} from "../../src/domain/requirement-confirmation.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";
import { digestJson } from "../../src/domain/content-digest.ts";

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

function confirmedReplay(requirementSet = completeRequirementSet(), confirmationId = "confirm-001") {
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: confirmationId,
    created_at: "2026-08-10T01:03:00.000Z",
    expires_at: "2026-08-10T01:10:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: `display-${confirmationId}`,
    displayed_at: "2026-08-10T01:04:00.000Z",
  });
  const action = createUnverifiedUserConfirmationAction(display, {
    user_action_id: `user-action-${confirmationId}`,
    action: "confirm",
    occurred_at: "2026-08-10T01:05:00.000Z",
  });
  const verifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => true,
  };
  const verified = verifyConfirmationInteraction({ display, user_action: action }, verifier);
  return { challenge, display, action, verifier, verified, envelope: createConfirmationEnvelope(verified) };
}

test("explicit confirmation challenge and envelope bind the exact user-visible Requirement Set", () => {
  const requirementSet = completeRequirementSet();
  const { challenge, display, action, envelope } = confirmedReplay(requirementSet);
  const parsed = parseConfirmationEnvelope(envelope);

  assert.equal(parsed.action, "freeze-requirement-set");
  assert.equal(parsed.confirmation_id, "confirm-001");
  assert.equal(parsed.requirement_set_digest, requirementSet.content_digest);
  assert.equal(parsed.confirmation_view_digest, challenge.confirmation_view_digest);
  assert.equal(parsed.confirmed_at, action.occurred_at);
  assert.equal(parsed.display.display_id, display.display_id);
  assert.equal(parsed.user_action.user_action_id, action.user_action_id);
  assert.ok(Object.isFrozen(parsed));
  assert.equal(Object.getPrototypeOf(parsed), null);
});

test("confirmation replay rejects self-description, machine receipts, incomplete views, and each binding mismatch", () => {
  const { challenge, display, action, envelope } = confirmedReplay();
  const directEnvelope = {
    schema_version: "1.0",
    record_type: "confirmation-envelope",
    action: challenge.action,
    project: challenge.project,
    formal_baseline: challenge.formal_baseline,
    requirement_set_id: challenge.requirement_set_id,
    requirement_set_version: challenge.requirement_set_version,
    requirement_set_digest: challenge.requirement_set_digest,
    confirmation_view_digest: challenge.confirmation_view_digest,
    confirmation_id: challenge.confirmation_id,
    challenge,
    challenge_digest: digestJson(challenge),
    confirmation_kind: "explicit-user-confirmation",
    confirmed_at: "2026-08-10T01:05:00.000Z",
  };

  for (const value of [
    true,
    "确认",
    { schema_version: "1.0", receipt_id: "machine", ok: true, code: "REQUIREMENT_FREEZE_ACCEPTED", data: {} },
    directEnvelope,
    { ...envelope, action: "write-product-definition" },
    { ...envelope, project: { ...envelope.project, repository_id: `sha256:${"5".repeat(64)}` } },
    { ...envelope, formal_baseline: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { ...envelope, requirement_set_digest: `sha256:${"6".repeat(64)}` },
    { ...envelope, confirmation_view_digest: `sha256:${"7".repeat(64)}` },
    { ...envelope, display: { ...display, confirmation_view: { ...display.confirmation_view, summary: "incomplete" } } },
    { ...envelope, user_action: { ...action, confirmation_view_digest: `sha256:${"8".repeat(64)}` } },
  ]) {
    assert.throws(
      () => parseConfirmationEnvelope(value),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }

  assert.throws(
    () => parseConfirmationChallenge({ ...challenge, confirmation_view: { summary: "not a complete view" } }),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );

  const duplicateFieldItems = challenge.confirmation_view.items.map((item) => ({
    ...item,
    field: "goals" as const,
  }));
  const duplicateFieldView = {
    ...challenge.confirmation_view,
    items: duplicateFieldItems,
    summary: duplicateFieldItems.map((item) => `${item.field}|${item.status}|${item.values.join("\u001f")}`).join("\n"),
  };
  for (const confirmationView of [
    duplicateFieldView,
    { ...challenge.confirmation_view, summary: "summary-not-derived-from-items" },
  ]) {
    assert.throws(
      () => parseConfirmationChallenge({
        ...challenge,
        confirmation_view: confirmationView,
        confirmation_view_digest: digestJson(confirmationView),
      }),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }
});

test("only a fresh independent confirm action can form an envelope", () => {
  const { challenge, display } = confirmedReplay();
  for (const input of [
    { user_action_id: display.display_id, action: "confirm", occurred_at: "2026-08-10T01:05:00.000Z" },
    { user_action_id: "user-action-reverse", action: "confirm", occurred_at: "2026-08-10T01:03:59.000Z" },
    { user_action_id: "user-action-expired", action: "confirm", occurred_at: challenge.expires_at },
  ] as const) {
    assert.throws(
      () => createUnverifiedUserConfirmationAction(display, input),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }

  for (const action of ["reject", "cancel"] as const) {
    const userAction = createUnverifiedUserConfirmationAction(display, {
      user_action_id: `user-action-${action}`,
      action,
      occurred_at: "2026-08-10T01:05:00.000Z",
    });
    assert.throws(
      () => createConfirmationEnvelope(verifyConfirmationInteraction({ display, user_action: userAction }, {
        verifier_kind: "manual-isolated-fixture",
        verify: () => true,
      })),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }
});

test("recomputed views and challenges invalidate old user actions", () => {
  const requirementSet = completeRequirementSet();
  const { challenge, display, action } = confirmedReplay(requirementSet);
  const changedChallenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: challenge.confirmation_id,
    created_at: "2026-08-10T01:03:01.000Z",
    expires_at: challenge.expires_at,
  });
  const changedDisplay = createUnverifiedConfirmationViewDisplay(changedChallenge, {
    display_id: "display-002",
    displayed_at: "2026-08-10T01:04:01.000Z",
  });

  assert.throws(
    () => parseConfirmationChallenge({
      ...challenge,
      confirmation_view: { ...challenge.confirmation_view, challenge_created_at: changedChallenge.created_at },
    }),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.throws(
    () => createConfirmationEnvelope(verifyConfirmationInteraction({ display: changedDisplay, user_action: action }, {
      verifier_kind: "manual-isolated-fixture",
      verify: () => true,
    })),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
});

test("only an injected verifier can turn an unverified replay into a confirmed current generation", () => {
  const { display, action } = confirmedReplay();
  const verifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => true,
  };

  assert.throws(
    () => verifyConfirmationInteraction({ display, user_action: action }),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );

  const firstVerifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => true,
  };
  const firstVerified = verifyConfirmationInteraction({ display, user_action: action }, firstVerifier);
  const firstSession = createConfirmationInteractionSession(firstVerified);
  let secondVerifierCalls = 0;
  const secondVerifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => {
      secondVerifierCalls += 1;
      return true;
    },
  };
  const secondVerified = verifyConfirmationInteraction({ display, user_action: action }, secondVerifier);
  assert.equal(secondVerifierCalls, 1);
  assert.equal(secondVerified, firstVerified);
  assert.equal(createConfirmationInteractionSession(secondVerified), firstSession);

  for (const verifierResult of [false, undefined, null, {}, 1, Promise.resolve(false)]) {
    const untrustedVerifier = {
      verifier_kind: "manual-isolated-fixture" as const,
      verify: () => verifierResult as boolean,
    } as ConfirmationInteractionVerifier;
    assert.throws(
      () => verifyConfirmationInteraction({ display, user_action: action }, untrustedVerifier),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }
  const throwingVerifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => {
      throw new Error("verifier failure");
    },
  };
  assert.throws(
    () => verifyConfirmationInteraction({ display, user_action: action }, throwingVerifier),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );

  for (const verifierResult of [false, undefined, null, {}, 1, Promise.resolve(false)]) {
    const nonBooleanVerifier = {
      verifier_kind: "manual-isolated-fixture" as const,
      verify: () => verifierResult as boolean,
    } as ConfirmationInteractionVerifier;
    assert.throws(
      () => verifyConfirmationInteraction({ display, user_action: action }, nonBooleanVerifier),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }

  const verified = verifyConfirmationInteraction({ display, user_action: action }, verifier);
  const session = createConfirmationInteractionSession(verified);
  assert.equal(getConfirmationInteractionState(session).status, "pending");
  const confirmed = reduceConfirmationInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: "2026-08-10T01:05:01.000Z",
  });
  assert.equal(confirmed.status, "confirmed");

  for (const userAction of ["reject", "cancel"] as const) {
    const replay = confirmedReplay(completeRequirementSet(), `confirm-terminal-${userAction}`);
    const terminalSession = createConfirmationInteractionSession(replay.verified);
    const decisionAction = createUnverifiedUserConfirmationAction(replay.display, {
      user_action_id: `user-action-terminal-${userAction}`,
      action: userAction,
      occurred_at: "2026-08-10T01:05:01.000Z",
    });
    const decision = verifyConfirmationInteraction({ display: replay.display, user_action: decisionAction }, {
      verifier_kind: "manual-isolated-fixture",
      verify: () => true,
    });
    const terminal = reduceConfirmationInteractionState(terminalSession, {
      type: "user-action",
      verified_interaction: decision,
      evaluated_at: "2026-08-10T01:05:01.000Z",
    });
    assert.equal(terminal.status, userAction === "reject" ? "rejected" : "cancelled");
  }

  const expiryReplay = confirmedReplay(completeRequirementSet(), "confirm-terminal-expiry");
  const expirySession = createConfirmationInteractionSession(expiryReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(expirySession, {
      type: "evaluate",
      evaluated_at: expiryReplay.display.challenge.expires_at,
    }).status,
    "expired",
  );
  const changedReplay = confirmedReplay(completeRequirementSet(), "confirm-terminal-view-change");
  const changedSession = createConfirmationInteractionSession(changedReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(changedSession, {
      type: "view-change",
      display: { ...changedReplay.display, display_id: "display-new" },
      evaluated_at: "2026-08-10T01:05:01.000Z",
    }).status,
    "superseded",
  );

  const futureReplay = confirmedReplay(completeRequirementSet(), "confirm-terminal-future");
  const futureSession = createConfirmationInteractionSession(futureReplay.verified);
  assert.throws(
    () => reduceConfirmationInteractionState(futureSession, {
      type: "user-action",
      verified_interaction: futureReplay.verified,
      evaluated_at: "2026-08-10T01:04:59.999Z",
    }),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
});

test("reducer consumes only a verified interaction capability for every user decision", () => {
  const capabilityEvent = (verifiedInteraction: unknown, evaluatedAt: string) => ({
    type: "user-action",
    verified_interaction: verifiedInteraction,
    evaluated_at: evaluatedAt,
  }) as unknown as ConfirmationInteractionStateEvent;
  const verifyDecision = (
    display: ReturnType<typeof confirmedReplay>["display"],
    action: "reject" | "cancel",
    userActionId: string,
  ) => {
    const userAction = createUnverifiedUserConfirmationAction(display, {
      user_action_id: userActionId,
      action,
      occurred_at: "2026-08-10T01:05:01.000Z",
    });
    return verifyConfirmationInteraction({ display, user_action: userAction }, {
      verifier_kind: "manual-isolated-fixture",
      verify: () => true,
    });
  };

  const pending = confirmedReplay(completeRequirementSet(), "confirm-capability-pending");
  const pendingSession = createConfirmationInteractionSession(pending.verified);
  const bareReject = createUnverifiedUserConfirmationAction(pending.display, {
    user_action_id: "bare-reject",
    action: "reject",
    occurred_at: "2026-08-10T01:05:01.000Z",
  });
  assert.throws(
    () => reduceConfirmationInteractionState(pendingSession, {
      type: "user-action",
      user_action: bareReject,
      evaluated_at: bareReject.occurred_at,
    } as unknown as ConfirmationInteractionStateEvent),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.equal(getConfirmationInteractionState(pendingSession).status, "pending");

  const confirmed = confirmedReplay(completeRequirementSet(), "confirm-capability-confirmed");
  const confirmedSession = createConfirmationInteractionSession(confirmed.verified);
  reduceConfirmationInteractionState(confirmedSession, {
    type: "user-action",
    verified_interaction: confirmed.verified,
    evaluated_at: "2026-08-10T01:05:01.000Z",
  });
  const bareCancel = createUnverifiedUserConfirmationAction(confirmed.display, {
    user_action_id: "bare-cancel",
    action: "cancel",
    occurred_at: "2026-08-10T01:05:02.000Z",
  });
  assert.throws(
    () => reduceConfirmationInteractionState(confirmedSession, {
      type: "user-action",
      user_action: bareCancel,
      evaluated_at: bareCancel.occurred_at,
    } as unknown as ConfirmationInteractionStateEvent),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.equal(getConfirmationInteractionState(confirmedSession).status, "confirmed");

  const forgedCapability = Object.freeze({ ...pending.verified });
  assert.throws(
    () => reduceConfirmationInteractionState(pendingSession, capabilityEvent(forgedCapability, "2026-08-10T01:05:01.000Z")),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.throws(
    () => reduceConfirmationInteractionState(pendingSession, capabilityEvent(forgedCapability, pending.challenge.expires_at)),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  const other = confirmedReplay(completeRequirementSet(), "confirm-capability-other-display");
  const otherReject = verifyDecision(other.display, "reject", "other-display-reject");
  assert.throws(
    () => reduceConfirmationInteractionState(pendingSession, capabilityEvent(otherReject, "2026-08-10T01:05:01.000Z")),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
  assert.equal(getConfirmationInteractionState(pendingSession).status, "pending");

  for (const decision of ["reject", "cancel"] as const) {
    const replay = confirmedReplay(completeRequirementSet(), `confirm-capability-${decision}`);
    const session = createConfirmationInteractionSession(replay.verified);
    const decisionCapability = verifyDecision(replay.display, decision, `verified-${decision}`);
    const terminal = reduceConfirmationInteractionState(
      session,
      capabilityEvent(decisionCapability, "2026-08-10T01:05:01.000Z"),
    );
    assert.equal(terminal.status, decision === "reject" ? "rejected" : "cancelled");
    assert.equal(
      reduceConfirmationInteractionState(
        session,
        capabilityEvent(replay.verified, "2026-08-10T01:05:02.000Z"),
      ).status,
      terminal.status,
    );
    assert.throws(
      () => reduceConfirmationInteractionState(
        session,
        capabilityEvent(Object.freeze({ ...replay.verified }), "2026-08-10T01:05:03.000Z"),
      ),
      (error: unknown) => error instanceof RequirementConfirmationError,
    );
  }

  const expiredReplay = confirmedReplay(completeRequirementSet(), "confirm-capability-expired");
  const expiredSession = createConfirmationInteractionSession(expiredReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(expiredSession, {
      type: "evaluate",
      evaluated_at: expiredReplay.challenge.expires_at,
    }).status,
    "expired",
  );
  assert.equal(
    reduceConfirmationInteractionState(
      expiredSession,
      capabilityEvent(expiredReplay.verified, "2026-08-10T01:05:02.000Z"),
    ).status,
    "expired",
  );

  const supersededReplay = confirmedReplay(completeRequirementSet(), "confirm-capability-superseded");
  const supersededSession = createConfirmationInteractionSession(supersededReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(supersededSession, {
      type: "view-change",
      display: { ...supersededReplay.display, display_id: "display-capability-replacement" },
      evaluated_at: "2026-08-10T01:05:01.000Z",
    }).status,
    "superseded",
  );
  assert.equal(
    reduceConfirmationInteractionState(
      supersededSession,
      capabilityEvent(supersededReplay.verified, "2026-08-10T01:05:02.000Z"),
    ).status,
    "superseded",
  );
});
