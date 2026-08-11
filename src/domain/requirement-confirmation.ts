import { Ajv, type ValidateFunction } from "ajv";

import confirmationSchema from "../../schemas/v1/requirement-confirmation.schema.json" with { type: "json" };
import { canonicalizeJson } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { REQUIREMENT_FIELDS, parseRequirementSet, type RequirementSet } from "./requirement-set.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

type ConfirmationBinding = {
  readonly action: "freeze-requirement-set";
  readonly project: { readonly repository_id: Sha256Digest };
  readonly formal_baseline: string;
  readonly requirement_set_id: string;
  readonly requirement_set_version: number;
  readonly requirement_set_generation: number;
  readonly requirement_set_digest: Sha256Digest;
  readonly confirmation_view_digest: Sha256Digest;
  readonly confirmation_id: string;
};

export interface ConfirmationView {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-view";
  readonly action: "freeze-requirement-set";
  readonly project: { readonly repository_id: Sha256Digest };
  readonly formal_baseline: string;
  readonly requirement_set_id: string;
  readonly requirement_set_version: number;
  readonly requirement_set_generation: number;
  readonly requirement_set_digest: Sha256Digest;
  readonly summary: string;
  readonly items: RequirementSet["items"];
  readonly confirmation_id: string;
  readonly challenge_created_at: string;
  readonly expires_at: string;
}

export interface ConfirmationChallenge extends ConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-challenge";
  readonly confirmation_view: ConfirmationView;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface ConfirmationViewDisplay extends ConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-view-display";
  readonly confirmation_view: ConfirmationView;
  readonly challenge: ConfirmationChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display_id: string;
  readonly displayed_at: string;
}

export interface UserConfirmationAction extends ConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "user-confirmation-action";
  readonly challenge_digest: Sha256Digest;
  readonly challenge_created_at: string;
  readonly expires_at: string;
  readonly display_id: string;
  readonly display_digest: Sha256Digest;
  readonly displayed_at: string;
  readonly user_action_id: string;
  readonly event_source: "independent-user-action";
  readonly user_action: "confirm" | "reject" | "cancel";
  readonly occurred_at: string;
}

export interface ConfirmationEnvelope extends ConfirmationBinding {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-envelope";
  readonly challenge: ConfirmationChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display: ConfirmationViewDisplay;
  readonly display_digest: Sha256Digest;
  readonly user_action: UserConfirmationAction;
  readonly user_action_digest: Sha256Digest;
  readonly confirmation_kind: "explicit-user-confirmation";
  readonly confirmed_at: string;
}

export interface ConfirmationInteractionReplay {
  readonly display: ConfirmationViewDisplay;
  readonly user_action: UserConfirmationAction;
}

export interface ConfirmationInteractionVerifier {
  readonly verifier_kind: "manual-isolated-fixture" | "trusted-host";
  verify(replay: ConfirmationInteractionReplay): boolean;
}

export interface VerifiedConfirmationInteraction extends ConfirmationInteractionReplay {
  readonly verification_boundary: "confirmation-interaction-verifier";
}

export type ConfirmationInteractionStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "expired" | "superseded";

export interface ConfirmationInteractionState {
  readonly status: ConfirmationInteractionStatus;
  readonly requirement_set_generation: number;
  readonly challenge_digest: Sha256Digest;
  readonly display_digest: Sha256Digest;
  readonly expires_at: string;
  readonly evaluated_at: string;
}

export interface ConfirmationInteractionSession {
  readonly runtime_boundary: "confirmation-interaction-session";
}

export type ConfirmationInteractionStateEvent =
  | { readonly type: "user-action"; readonly user_action: UserConfirmationAction; readonly evaluated_at: string }
  | { readonly type: "evaluate"; readonly evaluated_at: string }
  | { readonly type: "view-change"; readonly display: ConfirmationViewDisplay; readonly evaluated_at: string };

