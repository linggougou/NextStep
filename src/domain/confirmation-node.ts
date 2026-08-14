import { Ajv, type ValidateFunction } from "ajv";

import confirmationNodeSchema from "../../schemas/v1/confirmation-node.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export const WRITE_CONFIRMATION_ACTION = "write-candidate-changes" as const;

export type ConfirmationNodeErrorCode =
  | "INVALID_CONFIRMATION_NODE"
  | "CONFIRMATION_NODE_MISMATCH"
  | "CONFIRMATION_NODE_EXPIRED"
  | "CONFIRMATION_NODE_SELF_APPROVAL"
  | "CONFIRMATION_NODE_VIEW_CHANGED"
  | "CONFIRMATION_NODE_UNCONFIRMED"
  | "SENSITIVE_CONTENT_DETECTED";

export class ConfirmationNodeError extends Error {
  readonly code: ConfirmationNodeErrorCode;

  constructor(code: ConfirmationNodeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface WriteConfirmationProject {
  readonly repository_id: Sha256Digest;
}

export interface WriteConfirmationViewTarget {
  readonly path: string;
  readonly mode: "create" | "update";
  readonly before_digest: Sha256Digest | null;
  readonly after_digest: Sha256Digest;
}

type WriteConfirmationBinding = {
  readonly action: typeof WRITE_CONFIRMATION_ACTION;
  readonly project: WriteConfirmationProject;
  readonly project_context_digest: Sha256Digest;
  readonly formal_baseline: string;
  readonly working_baseline_digest: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_view_digest: Sha256Digest;
  readonly confirmation_id: string;
};

export interface WriteConfirmationView extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-view";
  readonly summary: string;
  readonly targets: readonly WriteConfirmationViewTarget[];
  readonly challenge_created_at: string;
  readonly expires_at: string;
}

export interface WriteConfirmationChallenge extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-challenge";
  readonly confirmation_view: WriteConfirmationView;
  readonly proposer_id: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface WriteConfirmationViewDisplay extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-view-display";
  readonly confirmation_view: WriteConfirmationView;
  readonly challenge: WriteConfirmationChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display_id: string;
  readonly displayed_at: string;
}

export interface WriteConfirmationUserAction extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-action";
  readonly challenge_digest: Sha256Digest;
  readonly challenge_created_at: string;
  readonly expires_at: string;
  readonly display_id: string;
  readonly display_digest: Sha256Digest;
  readonly displayed_at: string;
  readonly user_action_id: string;
  readonly event_source: "independent-user-action";
  readonly actor_id: string;
  readonly user_action: "confirm" | "reject" | "cancel";
  readonly occurred_at: string;
}

export interface WriteConfirmationEnvelope extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-envelope";
  readonly challenge: WriteConfirmationChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display: WriteConfirmationViewDisplay;
  readonly display_digest: Sha256Digest;
  readonly user_action: WriteConfirmationUserAction;
  readonly user_action_digest: Sha256Digest;
  readonly confirmation_kind: "explicit-user-confirmation";
  readonly confirmed_at: string;
}

export interface WriteConfirmationResultRecord extends WriteConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "write-confirmation-result";
  readonly envelope_digest: Sha256Digest;
  readonly transaction_result_digest: Sha256Digest;
  readonly result_id: string;
  readonly status: "committed" | "blocked";
  readonly recorded_at: string;
}

export interface WriteConfirmationInteractionReplay {
  readonly display: WriteConfirmationViewDisplay;
  readonly user_action: WriteConfirmationUserAction;
}

export interface WriteConfirmationInteractionVerifier {
  readonly verifier_kind: "manual-isolated-fixture" | "trusted-host";
  verify(replay: WriteConfirmationInteractionReplay): boolean;
}

export interface VerifiedWriteConfirmationInteraction extends WriteConfirmationInteractionReplay {
  readonly verification_boundary: "write-confirmation-interaction-verifier";
}

