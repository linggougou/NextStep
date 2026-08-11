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

function confirmedReplay(requirementSet = completeRequirementSet()) {
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: "confirm-001",
    created_at: "2026-08-10T01:03:00.000Z",
    expires_at: "2026-08-10T01:10:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: "display-001",
    displayed_at: "2026-08-10T01:04:00.000Z",
  });
  const action = createUnverifiedUserConfirmationAction(display, {
    user_action_id: "user-action-001",
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
    { user_action_id: "display-001", action: "confirm", occurred_at: "2026-08-10T01:05:00.000Z" },
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
    user_action: verified.user_action,
    evaluated_at: "2026-08-10T01:05:01.000Z",
  });
  assert.equal(confirmed.status, "confirmed");

  for (const userAction of ["reject", "cancel"] as const) {
    const replay = confirmedReplay();
    const terminalSession = createConfirmationInteractionSession(replay.verified);
    const terminal = reduceConfirmationInteractionState(terminalSession, {
      type: "user-action",
      user_action: { ...replay.verified.user_action, user_action: userAction },
      evaluated_at: "2026-08-10T01:05:01.000Z",
    });
    assert.equal(terminal.status, userAction === "reject" ? "rejected" : "cancelled");
  }

  const expiryReplay = confirmedReplay();
  const expirySession = createConfirmationInteractionSession(expiryReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(expirySession, {
      type: "evaluate",
      evaluated_at: display.challenge.expires_at,
    }).status,
    "expired",
  );
  const changedReplay = confirmedReplay();
  const changedSession = createConfirmationInteractionSession(changedReplay.verified);
  assert.equal(
    reduceConfirmationInteractionState(changedSession, {
      type: "view-change",
      display: { ...changedReplay.display, display_id: "display-new" },
      evaluated_at: "2026-08-10T01:05:01.000Z",
    }).status,
    "superseded",
  );

  const futureReplay = confirmedReplay();
  const futureSession = createConfirmationInteractionSession(futureReplay.verified);
  assert.throws(
    () => reduceConfirmationInteractionState(futureSession, {
      type: "user-action",
      user_action: futureReplay.verified.user_action,
      evaluated_at: "2026-08-10T01:04:59.999Z",
    }),
    (error: unknown) => error instanceof RequirementConfirmationError,
  );
});
