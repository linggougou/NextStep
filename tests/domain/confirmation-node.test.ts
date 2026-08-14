import assert from "node:assert/strict";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  ConfirmationNodeError,
  WRITE_CONFIRMATION_ACTION,
  assertWriteConfirmationFresh,
  assertWriteConfirmationViewMatchesTargets,
  createUnverifiedWriteConfirmationAction,
  createUnverifiedWriteConfirmationViewDisplay,
  createWriteConfirmationChallenge,
  createWriteConfirmationEnvelope,
  createWriteConfirmationResult,
  parseWriteConfirmationAction,
  parseWriteConfirmationChallenge,
  parseWriteConfirmationEnvelope,
  parseWriteConfirmationResult,
  parseWriteConfirmationViewDisplay,
  verifyWriteConfirmationInteraction,
  type WriteConfirmationInteractionVerifier,
  type WriteConfirmationViewTarget,
} from "../../src/domain/confirmation-node.ts";

const REPOSITORY_ID = `sha256:${"d".repeat(64)}` as const;
const PROJECT_CONTEXT_DIGEST = `sha256:${"e".repeat(64)}` as const;
const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}` as const;
const WORKING_BASELINE_DIGEST = `sha256:${"b".repeat(64)}` as const;
const FORMAL_BASELINE = "024c1db6d941b6f771746c8d6249fb8a09b816f3";

function sampleTargets(): WriteConfirmationViewTarget[] {
  return [
    {
      path: "docs/notes.md",
      mode: "update",
      before_digest: `sha256:${"1".repeat(64)}`,
      after_digest: `sha256:${"2".repeat(64)}`,
    },
    {
      path: "src/new-file.ts",
      mode: "create",
      before_digest: null,
      after_digest: `sha256:${"3".repeat(64)}`,
    },
  ];
}

function challengeInput(overrides: Record<string, unknown> = {}) {
  return {
    project: { repository_id: REPOSITORY_ID },
    project_context_digest: PROJECT_CONTEXT_DIGEST,
    formal_baseline: FORMAL_BASELINE,
    working_baseline_digest: WORKING_BASELINE_DIGEST,
    candidate_digest: CANDIDATE_DIGEST,
    targets: sampleTargets(),
    confirmation_id: "write-confirm-001",
    proposer_id: "agent-qwen-w4",
    created_at: "2026-08-15T01:00:00.000Z",
    expires_at: "2026-08-15T01:30:00.000Z",
    ...overrides,
  };
}

function confirmedReplay(input = challengeInput()) {
  const challenge = createWriteConfirmationChallenge(input);
  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: `display-${input.confirmation_id}`,
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: `user-${input.confirmation_id}`,
    actor_id: "human-owner",
    action: "confirm",
    occurred_at: "2026-08-15T01:06:00.000Z",
  });
  const verifier: WriteConfirmationInteractionVerifier = {
    verifier_kind: "manual-isolated-fixture",
    verify: () => true,
  };
  const verified = verifyWriteConfirmationInteraction({ display, user_action: action }, verifier);
  return { challenge, display, action, verifier, verified, envelope: createWriteConfirmationEnvelope(verified) };
}

test("write confirmation challenge derives a deterministic view bound to the candidate", () => {
  const challenge = createWriteConfirmationChallenge(challengeInput());

  assert.equal(challenge.action, WRITE_CONFIRMATION_ACTION);
  assert.equal(challenge.record_type, "write-confirmation-challenge");
  assert.equal(challenge.candidate_digest, CANDIDATE_DIGEST);
  assert.equal(challenge.formal_baseline, FORMAL_BASELINE);
  assert.equal(challenge.working_baseline_digest, WORKING_BASELINE_DIGEST);
  assert.equal(challenge.project.repository_id, REPOSITORY_ID);
  assert.equal(challenge.confirmation_view_digest, digestJson(challenge.confirmation_view));
  assert.equal(challenge.confirmation_view.summary.split("\n").length, sampleTargets().length);
  assert.ok(Object.isFrozen(challenge));
  assert.equal(Object.getPrototypeOf(challenge), null);

  const parsed = parseWriteConfirmationChallenge(challenge);
  assert.deepEqual({ ...parsed }, { ...challenge });
});

test("write confirmation challenge rejects malformed timing, ids and digests", () => {
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ confirmation_id: "" })),
    ConfirmationNodeError,
  );
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ proposer_id: "" })),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createWriteConfirmationChallenge(
        challengeInput({ expires_at: "2026-08-15T01:00:00.000Z" }),
      ),
    ConfirmationNodeError,
  );
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ candidate_digest: "sha256:zzz" })),
    ConfirmationNodeError,
  );
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ formal_baseline: "not-an-oid" })),
    ConfirmationNodeError,
  );
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ targets: [] })),
    ConfirmationNodeError,
  );
});

test("write confirmation challenge fails closed on sensitive fields and content", () => {
  const withSensitiveField = challengeInput({ api_key: "leak" });
  assert.throws(() => createWriteConfirmationChallenge(withSensitiveField as never), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "SENSITIVE_CONTENT_DETECTED";
  });

  const withSensitiveContent = challengeInput({
    targets: [
      {
        path: "config.env",
        mode: "create",
        before_digest: null,
        after_digest: `sha256:${"9".repeat(64)}`,
      },
    ],
    summary_note: "authorization: Bearer abcdef1234567890",
  });
  assert.throws(() => createWriteConfirmationChallenge(withSensitiveContent as never), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "SENSITIVE_CONTENT_DETECTED";
  });
});

test("write confirmation display must stay inside the challenge window and bind the challenge", () => {
  const challenge = createWriteConfirmationChallenge(challengeInput());

  assert.throws(
    () =>
      createUnverifiedWriteConfirmationViewDisplay(challenge, {
        display_id: "display-x",
        displayed_at: "2026-08-15T00:59:00.000Z",
      }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createUnverifiedWriteConfirmationViewDisplay(challenge, {
        display_id: "",
        displayed_at: "2026-08-15T01:05:00.000Z",
      }),
    ConfirmationNodeError,
  );

  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-1",
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const parsed = parseWriteConfirmationViewDisplay(display);
  assert.equal(parsed.challenge_digest, digestJson(challenge));
  assert.equal(parsed.display_id, "display-1");

  const tampered = JSON.parse(JSON.stringify(display)) as Record<string, unknown>;
  (tampered.confirmation_view as Record<string, unknown>).summary = "篡改后的视图";
  assert.throws(() => parseWriteConfirmationViewDisplay(tampered), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH";
  });
});

test("write confirmation action rejects self-approval and display-bound actions", () => {
  const { display } = confirmedReplay();

  assert.throws(
    () =>
      createUnverifiedWriteConfirmationAction(display, {
        user_action_id: "user-1",
        actor_id: "agent-qwen-w4",
        action: "confirm",
        occurred_at: "2026-08-15T01:06:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_SELF_APPROVAL",
  );

  assert.throws(
    () =>
      createUnverifiedWriteConfirmationAction(display, {
        user_action_id: display.display_id,
        actor_id: "human-owner",
        action: "confirm",
        occurred_at: "2026-08-15T01:06:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_SELF_APPROVAL",
  );

  assert.throws(
    () =>
      createUnverifiedWriteConfirmationAction(display, {
        user_action_id: "user-1",
        actor_id: "",
        action: "confirm",
        occurred_at: "2026-08-15T01:06:00.000Z",
      }),
    ConfirmationNodeError,
  );

  assert.throws(
    () =>
      createUnverifiedWriteConfirmationAction(display, {
        user_action_id: "user-1",
        actor_id: "human-owner",
        action: "confirm",
        occurred_at: "2026-08-15T01:40:00.000Z",
      }),
    ConfirmationNodeError,
  );
});

test("write confirmation verifier is required and must accept the replay", () => {
  const challenge = createWriteConfirmationChallenge(challengeInput());
  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-v",
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: "user-v",
    actor_id: "human-owner",
    action: "confirm",
    occurred_at: "2026-08-15T01:06:00.000Z",
  });

  assert.throws(
    () => verifyWriteConfirmationInteraction({ display, user_action: action }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      verifyWriteConfirmationInteraction(
        { display, user_action: action },
        { verifier_kind: "manual-isolated-fixture", verify: () => false },
      ),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      verifyWriteConfirmationInteraction(
        { display, user_action: action },
        {
          verifier_kind: "manual-isolated-fixture",
          verify: () => {
            throw new Error("verifier failure");
          },
        },
      ),
    ConfirmationNodeError,
  );

  const first = verifyWriteConfirmationInteraction(
    { display, user_action: action },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  const second = verifyWriteConfirmationInteraction(
    { display, user_action: action },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  assert.equal(first, second);
  assert.equal(first.verification_boundary, "write-confirmation-interaction-verifier");
});

test("only an independent confirm action can form a write confirmation envelope", () => {
  const { envelope, action } = confirmedReplay();
  const parsed = parseWriteConfirmationEnvelope(envelope);
  assert.equal(parsed.confirmation_kind, "explicit-user-confirmation");
  assert.equal(parsed.confirmed_at, action.occurred_at);
  assert.equal(parsed.user_action_digest, digestJson(action));

  const replay = confirmedReplay(challengeInput({ confirmation_id: "write-confirm-reject" }));
  const rejectDisplay = replay.display;
  const rejectAction = createUnverifiedWriteConfirmationAction(rejectDisplay, {
    user_action_id: "user-reject",
    actor_id: "human-owner",
    action: "reject",
    occurred_at: "2026-08-15T01:07:00.000Z",
  });
  const verifiedReject = verifyWriteConfirmationInteraction(
    { display: rejectDisplay, user_action: rejectAction },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  assert.throws(() => createWriteConfirmationEnvelope(verifiedReject), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_UNCONFIRMED";
  });

  const cancelAction = createUnverifiedWriteConfirmationAction(rejectDisplay, {
    user_action_id: "user-cancel",
    actor_id: "human-owner",
    action: "cancel",
    occurred_at: "2026-08-15T01:08:00.000Z",
  });
  const verifiedCancel = verifyWriteConfirmationInteraction(
    { display: rejectDisplay, user_action: cancelAction },
    { verifier_kind: "manual-isolated-fixture", verify: () => true },
  );
  assert.throws(() => createWriteConfirmationEnvelope(verifiedCancel), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_UNCONFIRMED";
  });
});

test("write confirmation envelope rejects tampered replay digests", () => {
  const { envelope } = confirmedReplay();
  const tampered = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
  tampered.challenge_digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => parseWriteConfirmationEnvelope(tampered), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH";
  });

  const unverified = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
  assert.throws(() => createWriteConfirmationEnvelope(unverified as never), ConfirmationNodeError);
});

test("write confirmation freshness fails closed after expiry", () => {
  const { envelope } = confirmedReplay();

  assert.doesNotThrow(() =>
    assertWriteConfirmationFresh(envelope, { now: () => new Date("2026-08-15T01:20:00.000Z") }),
  );
  assert.throws(
    () => assertWriteConfirmationFresh(envelope, { now: () => new Date("2026-08-15T01:30:00.000Z") }),
    (error: unknown) =>
      error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_EXPIRED",
  );
  assert.throws(
    () => assertWriteConfirmationFresh(envelope, { now: () => new Date(Number.NaN) }),
    ConfirmationNodeError,
  );
});

test("view change between confirmation and execution is rejected", () => {
  const { envelope } = confirmedReplay();

  assert.doesNotThrow(() =>
    assertWriteConfirmationViewMatchesTargets(envelope, sampleTargets()),
  );

  const changedTargets = sampleTargets().map((target, index) =>
    index === 0
      ? {
          ...target,
          after_digest: `sha256:${"7".repeat(64)}` as WriteConfirmationViewTarget["after_digest"],
        }
      : target,
  );
  assert.throws(() => assertWriteConfirmationViewMatchesTargets(envelope, changedTargets), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_VIEW_CHANGED";
  });
});

test("write confirmation result binds envelope and transaction outcome within the window", () => {
  const { envelope } = confirmedReplay();
  const transactionResult = {
    schema_version: "1.0",
    record_type: "write-transaction-result",
    transaction_id: "tx-001",
    plan_digest: `sha256:${"5".repeat(64)}`,
    confirmation_envelope_digest: digestJson(envelope),
    code: "WRITE_COMMITTED",
    status: "committed",
    dry_run: false,
    state_promotion: "none",
    targets: [],
    executed_at: "2026-08-15T01:10:00.000Z",
  };

  const result = createWriteConfirmationResult({
    envelope,
    transaction_result: transactionResult,
    result_id: "result-001",
    recorded_at: "2026-08-15T01:10:05.000Z",
  });
  assert.equal(result.record_type, "write-confirmation-result");
  assert.equal(result.status, "committed");
  assert.equal(result.envelope_digest, digestJson(envelope));
  assert.equal(result.transaction_result_digest, digestJson(transactionResult));
  assert.deepEqual({ ...parseWriteConfirmationResult(result) }, { ...result });

  const blocked = createWriteConfirmationResult({
    envelope,
    transaction_result: { ...transactionResult, code: "WRITE_PARTIAL_BLOCKED", status: "blocked" },
    result_id: "result-002",
    recorded_at: "2026-08-15T01:10:05.000Z",
  });
  assert.equal(blocked.status, "blocked");

  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: { ...transactionResult, code: "WRITE_PREVIEWED", status: "previewed", dry_run: true },
        result_id: "result-003",
        recorded_at: "2026-08-15T01:10:05.000Z",
      }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: transactionResult,
        result_id: "result-004",
        recorded_at: "2026-08-15T01:31:00.000Z",
      }),
    (error: unknown) =>
      error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_EXPIRED",
  );
  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: transactionResult,
        result_id: "result-005",
        recorded_at: "2026-08-15T01:05:00.000Z",
      }),
    ConfirmationNodeError,
  );
});

test("write confirmation parse helpers reject unknown fields and non-plain values", () => {
  const challenge = createWriteConfirmationChallenge(challengeInput());
  const withUnknownField = { ...JSON.parse(JSON.stringify(challenge)), extra: 1 };
  assert.throws(() => parseWriteConfirmationChallenge(withUnknownField), ConfirmationNodeError);
  assert.throws(() => parseWriteConfirmationChallenge("not-a-record"), ConfirmationNodeError);
  assert.throws(() => parseWriteConfirmationViewDisplay([challenge]), ConfirmationNodeError);
  assert.throws(() => parseWriteConfirmationAction(null), ConfirmationNodeError);
  assert.throws(() => parseWriteConfirmationEnvelope(42), ConfirmationNodeError);
  assert.throws(() => parseWriteConfirmationResult(undefined), ConfirmationNodeError);
});

test("write confirmation parse rejects malformed timing and tampered bindings", () => {
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ created_at: 123 as unknown as string })),
    ConfirmationNodeError,
  );
  assert.throws(
    () => createWriteConfirmationChallenge(challengeInput({ created_at: "not-a-date" })),
    ConfirmationNodeError,
  );

  const challenge = createWriteConfirmationChallenge(challengeInput());
  const viewTimingTamper = JSON.parse(JSON.stringify(challenge)) as Record<string, unknown>;
  (viewTimingTamper.confirmation_view as Record<string, unknown>).challenge_created_at = "2026-08-15T00:00:00.000Z";
  viewTimingTamper.confirmation_view_digest = digestJson(viewTimingTamper.confirmation_view);
  assert.throws(() => parseWriteConfirmationChallenge(viewTimingTamper), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH";
  });

  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-t",
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const lateDisplay = JSON.parse(JSON.stringify(display)) as Record<string, unknown>;
  lateDisplay.displayed_at = "2026-08-15T01:31:00.000Z";
  assert.throws(() => parseWriteConfirmationViewDisplay(lateDisplay), ConfirmationNodeError);
  const foreignChallengeDisplay = JSON.parse(JSON.stringify(display)) as Record<string, unknown>;
  foreignChallengeDisplay.challenge_digest = `sha256:${"c".repeat(64)}`;
  assert.throws(() => parseWriteConfirmationViewDisplay(foreignChallengeDisplay), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH";
  });

  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: "user-t",
    actor_id: "human-owner",
    action: "confirm",
    occurred_at: "2026-08-15T01:06:00.000Z",
  });
  const emptyActor = JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  emptyActor.actor_id = "";
  assert.throws(() => parseWriteConfirmationAction(emptyActor), ConfirmationNodeError);
  const selfDisplayAction = JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  selfDisplayAction.user_action_id = selfDisplayAction.display_id;
  assert.throws(() => parseWriteConfirmationAction(selfDisplayAction), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_SELF_APPROVAL";
  });
  const earlyDisplayOrder = JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  earlyDisplayOrder.displayed_at = earlyDisplayOrder.challenge_created_at;
  assert.throws(() => parseWriteConfirmationAction(earlyDisplayOrder), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH";
  });
});

test("write confirmation envelope parse rejects reordered and non-confirm replays", () => {
  const { envelope, challenge } = confirmedReplay();

  const wrongConfirmedAt = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
  wrongConfirmedAt.confirmed_at = "2026-08-15T01:07:00.000Z";
  assert.throws(() => parseWriteConfirmationEnvelope(wrongConfirmedAt), (error: unknown) => {
    return error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_UNCONFIRMED";
  });

  const foreignChallengeEnvelope = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
  const otherChallenge = createWriteConfirmationChallenge(challengeInput({ confirmation_id: "other" }));
  foreignChallengeEnvelope.challenge = JSON.parse(JSON.stringify(otherChallenge));
  assert.throws(() => parseWriteConfirmationEnvelope(foreignChallengeEnvelope), ConfirmationNodeError);

  const rejectDisplay = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-r2",
    displayed_at: "2026-08-15T01:05:30.000Z",
  });
  const rejectAction = createUnverifiedWriteConfirmationAction(rejectDisplay, {
    user_action_id: "user-r2",
    actor_id: "human-owner",
    action: "reject",
    occurred_at: "2026-08-15T01:06:30.000Z",
  });
  const rejectEnvelopeCandidate = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
  rejectEnvelopeCandidate.user_action = JSON.parse(JSON.stringify(rejectAction));
  rejectEnvelopeCandidate.user_action_digest = digestJson(rejectAction);
  assert.throws(() => parseWriteConfirmationEnvelope(rejectEnvelopeCandidate), ConfirmationNodeError);
});

test("write confirmation freshness and verifier guards reject malformed contexts", () => {
  const { envelope } = confirmedReplay();

  assert.throws(
    () => assertWriteConfirmationFresh(envelope, {} as never),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      assertWriteConfirmationFresh(envelope, {
        now: () => new Date("2026-08-15T01:05:59.000Z"),
      }),
    (error: unknown) =>
      error instanceof ConfirmationNodeError && error.code === "CONFIRMATION_NODE_MISMATCH",
  );

  const challenge = createWriteConfirmationChallenge(challengeInput({ confirmation_id: "write-confirm-bogus" }));
  const display = createUnverifiedWriteConfirmationViewDisplay(challenge, {
    display_id: "display-bogus",
    displayed_at: "2026-08-15T01:05:00.000Z",
  });
  const action = createUnverifiedWriteConfirmationAction(display, {
    user_action_id: "user-bogus",
    actor_id: "human-owner",
    action: "confirm",
    occurred_at: "2026-08-15T01:06:00.000Z",
  });
  assert.throws(
    () =>
      verifyWriteConfirmationInteraction(
        { display, user_action: action },
        { verifier_kind: "bogus-kind" as never, verify: () => true },
      ),
    ConfirmationNodeError,
  );
});

test("write confirmation result rejects foreign transaction results and bad timing", () => {
  const { envelope } = confirmedReplay();

  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: { schema_version: "1.0", record_type: "write-plan", code: "WRITE_COMMITTED" },
        result_id: "result-x1",
        recorded_at: "2026-08-15T01:10:05.000Z",
      }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: {
          schema_version: "1.0",
          record_type: "write-transaction-result",
          code: "UNKNOWN_CODE",
        },
        result_id: "result-x2",
        recorded_at: "2026-08-15T01:10:05.000Z",
      }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: {
          schema_version: "1.0",
          record_type: "write-transaction-result",
          code: "WRITE_COMMITTED",
        },
        result_id: "",
        recorded_at: "2026-08-15T01:10:05.000Z",
      }),
    ConfirmationNodeError,
  );
  assert.throws(
    () =>
      createWriteConfirmationResult({
        envelope,
        transaction_result: {
          schema_version: "1.0",
          record_type: "write-transaction-result",
          code: "WRITE_COMMITTED",
        },
        result_id: "result-x3",
        recorded_at: "not-a-date",
      }),
    ConfirmationNodeError,
  );
});