export interface WriteConfirmationChallengeInput {
  readonly project: WriteConfirmationProject;
  readonly project_context_digest: Sha256Digest;
  readonly formal_baseline: string;
  readonly working_baseline_digest: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly targets: readonly WriteConfirmationViewTarget[];
  readonly confirmation_id: string;
  readonly proposer_id: string;
  readonly created_at: string;
  readonly expires_at: string;
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateConfirmationNode: ValidateFunction = ajv.compile(confirmationNodeSchema);

const bindingFields = [
  "action",
  "project",
  "project_context_digest",
  "formal_baseline",
  "working_baseline_digest",
  "candidate_digest",
  "confirmation_view_digest",
  "confirmation_id",
] as const;

const verifiedInteractions = new WeakMap<object, WeakSet<object>>();
const verifiedReplays = new WeakMap<object, Map<Sha256Digest, VerifiedWriteConfirmationInteraction>>();
const canonicalVerifiedReplays = new Map<Sha256Digest, VerifiedWriteConfirmationInteraction>();

const TRANSACTION_RESULT_CODES = new Set([
  "WRITE_COMMITTED",
  "WRITE_CONFLICT_REJECTED",
  "WRITE_PARTIAL_BLOCKED",
  "WRITE_ACCESS_BLOCKED",
]);

function fail(code: ConfirmationNodeErrorCode, message: string): never {
  throw new ConfirmationNodeError(code, message);
}

function scanInput(value: unknown, label: string): unknown {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", `Sensitive content detected in ${label}`);
  }
  try {
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", `Sensitive content detected in ${label}`);
  }
  return snapshot;
}