export interface ConfirmationExecutionContext {
  readonly verifier: ConfirmationInteractionVerifier;
  readonly verified_interaction: VerifiedConfirmationInteraction;
  readonly interaction_session: ConfirmationInteractionSession;
  readonly now: () => Date;
}

export type RequirementConfirmationErrorCode = "INVALID_CONFIRMATION" | "CONFIRMATION_MISMATCH" | "UNRESOLVED_REQUIREMENTS" | "SENSITIVE_CONTENT_DETECTED";

export class RequirementConfirmationError extends Error {
  readonly code: RequirementConfirmationErrorCode;

  constructor(code: RequirementConfirmationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateConfirmation: ValidateFunction = ajv.compile(confirmationSchema);
const bindingFields = [
  "action",
  "project",
  "formal_baseline",
  "requirement_set_id",
  "requirement_set_version",
  "requirement_set_generation",
  "requirement_set_digest",
  "confirmation_view_digest",
  "confirmation_id",
] as const;
const verifiedInteractions = new WeakMap<object, ConfirmationInteractionVerifier>();
const verifiedReplays = new WeakMap<object, Map<Sha256Digest, VerifiedConfirmationInteraction>>();
const interactionSessionsByVerifiedReplay = new WeakMap<object, ConfirmationInteractionSession>();
const interactionSessionRecords = new WeakMap<object, {
  readonly verified_interaction: VerifiedConfirmationInteraction;
  current_state: ConfirmationInteractionState;
}>();

function fail(code: RequirementConfirmationErrorCode, message: string): never {
  throw new RequirementConfirmationError(code, message);
}

function assertSafeContent(value: unknown): void {
  try {
    assertNoSensitiveContent(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in confirmation");
  }
}

function parseTime(value: unknown, label: string): number {
  if (typeof value !== "string") {
    fail("INVALID_CONFIRMATION", `Invalid ${label}`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    fail("INVALID_CONFIRMATION", `Invalid ${label}`);
  }
  return timestamp;
}

function assertStrictlyBetween(value: unknown, lower: unknown, upper: unknown, label: string): void {
  const timestamp = parseTime(value, label);
  if (timestamp <= parseTime(lower, `${label} lower bound`) || timestamp >= parseTime(upper, `${label} expiry`)) {
    fail("CONFIRMATION_MISMATCH", `Invalid ${label} order`);
  }
}

function assertNonEmptyId(value: string, label: string): void {
  if (value.length === 0) {
    fail("INVALID_CONFIRMATION", `${label} is required`);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function assertBindingMatches(
  value: object,
  expected: object,
  label: string,
): void {
  const actual = value as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  for (const field of bindingFields) {
    if (!sameJson(actual[field], expectedRecord[field])) {
      fail("CONFIRMATION_MISMATCH", `${label} does not match confirmation binding`);
    }
  }
}

function confirmationView(
  requirementSet: RequirementSet,
  input: { readonly confirmation_id: string; readonly created_at: string; readonly expires_at: string },
): ConfirmationView {
  return {
    schema_version: "1.0",
    record_type: "confirmation-view",
    action: "freeze-requirement-set",
    project: { repository_id: requirementSet.project.repository_id },
    formal_baseline: requirementSet.project.formal_baseline,
    requirement_set_id: requirementSet.requirement_set_id,
    requirement_set_version: requirementSet.version,
    requirement_set_generation: requirementSet.version,
    requirement_set_digest: requirementSet.content_digest,
    summary: requirementSet.summary,
    items: requirementSet.items,
    confirmation_id: input.confirmation_id,
    challenge_created_at: input.created_at,
    expires_at: input.expires_at,
  };
}

function assertCompleteConfirmationView(view: ConfirmationView): void {
  if (view.items.length !== REQUIREMENT_FIELDS.length) {
    fail("INVALID_CONFIRMATION", "Confirmation view must contain every requirement field");
  }
  const fields = new Set<string>();
  for (const item of view.items) {
    if (!REQUIREMENT_FIELDS.includes(item.field) || fields.has(item.field)) {
      fail("INVALID_CONFIRMATION", "Confirmation view requirement fields must be unique and complete");
    }
    fields.add(item.field);
    if ((item.status === "identified") !== (item.values.length > 0)) {
      fail("INVALID_CONFIRMATION", "Confirmation view values do not match item status");
    }
    if ((item.status === "unresolved") !== (item.source === "unresolved")) {
      fail("INVALID_CONFIRMATION", "Confirmation view item source does not match resolution status");
    }
  }
  const expectedSummary = view.items
    .map((item) => `${item.field}|${item.status}|${item.values.join("\u001f")}`)
    .join("\n");
  if (view.summary !== expectedSummary) {
    fail("CONFIRMATION_MISMATCH", "Confirmation view summary does not match its items");
  }
}

export function createConfirmationChallenge(
  value: RequirementSet,
  input: { readonly confirmation_id: string; readonly created_at: string; readonly expires_at: string },
): ConfirmationChallenge {
  const requirementSet = parseRequirementSet(value);
  if (requirementSet.status !== "ready-for-confirmation") {
    fail("UNRESOLVED_REQUIREMENTS", "Unresolved requirements cannot be confirmed");
  }
  assertNonEmptyId(input.confirmation_id, "Confirmation ID");
  if (parseTime(input.expires_at, "confirmation expiry") <= parseTime(input.created_at, "confirmation challenge time")) {
    fail("INVALID_CONFIRMATION", "Confirmation expiry must be after challenge creation");
  }
  const view = confirmationView(requirementSet, input);
  return parseConfirmationChallenge({
    schema_version: "1.0",
    record_type: "confirmation-challenge",
    action: "freeze-requirement-set",
    project: { repository_id: requirementSet.project.repository_id },
    formal_baseline: requirementSet.project.formal_baseline,
    requirement_set_id: requirementSet.requirement_set_id,
    requirement_set_version: requirementSet.version,
    requirement_set_generation: requirementSet.version,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view: view,
    confirmation_view_digest: digestJson(view),
    confirmation_id: input.confirmation_id,
    created_at: input.created_at,
    expires_at: input.expires_at,
  });
}

export function parseConfirmationChallenge(value: unknown): ConfirmationChallenge {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in confirmation challenge");
  }
  assertSafeContent(snapshot);
  if (!validateConfirmation(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "confirmation-challenge") {
    fail("INVALID_CONFIRMATION", "Invalid confirmation challenge");
  }
  if (parseTime(snapshot.expires_at, "confirmation expiry") <= parseTime(snapshot.created_at, "confirmation challenge time")) {
    fail("INVALID_CONFIRMATION", "Confirmation expiry must be after challenge creation");
  }
  try {
    assertDigestMatches(snapshot.confirmation_view, String(snapshot.confirmation_view_digest));
  } catch {
    fail("CONFIRMATION_MISMATCH", "Confirmation view identity does not match");
  }
  const view = snapshot.confirmation_view as Record<string, unknown>;
  assertCompleteConfirmationView(snapshot.confirmation_view as unknown as ConfirmationView);
  assertBindingMatches(
    {
      ...snapshot,
      confirmation_view_digest: snapshot.confirmation_view_digest,
    },
    {
      ...view,
      confirmation_view_digest: snapshot.confirmation_view_digest,
    },
    "Confirmation view",
  );
  if (
    view.challenge_created_at !== snapshot.created_at ||
    view.expires_at !== snapshot.expires_at ||
    view.requirement_set_generation !== snapshot.requirement_set_version
  ) {
    fail("CONFIRMATION_MISMATCH", "Confirmation view does not match challenge timing or generation");
  }
  return snapshot as unknown as ConfirmationChallenge;
}

// This only assembles unverified replay data. It is not evidence of a displayed view.
export function createUnverifiedConfirmationViewDisplay(
  value: ConfirmationChallenge,
  input: { readonly display_id: string; readonly displayed_at: string },
): ConfirmationViewDisplay {
  const challenge = parseConfirmationChallenge(value);
  assertNonEmptyId(input.display_id, "Display ID");
  assertStrictlyBetween(input.displayed_at, challenge.created_at, challenge.expires_at, "confirmation display time");
  return parseConfirmationViewDisplay({
    schema_version: "1.0",
    record_type: "confirmation-view-display",
    ...bindingFromChallenge(challenge),
    confirmation_view: challenge.confirmation_view,
    challenge,
    challenge_digest: digestJson(challenge),
    display_id: input.display_id,
    displayed_at: input.displayed_at,
  });
}

function bindingFromChallenge(challenge: ConfirmationChallenge): ConfirmationBinding {
  return {
    action: challenge.action,
    project: challenge.project,
    formal_baseline: challenge.formal_baseline,
    requirement_set_id: challenge.requirement_set_id,
    requirement_set_version: challenge.requirement_set_version,
    requirement_set_generation: challenge.requirement_set_generation,
    requirement_set_digest: challenge.requirement_set_digest,
    confirmation_view_digest: challenge.confirmation_view_digest,
    confirmation_id: challenge.confirmation_id,
  };
}

export function parseConfirmationViewDisplay(value: unknown): ConfirmationViewDisplay {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in confirmation view display");
  }
  assertSafeContent(snapshot);
  if (!validateConfirmation(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "confirmation-view-display") {
    fail("INVALID_CONFIRMATION", "Invalid confirmation view display");
  }
  const challenge = parseConfirmationChallenge(snapshot.challenge);
  try {
    assertDigestMatches(challenge, String(snapshot.challenge_digest));
  } catch {
    fail("CONFIRMATION_MISMATCH", "Confirmation display challenge identity does not match");
  }
  assertBindingMatches(snapshot, challenge, "Confirmation display");
  if (!sameJson(snapshot.confirmation_view, challenge.confirmation_view)) {
    fail("CONFIRMATION_MISMATCH", "Confirmation display does not contain the complete challenge view");
  }
  assertNonEmptyId(String(snapshot.display_id), "Display ID");
  assertStrictlyBetween(snapshot.displayed_at, challenge.created_at, challenge.expires_at, "confirmation display time");
  return snapshot as unknown as ConfirmationViewDisplay;
}

// This only assembles unverified replay data. It is not evidence of a user action.
export function createUnverifiedUserConfirmationAction(
  value: ConfirmationViewDisplay,
  input: { readonly user_action_id: string; readonly action: "confirm" | "reject" | "cancel"; readonly occurred_at: string },
): UserConfirmationAction {
  const display = parseConfirmationViewDisplay(value);
  assertNonEmptyId(input.user_action_id, "User action ID");
  if (input.user_action_id === display.display_id) {
    fail("INVALID_CONFIRMATION", "User action must be independent from the display event");
  }
  assertStrictlyBetween(input.occurred_at, display.displayed_at, display.challenge.expires_at, "user action time");
  return parseUserConfirmationAction({
    schema_version: "1.0",
    record_type: "user-confirmation-action",
    ...bindingFromChallenge(display.challenge),
    challenge_digest: display.challenge_digest,
    challenge_created_at: display.challenge.created_at,
    expires_at: display.challenge.expires_at,
    display_id: display.display_id,
    display_digest: digestJson(display),
    displayed_at: display.displayed_at,
    user_action_id: input.user_action_id,
    event_source: "independent-user-action",
    user_action: input.action,
    occurred_at: input.occurred_at,
  });
}

export function parseUserConfirmationAction(value: unknown): UserConfirmationAction {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in user confirmation action");
  }
  assertSafeContent(snapshot);
  if (!validateConfirmation(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "user-confirmation-action") {
    fail("INVALID_CONFIRMATION", "Invalid user confirmation action");
  }
  if (snapshot.user_action_id === snapshot.display_id) {
    fail("INVALID_CONFIRMATION", "User action must be independent from the display event");
  }
  assertStrictlyBetween(snapshot.occurred_at, snapshot.displayed_at, snapshot.expires_at, "user action time");
  if (parseTime(snapshot.displayed_at, "confirmation display time") <= parseTime(snapshot.challenge_created_at, "confirmation challenge time")) {
    fail("CONFIRMATION_MISMATCH", "User action does not bind a valid display order");
  }
  return snapshot as unknown as UserConfirmationAction;
}

export function verifyConfirmationInteraction(
  value: ConfirmationInteractionReplay,
  verifier?: ConfirmationInteractionVerifier,
): VerifiedConfirmationInteraction {
  if (
    verifier === undefined ||
    (typeof verifier !== "object" && typeof verifier !== "function") ||
    (verifier.verifier_kind !== "manual-isolated-fixture" && verifier.verifier_kind !== "trusted-host") ||
    typeof verifier.verify !== "function"
  ) {
    fail("CONFIRMATION_MISMATCH", "A confirmation interaction verifier is required");
  }
  const display = parseConfirmationViewDisplay(value.display);
  const action = parseUserConfirmationAction(value.user_action);
  assertActionMatchesDisplay(action, display);
  const replayDigest = digestJson({ display, user_action: action });
  const knownReplay = verifiedReplays.get(verifier)?.get(replayDigest);
  if (knownReplay !== undefined) {
    return knownReplay;
  }
  if (verifier.verify({ display, user_action: action }) !== true) {
    fail("CONFIRMATION_MISMATCH", "Confirmation interaction verifier rejected the replay");
  }
  const verified = Object.freeze({
    verification_boundary: "confirmation-interaction-verifier" as const,
    display,
    user_action: action,
  });
  verifiedInteractions.set(verified, verifier);
  const verifierReplays = verifiedReplays.get(verifier) ?? new Map<Sha256Digest, VerifiedConfirmationInteraction>();
  verifierReplays.set(replayDigest, verified);
  verifiedReplays.set(verifier, verifierReplays);
  return verified;
}

export function createConfirmationEnvelope(
  value: VerifiedConfirmationInteraction,
): ConfirmationEnvelope {
  if (verifiedInteractions.get(value) === undefined) {
    fail("CONFIRMATION_MISMATCH", "Confirmation envelope requires a verified interaction result");
  }
  const display = value.display;
  const action = value.user_action;
  assertActionMatchesDisplay(action, display);
  if (action.user_action !== "confirm") {
    fail("INVALID_CONFIRMATION", "Only a fresh explicit confirm action can form a confirmation envelope");
  }
  return parseConfirmationEnvelope({
    schema_version: "1.0",
    record_type: "confirmation-envelope",
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

export function createConfirmationInteractionSession(
  value: VerifiedConfirmationInteraction,
): ConfirmationInteractionSession {
  if (verifiedInteractions.get(value) === undefined) {
    fail("CONFIRMATION_MISMATCH", "Confirmation session requires a verified interaction result");
  }
  const existingSession = interactionSessionsByVerifiedReplay.get(value);
  if (existingSession !== undefined) {
    return existingSession;
  }
  const display = value.display;
  const initialState = Object.freeze({
    status: "pending" as const,
    requirement_set_generation: display.requirement_set_generation,
    challenge_digest: display.challenge_digest,
    display_digest: digestJson(display),
    expires_at: display.challenge.expires_at,
    evaluated_at: display.displayed_at,
  });
  const session = Object.freeze({
    runtime_boundary: "confirmation-interaction-session" as const,
  });
  interactionSessionsByVerifiedReplay.set(value, session);
  interactionSessionRecords.set(session, {
    verified_interaction: value,
    current_state: initialState,
  });
  return session;
}

export function getConfirmationInteractionState(
  session: ConfirmationInteractionSession,
): ConfirmationInteractionState {
  const record = interactionSessionRecords.get(session);
  if (record === undefined) {
    fail("CONFIRMATION_MISMATCH", "A trusted confirmation interaction session is required");
  }
  return record.current_state;
}

function stateMatchesDisplay(state: ConfirmationInteractionState, display: ConfirmationViewDisplay): boolean {
  return (
    state.requirement_set_generation === display.requirement_set_generation &&
    state.challenge_digest === display.challenge_digest &&
    state.display_digest === digestJson(display) &&
    state.expires_at === display.challenge.expires_at
  );
}

export function reduceConfirmationInteractionState(
  session: ConfirmationInteractionSession,
  event: ConfirmationInteractionStateEvent,
): ConfirmationInteractionState {
  const record = interactionSessionRecords.get(session);
  if (record === undefined) {
    fail("CONFIRMATION_MISMATCH", "A trusted confirmation interaction session is required");
  }
  const state = record.current_state;
  if (
    state.status === "rejected" ||
    state.status === "cancelled" ||
    state.status === "expired" ||
    state.status === "superseded"
  ) {
    return state;
  }
  const evaluatedAt = parseTime(event.evaluated_at, "interaction evaluation time");
  if (evaluatedAt < parseTime(state.evaluated_at, "previous interaction evaluation time")) {
    fail("CONFIRMATION_MISMATCH", "Confirmation interaction events must be monotonic");
  }
  const transition = (status: ConfirmationInteractionStatus): ConfirmationInteractionState => {
    const nextState = Object.freeze({ ...state, status, evaluated_at: event.evaluated_at });
    record.current_state = nextState;
    return nextState;
  };
  if (evaluatedAt >= parseTime(state.expires_at, "confirmation expiry")) {
    return transition("expired");
  }
  if (event.type === "view-change") {
    const display = parseConfirmationViewDisplay(event.display);
    if (evaluatedAt < parseTime(display.displayed_at, "changed confirmation display time")) {
      fail("CONFIRMATION_MISMATCH", "A view change cannot be evaluated before it is displayed");
    }
    return transition(stateMatchesDisplay(state, display) ? state.status : "superseded");
  }
  if (event.type === "evaluate") {
    return transition(state.status);
  }
  const action = parseUserConfirmationAction(event.user_action);
  if (evaluatedAt < parseTime(action.occurred_at, "user action time")) {
    fail("CONFIRMATION_MISMATCH", "A user action cannot be evaluated before it occurs");
  }
  if (
    action.requirement_set_generation !== state.requirement_set_generation ||
    action.challenge_digest !== state.challenge_digest ||
    action.display_digest !== state.display_digest ||
    action.expires_at !== state.expires_at
  ) {
    return transition("superseded");
  }
  const status: ConfirmationInteractionStatus = action.user_action === "confirm"
    ? "confirmed"
    : action.user_action === "reject"
      ? "rejected"
      : "cancelled";
  if (state.status === "confirmed" && status === "confirmed") {
    return transition(state.status);
  }
  return transition(status);
}

export function assertConfirmationExecutionContext(
  envelopeValue: ConfirmationEnvelope,
  context?: ConfirmationExecutionContext,
): void {
  const envelope = parseConfirmationEnvelope(envelopeValue);
  if (
    context === undefined ||
    typeof context.now !== "function" ||
    context.verifier === undefined ||
    context.verified_interaction === undefined ||
    context.interaction_session === undefined ||
    verifiedInteractions.get(context.verified_interaction) !== context.verifier
  ) {
    fail("CONFIRMATION_MISMATCH", "A trusted confirmation execution context is required");
  }
  const evaluatedAt = context.now();
  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.valueOf())) {
    fail("CONFIRMATION_MISMATCH", "Confirmation execution clock is invalid");
  }
  const currentStateRecord = interactionSessionRecords.get(context.interaction_session);
  if (
    currentStateRecord === undefined ||
    currentStateRecord.verified_interaction !== context.verified_interaction
  ) {
    fail("CONFIRMATION_MISMATCH", "Confirmation session does not match the verified replay");
  }
  const currentState = currentStateRecord.current_state;
  if (
    evaluatedAt.valueOf() < parseTime(envelope.user_action.occurred_at, "user action time") ||
    evaluatedAt.valueOf() < parseTime(currentState.evaluated_at, "interaction evaluation time") ||
    evaluatedAt.valueOf() >= parseTime(envelope.challenge.expires_at, "confirmation expiry")
  ) {
    fail("CONFIRMATION_MISMATCH", "Confirmation is expired at freeze evaluation");
  }
  const verified = context.verified_interaction;
  if (!sameJson(verified.display, envelope.display) || !sameJson(verified.user_action, envelope.user_action)) {
    fail("CONFIRMATION_MISMATCH", "Trusted interaction does not match the confirmation envelope");
  }
  if (currentState.status !== "confirmed" || !stateMatchesDisplay(currentState, envelope.display)) {
    fail("CONFIRMATION_MISMATCH", "Confirmation interaction is not the current confirmed generation");
  }
}

function assertActionMatchesDisplay(action: UserConfirmationAction, display: ConfirmationViewDisplay): void {
  assertBindingMatches(action, display, "User action");
  if (
    action.challenge_digest !== display.challenge_digest ||
    action.challenge_created_at !== display.challenge.created_at ||
    action.expires_at !== display.challenge.expires_at ||
    action.display_id !== display.display_id ||
    action.display_digest !== digestJson(display) ||
    action.displayed_at !== display.displayed_at
  ) {
    fail("CONFIRMATION_MISMATCH", "User action does not bind the displayed confirmation view");
  }
  assertStrictlyBetween(action.occurred_at, display.displayed_at, display.challenge.expires_at, "user action time");
}

export function parseConfirmationEnvelope(value: unknown): ConfirmationEnvelope {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in confirmation envelope");
  }
  assertSafeContent(snapshot);
  if (!validateConfirmation(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "confirmation-envelope") {
    fail("INVALID_CONFIRMATION", "Invalid confirmation envelope");
  }
  const challenge = parseConfirmationChallenge(snapshot.challenge);
  const display = parseConfirmationViewDisplay(snapshot.display);
  const action = parseUserConfirmationAction(snapshot.user_action);
  try {
    assertDigestMatches(challenge, String(snapshot.challenge_digest));
    assertDigestMatches(display, String(snapshot.display_digest));
    assertDigestMatches(action, String(snapshot.user_action_digest));
  } catch {
    fail("CONFIRMATION_MISMATCH", "Confirmation replay identity does not match");
  }
  assertBindingMatches(snapshot, challenge, "Confirmation envelope");
  if (!sameJson(display.challenge, challenge) || display.challenge_digest !== snapshot.challenge_digest) {
    fail("CONFIRMATION_MISMATCH", "Confirmation envelope display does not match challenge");
  }
  assertActionMatchesDisplay(action, display);
  if (action.user_action !== "confirm" || snapshot.confirmed_at !== action.occurred_at) {
    fail("CONFIRMATION_MISMATCH", "Confirmation time must derive from an independent confirm action");
  }
  return snapshot as unknown as ConfirmationEnvelope;
}

export function assertConfirmationMatchesRequirementSet(
  value: ConfirmationEnvelope,
  requirementSetValue: RequirementSet,
): void {
  const envelope = parseConfirmationEnvelope(value);
  const requirementSet = parseRequirementSet(requirementSetValue);
  if (requirementSet.status !== "ready-for-confirmation") {
    fail("UNRESOLVED_REQUIREMENTS", "Unresolved requirements cannot be frozen");
  }
  const expectedChallenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: envelope.confirmation_id,
    created_at: envelope.challenge.created_at,
    expires_at: envelope.challenge.expires_at,
  });
  if (!sameJson(envelope.challenge, expectedChallenge)) {
    fail("CONFIRMATION_MISMATCH", "Confirmation does not bind the current Requirement Set");
  }
}