function parseTime(value: unknown, label: string): number {
  if (typeof value !== "string") {
    fail("INVALID_CONFIRMATION_NODE", `Invalid ${label}`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    fail("INVALID_CONFIRMATION_NODE", `Invalid ${label}`);
  }
  return timestamp;
}

function assertStrictlyBetween(value: unknown, lower: unknown, upper: unknown, label: string): void {
  const timestamp = parseTime(value, label);
  if (timestamp <= parseTime(lower, `${label} lower bound`) || timestamp >= parseTime(upper, `${label} upper bound`)) {
    fail("CONFIRMATION_NODE_MISMATCH", `Invalid ${label} order`);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function assertBindingMatches(value: object, expected: object, label: string): void {
  const actual = value as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  for (const field of bindingFields) {
    if (!sameJson(actual[field], expectedRecord[field])) {
      fail("CONFIRMATION_NODE_MISMATCH", `${label} does not match confirmation binding`);
    }
  }
}

function bindingFromChallenge(challenge: WriteConfirmationChallenge): WriteConfirmationBinding {
  return {
    action: challenge.action,
    project: challenge.project,
    project_context_digest: challenge.project_context_digest,
    formal_baseline: challenge.formal_baseline,
    working_baseline_digest: challenge.working_baseline_digest,
    candidate_digest: challenge.candidate_digest,
    confirmation_view_digest: challenge.confirmation_view_digest,
    confirmation_id: challenge.confirmation_id,
  };
}

function deriveSummary(targets: readonly WriteConfirmationViewTarget[]): string {
  return targets
    .map((target) => `${target.mode} ${target.path} ${target.before_digest ?? "-"} -> ${target.after_digest}`)
    .join("\n");
}

export function createWriteConfirmationChallenge(input: WriteConfirmationChallengeInput): WriteConfirmationChallenge {
  scanInput(input, "write confirmation challenge input");
  if (parseTime(input.expires_at, "confirmation expiry") <= parseTime(input.created_at, "confirmation challenge time")) {
    fail("INVALID_CONFIRMATION_NODE", "Confirmation expiry must be after challenge creation");
  }
  const view = {
    schema_version: "1.0",
    record_type: "write-confirmation-view",
    action: WRITE_CONFIRMATION_ACTION,
    project: input.project,
    project_context_digest: input.project_context_digest,
    formal_baseline: input.formal_baseline,
    working_baseline_digest: input.working_baseline_digest,
    candidate_digest: input.candidate_digest,
    summary: deriveSummary(input.targets),
    targets: input.targets,
    confirmation_id: input.confirmation_id,
    challenge_created_at: input.created_at,
    expires_at: input.expires_at,
  };
  return parseWriteConfirmationChallenge({
    schema_version: "1.0",
    record_type: "write-confirmation-challenge",
    action: WRITE_CONFIRMATION_ACTION,
    project: input.project,
    project_context_digest: input.project_context_digest,
    formal_baseline: input.formal_baseline,
    working_baseline_digest: input.working_baseline_digest,
    candidate_digest: input.candidate_digest,
    confirmation_view: view,
    confirmation_view_digest: digestJson(view),
    confirmation_id: input.confirmation_id,
    proposer_id: input.proposer_id,
    created_at: input.created_at,
    expires_at: input.expires_at,
  });
}

export function parseWriteConfirmationChallenge(value: unknown): WriteConfirmationChallenge {
  const snapshot = scanInput(value, "write confirmation challenge");
  if (!validateConfirmationNode(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-confirmation-challenge") {
    fail("INVALID_CONFIRMATION_NODE", "Invalid write confirmation challenge");
  }
  if (parseTime(snapshot.expires_at, "confirmation expiry") <= parseTime(snapshot.created_at, "confirmation challenge time")) {
    fail("INVALID_CONFIRMATION_NODE", "Confirmation expiry must be after challenge creation");
  }
  try {
    assertDigestMatches(snapshot.confirmation_view, String(snapshot.confirmation_view_digest));
  } catch {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation view identity does not match");
  }
  const view = snapshot.confirmation_view as Record<string, unknown>;
  assertBindingMatches(
    snapshot,
    { ...view, confirmation_view_digest: snapshot.confirmation_view_digest },
    "Write confirmation view",
  );
  if (view.challenge_created_at !== snapshot.created_at || view.expires_at !== snapshot.expires_at) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation view does not match challenge timing");
  }
  return snapshot as unknown as WriteConfirmationChallenge;
}

// This only assembles unverified replay data. It is not evidence of a displayed view.
export function createUnverifiedWriteConfirmationViewDisplay(
  value: WriteConfirmationChallenge,
  input: { readonly display_id: string; readonly displayed_at: string },
): WriteConfirmationViewDisplay {
  const challenge = parseWriteConfirmationChallenge(value);
  scanInput(input, "write confirmation display input");
  assertStrictlyBetween(input.displayed_at, challenge.created_at, challenge.expires_at, "write confirmation display time");
  return parseWriteConfirmationViewDisplay({
    schema_version: "1.0",
    record_type: "write-confirmation-view-display",
    ...bindingFromChallenge(challenge),
    confirmation_view: challenge.confirmation_view,
    challenge,
    challenge_digest: digestJson(challenge),
    display_id: input.display_id,
    displayed_at: input.displayed_at,
  });
}

export function parseWriteConfirmationViewDisplay(value: unknown): WriteConfirmationViewDisplay {
  const snapshot = scanInput(value, "write confirmation view display");
  if (!validateConfirmationNode(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-confirmation-view-display") {
    fail("INVALID_CONFIRMATION_NODE", "Invalid write confirmation view display");
  }
  const challenge = parseWriteConfirmationChallenge(snapshot.challenge);
  try {
    assertDigestMatches(challenge, String(snapshot.challenge_digest));
  } catch {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation display challenge identity does not match");
  }
  assertBindingMatches(snapshot, challenge, "Write confirmation display");
  if (!sameJson(snapshot.confirmation_view, challenge.confirmation_view)) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation display does not contain the complete challenge view");
  }
  assertStrictlyBetween(snapshot.displayed_at, challenge.created_at, challenge.expires_at, "write confirmation display time");
  return snapshot as unknown as WriteConfirmationViewDisplay;
}

function assertActorIndependent(display: WriteConfirmationViewDisplay, actorId: unknown, userActionId: unknown): void {
  if (typeof actorId !== "string" || actorId.length === 0) {
    fail("INVALID_CONFIRMATION_NODE", "Confirmation actor identity is required");
  }
  if (actorId === display.challenge.proposer_id) {
    fail("CONFIRMATION_NODE_SELF_APPROVAL", "Confirmation proposer cannot approve its own challenge");
  }
  if (typeof userActionId !== "string" || userActionId.length === 0) {
    fail("INVALID_CONFIRMATION_NODE", "User action identity is required");
  }
  if (userActionId === display.display_id) {
    fail("CONFIRMATION_NODE_SELF_APPROVAL", "User action must be independent from the display event");
  }
}

// This only assembles unverified replay data. It is not evidence of a user action.
export function createUnverifiedWriteConfirmationAction(
  value: WriteConfirmationViewDisplay,
  input: {
    readonly user_action_id: string;
    readonly actor_id: string;
    readonly action: "confirm" | "reject" | "cancel";
    readonly occurred_at: string;
  },
): WriteConfirmationUserAction {
  const display = parseWriteConfirmationViewDisplay(value);
  scanInput(input, "write confirmation action input");
  assertActorIndependent(display, input.actor_id, input.user_action_id);
  assertStrictlyBetween(input.occurred_at, display.displayed_at, display.challenge.expires_at, "write confirmation action time");
  return parseWriteConfirmationAction({
    schema_version: "1.0",
    record_type: "write-confirmation-action",
    ...bindingFromChallenge(display.challenge),
    challenge_digest: display.challenge_digest,
    challenge_created_at: display.challenge.created_at,
    expires_at: display.challenge.expires_at,
    display_id: display.display_id,
    display_digest: digestJson(display),
    displayed_at: display.displayed_at,
    user_action_id: input.user_action_id,
    event_source: "independent-user-action",
    actor_id: input.actor_id,
    user_action: input.action,
    occurred_at: input.occurred_at,
  });
}

export function parseWriteConfirmationAction(value: unknown): WriteConfirmationUserAction {
  const snapshot = scanInput(value, "write confirmation action");
  if (!validateConfirmationNode(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-confirmation-action") {
    fail("INVALID_CONFIRMATION_NODE", "Invalid write confirmation action");
  }
  if (snapshot.user_action_id === snapshot.display_id) {
    fail("CONFIRMATION_NODE_SELF_APPROVAL", "Write confirmation action must carry an independent actor");
  }
  assertStrictlyBetween(snapshot.occurred_at, snapshot.displayed_at, snapshot.expires_at, "write confirmation action time");
  if (parseTime(snapshot.displayed_at, "write confirmation display time") <= parseTime(snapshot.challenge_created_at, "confirmation challenge time")) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation action does not bind a valid display order");
  }
  return snapshot as unknown as WriteConfirmationUserAction;
}

export function verifyWriteConfirmationInteraction(
  value: WriteConfirmationInteractionReplay,
  verifier?: WriteConfirmationInteractionVerifier,
): VerifiedWriteConfirmationInteraction {
  if (
    verifier === undefined ||
    (typeof verifier !== "object" && typeof verifier !== "function") ||
    (verifier.verifier_kind !== "manual-isolated-fixture" && verifier.verifier_kind !== "trusted-host") ||
    typeof verifier.verify !== "function"
  ) {
    fail("CONFIRMATION_NODE_MISMATCH", "A write confirmation interaction verifier is required");
  }
  const display = parseWriteConfirmationViewDisplay(value.display);
  const action = parseWriteConfirmationAction(value.user_action);
  assertActionMatchesDisplay(action, display);
  assertActorIndependent(display, action.actor_id, action.user_action_id);
  const replayDigest = digestJson({ display, user_action: action });
  const knownReplay = verifiedReplays.get(verifier)?.get(replayDigest);
  if (knownReplay !== undefined) {
    return knownReplay;
  }
  let accepted = false;
  try {
    accepted = verifier.verify({ display, user_action: action }) === true;
  } catch {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation interaction verifier rejected the replay");
  }
  if (!accepted) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation interaction verifier rejected the replay");
  }
  const verified = canonicalVerifiedReplays.get(replayDigest) ?? Object.freeze({
    verification_boundary: "write-confirmation-interaction-verifier" as const,
    display,
    user_action: action,
  });
  canonicalVerifiedReplays.set(replayDigest, verified);
  const authorizedVerifiers = verifiedInteractions.get(verified) ?? new WeakSet<object>();
  authorizedVerifiers.add(verifier);
  verifiedInteractions.set(verified, authorizedVerifiers);
  const verifierReplays = verifiedReplays.get(verifier) ?? new Map<Sha256Digest, VerifiedWriteConfirmationInteraction>();
  verifierReplays.set(replayDigest, verified);
  verifiedReplays.set(verifier, verifierReplays);
  return verified;
}

export function createWriteConfirmationEnvelope(
  value: VerifiedWriteConfirmationInteraction,
): WriteConfirmationEnvelope {
  if (verifiedInteractions.get(value) === undefined) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation envelope requires a verified interaction result");
  }
  const display = value.display;
  const action = value.user_action;
  assertActionMatchesDisplay(action, display);
  if (action.user_action !== "confirm") {
    fail("CONFIRMATION_NODE_UNCONFIRMED", "Only a fresh explicit confirm action can form a write confirmation envelope");
  }
  return parseWriteConfirmationEnvelope({
    schema_version: "1.0",
    record_type: "write-confirmation-envelope",
    ...bindingFromChallenge(display.challenge),
    challenge: display.challenge,
    challenge_digest: display.challenge_digest,
    display,
    display_digest: digestJson(display),
    user_action: action,
    user_action_digest: digestJson(action),
    confirmation_kind: "explicit-user-confirmation",
    confirmed_at: action.occurred_at,
  });
}

export function parseWriteConfirmationEnvelope(value: unknown): WriteConfirmationEnvelope {
  const snapshot = scanInput(value, "write confirmation envelope");
  if (!validateConfirmationNode(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-confirmation-envelope") {
    fail("INVALID_CONFIRMATION_NODE", "Invalid write confirmation envelope");
  }
  const challenge = parseWriteConfirmationChallenge(snapshot.challenge);
  const display = parseWriteConfirmationViewDisplay(snapshot.display);
  const action = parseWriteConfirmationAction(snapshot.user_action);
  try {
    assertDigestMatches(challenge, String(snapshot.challenge_digest));
    assertDigestMatches(display, String(snapshot.display_digest));
    assertDigestMatches(action, String(snapshot.user_action_digest));
  } catch {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation replay identity does not match");
  }
  assertBindingMatches(snapshot, challenge, "Write confirmation envelope");
  if (!sameJson(display.challenge, challenge) || display.challenge_digest !== snapshot.challenge_digest) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation envelope display does not match challenge");
  }
  assertActionMatchesDisplay(action, display);
  if (action.user_action !== "confirm" || snapshot.confirmed_at !== action.occurred_at) {
    fail("CONFIRMATION_NODE_UNCONFIRMED", "Write confirmation time must derive from an independent confirm action");
  }
  return snapshot as unknown as WriteConfirmationEnvelope;
}

export function assertWriteConfirmationFresh(
  envelopeValue: WriteConfirmationEnvelope,
  context: { readonly now: () => Date },
): void {
  const envelope = parseWriteConfirmationEnvelope(envelopeValue);
  if (typeof context?.now !== "function") {
    fail("INVALID_CONFIRMATION_NODE", "A confirmation freshness clock is required");
  }
  const evaluatedAt = context.now();
  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.valueOf())) {
    fail("INVALID_CONFIRMATION_NODE", "Confirmation freshness clock is invalid");
  }
  if (evaluatedAt.valueOf() < parseTime(envelope.confirmed_at, "confirmation time")) {
    fail("CONFIRMATION_NODE_MISMATCH", "Confirmation freshness clock precedes the confirm action");
  }
  if (evaluatedAt.valueOf() >= parseTime(envelope.challenge.expires_at, "confirmation expiry")) {
    fail("CONFIRMATION_NODE_EXPIRED", "Write confirmation is expired");
  }
}

export function assertWriteConfirmationViewMatchesTargets(
  envelopeValue: WriteConfirmationEnvelope,
  targets: readonly WriteConfirmationViewTarget[],
): void {
  const envelope = parseWriteConfirmationEnvelope(envelopeValue);
  const snapshot = snapshotJsonValue(targets);
  if (!sameJson(envelope.challenge.confirmation_view.targets, snapshot)) {
    fail("CONFIRMATION_NODE_VIEW_CHANGED", "Confirmed view no longer matches the candidate change targets");
  }
}

export function createWriteConfirmationResult(input: {
  readonly envelope: WriteConfirmationEnvelope;
  readonly transaction_result: unknown;
  readonly result_id: string;
  readonly recorded_at: string;
}): WriteConfirmationResultRecord {
  const envelope = parseWriteConfirmationEnvelope(input.envelope);
  const transactionResult = scanInput(input.transaction_result, "write confirmation transaction result");
  if (
    !isPlainRecord(transactionResult) ||
    transactionResult.schema_version !== "1.0" ||
    transactionResult.record_type !== "write-transaction-result" ||
    typeof transactionResult.code !== "string" ||
    !TRANSACTION_RESULT_CODES.has(transactionResult.code)
  ) {
    fail("INVALID_CONFIRMATION_NODE", "Write confirmation result requires a committed-or-blocked transaction result");
  }
  const recordedAt = parseTime(input.recorded_at, "confirmation result time");
  if (recordedAt < parseTime(envelope.confirmed_at, "confirmation time")) {
    fail("CONFIRMATION_NODE_MISMATCH", "Confirmation result cannot be recorded before confirmation");
  }
  if (recordedAt >= parseTime(envelope.challenge.expires_at, "confirmation expiry")) {
    fail("CONFIRMATION_NODE_EXPIRED", "Confirmation result must be recorded before expiry");
  }
  return parseWriteConfirmationResult({
    schema_version: "1.0",
    record_type: "write-confirmation-result",
    ...bindingFromChallenge(envelope.challenge),
    envelope_digest: digestJson(envelope),
    transaction_result_digest: digestJson(transactionResult),
    result_id: input.result_id,
    status: transactionResult.code === "WRITE_COMMITTED" ? "committed" : "blocked",
    recorded_at: input.recorded_at,
  });
}

export function parseWriteConfirmationResult(value: unknown): WriteConfirmationResultRecord {
  const snapshot = scanInput(value, "write confirmation result");
  if (!validateConfirmationNode(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "write-confirmation-result") {
    fail("INVALID_CONFIRMATION_NODE", "Invalid write confirmation result");
  }
  return snapshot as unknown as WriteConfirmationResultRecord;
}

function assertActionMatchesDisplay(action: WriteConfirmationUserAction, display: WriteConfirmationViewDisplay): void {
  assertBindingMatches(action, display, "Write confirmation action");
  if (
    action.challenge_digest !== display.challenge_digest ||
    action.challenge_created_at !== display.challenge.created_at ||
    action.expires_at !== display.challenge.expires_at ||
    action.display_id !== display.display_id ||
    action.display_digest !== digestJson(display) ||
    action.displayed_at !== display.displayed_at
  ) {
    fail("CONFIRMATION_NODE_MISMATCH", "Write confirmation action does not bind the displayed view");
  }
  assertStrictlyBetween(action.occurred_at, display.displayed_at, display.challenge.expires_at, "write confirmation action time");
}
