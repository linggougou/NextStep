import { Ajv, type ValidateFunction } from "ajv";

import productDefinitionSchema from "../../schemas/v1/product-definition.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { recoverFrozenRequirement, type FrozenRequirement } from "./requirement-freeze.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export interface ProductSourceRef {
  readonly pointer: string;
  readonly value_digest: Sha256Digest;
}

export interface DirectProductFact {
  readonly kind: "direct";
  readonly value: string;
  readonly source: ProductSourceRef;
}

export interface DerivedProductFact {
  readonly kind: "derived";
  readonly value: string;
  readonly derivation_summary: string;
  readonly source_refs: readonly ProductSourceRef[];
}

export type ProductFact = DirectProductFact | DerivedProductFact;

export type ProductJourneyAction = "start" | "complete";
export type ProductJourneyState = "not-started" | "in-progress" | "completed";

export interface ProductMetric {
  readonly measurement: { readonly kind: "completion-transition" };
  readonly target: { readonly semantic_source: ProductSourceRef; readonly required_state: "completed" };
  readonly evidence: { readonly journey_sequence: number; readonly transition_digest: Sha256Digest };
}

export interface ProductJourneyStateChange {
  readonly from: ProductJourneyState;
  readonly to: ProductJourneyState;
}

export interface ProductJourneyStep {
  readonly sequence: number;
  readonly actor: ProductFact;
  readonly semantic_source: ProductSourceRef;
  readonly action: ProductJourneyAction;
  readonly state_change: ProductJourneyStateChange;
  readonly outcome: ProductJourneyState;
}

export interface ProductDefinitionCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "product-definition-candidate";
  readonly product_definition_id: string;
  readonly frozen_requirement: FrozenRequirement;
  readonly frozen_requirement_digest: Sha256Digest;
  readonly prd: {
    readonly product_name: ProductFact;
    readonly problem: ProductFact;
    readonly target_users: readonly ProductFact[];
    readonly goals: readonly ProductFact[];
    readonly scenarios: readonly ProductFact[];
    readonly scope: readonly ProductFact[];
    readonly non_goals: readonly ProductFact[];
    readonly success_metrics: readonly ProductMetric[];
  };
  readonly user_journey: { readonly product_definition_id: string; readonly steps: readonly ProductJourneyStep[] };
  readonly capability_map: { readonly product_definition_id: string; readonly capabilities: readonly ProductFact[] };
  readonly status: "ready-for-signoff";
}

export interface ProductDefinitionSignoffChallenge {
  readonly schema_version: "1.0";
  readonly record_type: "product-definition-signoff-challenge";
  readonly project: FrozenRequirement["project"];
  readonly formal_baseline: string;
  readonly frozen_requirement_id: string;
  readonly frozen_requirement_digest: Sha256Digest;
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly full_display_digest: Sha256Digest;
  readonly signoff_id: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface ProductDefinitionDisplay {
  readonly schema_version: "1.0";
  readonly record_type: "product-definition-display";
  readonly challenge: ProductDefinitionSignoffChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display_id: string;
  readonly displayed_at: string;
}

export interface ProductDefinitionUserAction {
  readonly schema_version: "1.0";
  readonly record_type: "product-definition-user-action";
  readonly challenge_digest: Sha256Digest;
  readonly display_id: string;
  readonly display_digest: Sha256Digest;
  readonly user_action_id: string;
  readonly event_source: "independent-user-action";
  readonly user_action: "confirm" | "reject" | "cancel";
  readonly occurred_at: string;
}

export interface ProductDefinitionInteractionVerifier {
  readonly verifier_kind: "manual-isolated-fixture" | "trusted-host";
  verify(replay: { readonly display: ProductDefinitionDisplay; readonly user_action: ProductDefinitionUserAction }): boolean;
}

export interface VerifiedProductDefinitionInteraction {
  readonly verification_boundary: "product-definition-interaction-verifier";
  readonly display: ProductDefinitionDisplay;
  readonly user_action: ProductDefinitionUserAction;
}

export interface ProductDefinitionInteractionSession {
  readonly runtime_boundary: "product-definition-interaction-session";
}

export interface SignedProductDefinition {
  readonly schema_version: "1.0";
  readonly record_type: "signed-product-definition";
  readonly status: "signed";
  readonly product_definition: Omit<ProductDefinitionCandidate, "status">;
  readonly product_definition_digest: Sha256Digest;
  readonly challenge: ProductDefinitionSignoffChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly display: ProductDefinitionDisplay;
  readonly display_digest: Sha256Digest;
  readonly user_action: ProductDefinitionUserAction;
  readonly user_action_digest: Sha256Digest;
  readonly signed_at: string;
}

export type ProductDefinitionErrorCode = "INVALID_PRODUCT_DEFINITION" | "REQUIREMENT_NOT_FROZEN" | "SOURCE_BINDING_MISMATCH" | "SIGNOFF_MISMATCH" | "SENSITIVE_CONTENT_DETECTED";

export class ProductDefinitionError extends Error {
  readonly code: ProductDefinitionErrorCode;
  constructor(code: ProductDefinitionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCandidate: ValidateFunction = ajv.compile(productDefinitionSchema);
const verifiedInteractions = new WeakMap<object, WeakSet<object>>();
const sessions = new WeakMap<object, VerifiedProductDefinitionInteraction>();

function fail(code: ProductDefinitionErrorCode, message: string): never {
  throw new ProductDefinitionError(code, message);
}

function parseTime(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) fail("SIGNOFF_MISMATCH", `Invalid ${label}`);
  return timestamp;
}

function assertTimeBetween(value: string, lower: string, upper: string, label: string): void {
  const timestamp = parseTime(value, label);
  if (timestamp <= parseTime(lower, `${label} lower bound`) || timestamp >= parseTime(upper, `${label} expiry`)) {
    fail("SIGNOFF_MISMATCH", `Invalid ${label} order`);
  }
}

function candidateRecord(candidate: ProductDefinitionCandidate): Omit<ProductDefinitionCandidate, "status"> {
  const { status: _status, ...record } = candidate;
  return record;
}

export function deriveProductDefinitionId(value: FrozenRequirement): string {
  const frozen = recoverFrozenRequirement(value);
  const identity = digestJson({
    repository_id: frozen.project.repository_id,
    formal_baseline: frozen.project.formal_baseline,
    frozen_requirement_id: frozen.frozen_requirement_id,
    requirement_content_digest: frozen.requirement_content_digest,
  });
  return `pd-${identity.slice("sha256:".length)}`;
}

function resolveRequirementSource(frozen: FrozenRequirement, pointer: string): { readonly field: string; readonly value: string } {
  if (!/^\/requirement_set\/items\/\d+\/values\/\d+$/.test(pointer)) {
    fail("SOURCE_BINDING_MISMATCH", "Product facts must bind a Frozen Requirement value");
  }
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = frozen;
  for (const token of tokens) {
    if (!isPlainRecord(current) && !Array.isArray(current)) fail("SOURCE_BINDING_MISMATCH", "Frozen Requirement source pointer is invalid");
    if (!Object.hasOwn(current, token)) fail("SOURCE_BINDING_MISMATCH", "Frozen Requirement source pointer is missing");
    current = (current as Record<string, unknown>)[token];
  }
  const itemIndex = Number(pointer.split("/")[3]);
  const item = frozen.requirement_set.items[itemIndex];
  if (typeof current !== "string" || item === undefined) fail("SOURCE_BINDING_MISMATCH", "Frozen Requirement source pointer is invalid");
  return { field: item.field, value: current };
}

function assertSourceRef(frozen: FrozenRequirement, value: unknown, allowedFields: readonly string[]): void {
  if (!isPlainRecord(value) || typeof value.pointer !== "string" || typeof value.value_digest !== "string") {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product fact source");
  }
  const source = resolveRequirementSource(frozen, value.pointer);
  if (!allowedFields.includes(source.field) || digestJson(source.value) !== value.value_digest) {
    fail("SOURCE_BINDING_MISMATCH", "Product fact source does not satisfy its field role");
  }
}

function assertFact(frozen: FrozenRequirement, value: unknown, allowedFields: readonly string[]): asserts value is ProductFact {
  if (!isPlainRecord(value) || typeof value.kind !== "string" || typeof value.value !== "string" || value.value.length === 0) {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product fact");
  }
  if (value.kind === "direct") {
    if (!isPlainRecord(value.source) || Object.keys(value).length !== 3) fail("INVALID_PRODUCT_DEFINITION", "Invalid direct product fact");
    const source = resolveRequirementSource(frozen, value.source.pointer as string);
    assertSourceRef(frozen, value.source, allowedFields);
    if (value.value !== source.value) fail("SOURCE_BINDING_MISMATCH", "Direct product fact must equal its source value");
    return;
  }
  if (value.kind !== "derived" || typeof value.derivation_summary !== "string" || value.derivation_summary.length === 0 || !Array.isArray(value.source_refs) || value.source_refs.length === 0 || Object.keys(value).length !== 4) fail("INVALID_PRODUCT_DEFINITION", "Invalid derived product fact");
  for (const sourceRef of value.source_refs) assertSourceRef(frozen, sourceRef, allowedFields);
}

function assertFacts(frozen: FrozenRequirement, value: unknown, label: string, allowedFields: readonly string[]): void {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_PRODUCT_DEFINITION", `${label} is required`);
  for (const fact of value) assertFact(frozen, fact, allowedFields);
}

function sourceRefsMatch(left: ProductSourceRef, right: ProductSourceRef): boolean {
  return left.pointer === right.pointer && left.value_digest === right.value_digest;
}

export function digestProductJourneyTransition(productDefinitionId: string, step: ProductJourneyStep): Sha256Digest {
  return digestJson({
    product_definition_id: productDefinitionId,
    sequence: step.sequence,
    semantic_source: step.semantic_source,
    action: step.action,
    state_change: step.state_change,
    outcome: step.outcome,
  });
}

function assertMetrics(frozen: FrozenRequirement, value: unknown, productDefinitionId: string, steps: readonly ProductJourneyStep[]): void {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_PRODUCT_DEFINITION", "success_metrics is required");
  for (const metric of value) {
    if (!isPlainRecord(metric) || !isPlainRecord(metric.measurement) || !isPlainRecord(metric.target) || !isPlainRecord(metric.evidence)) {
      fail("INVALID_PRODUCT_DEFINITION", "Success metric must include controlled measurement, target, and evidence");
    }
    const measurement = metric.measurement as Record<string, unknown>;
    const target = metric.target as Record<string, unknown>;
    const evidence = metric.evidence as Record<string, unknown>;
    if (measurement.kind !== "completion-transition" || target.required_state !== "completed" || !isPlainRecord(target.semantic_source) || !Number.isInteger(evidence.journey_sequence) || typeof evidence.transition_digest !== "string") {
      fail("INVALID_PRODUCT_DEFINITION", "Invalid controlled success metric");
    }
    const semanticSource = target.semantic_source as unknown as ProductSourceRef;
    assertSourceRef(frozen, semanticSource, ["goals", "expected_outputs"]);
    const step = steps.find((candidate) => candidate.sequence === evidence.journey_sequence);
    if (step === undefined || step.state_change.to !== "completed" || step.outcome !== "completed" || !sourceRefsMatch(step.semantic_source, semanticSource) || digestProductJourneyTransition(productDefinitionId, step) !== evidence.transition_digest) {
      fail("SOURCE_BINDING_MISMATCH", "Metric evidence must bind the matching completed journey transition");
    }
  }
}

function assertJourneySteps(frozen: FrozenRequirement, value: unknown): asserts value is readonly ProductJourneyStep[] {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_PRODUCT_DEFINITION", "journey steps is required");
  let previousState: ProductJourneyState | undefined;
  for (const [index, step] of value.entries()) {
    if (!isPlainRecord(step) || step.sequence !== index + 1 || !isPlainRecord(step.state_change) || !isPlainRecord(step.semantic_source)) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey steps must be ordered and include a state change");
    }
    assertFact(frozen, step.actor, ["scenarios"]);
    const stateChange = step.state_change as Record<string, unknown>;
    assertSourceRef(frozen, step.semantic_source, ["goals", "expected_outputs"]);
    if ((step.action !== "start" || stateChange.from !== "not-started" || stateChange.to !== "in-progress") && (step.action !== "complete" || stateChange.from !== "in-progress" || stateChange.to !== "completed")) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey action must make a legal state transition");
    }
    if ((index === 0 && stateChange.from !== "not-started") || (index > 0 && stateChange.from !== previousState) || step.outcome !== stateChange.to) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey states must be continuous and outcome must equal the target state");
    }
    previousState = stateChange.to as ProductJourneyState;
  }
}

function assertExactOwnFields(value: unknown, fields: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value) || Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    fail("SIGNOFF_MISMATCH", `Invalid ${label} fields`);
  }
}

export function parseProductDefinitionCandidate(value: unknown): ProductDefinitionCandidate {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in product definition");
  }
  const candidateInput = isPlainRecord(snapshot) && snapshot.status === "ready-for-signoff"
    ? (() => {
        const { status: _status, ...record } = snapshot;
        return record;
      })()
    : snapshot;
  if (!isPlainRecord(candidateInput) || !validateCandidate(candidateInput)) {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product definition schema");
  }
  let frozen: FrozenRequirement;
  try {
    frozen = recoverFrozenRequirement(candidateInput.frozen_requirement);
  } catch {
    fail("REQUIREMENT_NOT_FROZEN", "Product definition requires a valid Frozen Requirement");
  }
  if (candidateInput.frozen_requirement_digest !== digestJson(frozen)) fail("REQUIREMENT_NOT_FROZEN", "Frozen Requirement identity does not match");
  const prd = candidateInput.prd as Record<string, unknown>;
  if (candidateInput.product_definition_id !== deriveProductDefinitionId(frozen)) fail("INVALID_PRODUCT_DEFINITION", "Product definition ID does not match Frozen Requirement identity");
  assertFact(frozen, prd.product_name, ["intent_summary", "expected_outputs"]);
  assertFact(frozen, prd.problem, ["scenarios", "goals"]);
  assertFacts(frozen, prd.target_users, "target_users", ["scenarios"]);
  assertFacts(frozen, prd.goals, "goals", ["goals"]);
  assertFacts(frozen, prd.scenarios, "scenarios", ["scenarios"]);
  assertFacts(frozen, prd.scope, "scope", ["goals", "expected_outputs", "constraints"]);
  assertFacts(frozen, prd.non_goals, "non_goals", ["non_goal_gaps", "constraints"]);
  const journey = candidateInput.user_journey as Record<string, unknown>;
  const capabilityMap = candidateInput.capability_map as Record<string, unknown>;
  if (journey.product_definition_id !== candidateInput.product_definition_id || capabilityMap.product_definition_id !== candidateInput.product_definition_id) fail("INVALID_PRODUCT_DEFINITION", "Journey and capability map must reference the product definition");
  assertJourneySteps(frozen, journey.steps);
  assertMetrics(frozen, prd.success_metrics, candidateInput.product_definition_id as string, journey.steps);
  assertFacts(frozen, capabilityMap.capabilities, "capabilities", ["goals", "expected_outputs"]);
  return Object.freeze({ ...(candidateInput as unknown as Omit<ProductDefinitionCandidate, "status">), frozen_requirement: frozen, status: "ready-for-signoff" as const });
}

export function createProductDefinitionSignoffChallenge(
  value: ProductDefinitionCandidate,
  input: { readonly signoff_id: string; readonly created_at: string; readonly expires_at: string },
): ProductDefinitionSignoffChallenge {
  const candidate = parseProductDefinitionCandidate(value);
  if (input.signoff_id.length === 0 || parseTime(input.expires_at, "signoff expiry") <= parseTime(input.created_at, "signoff creation")) fail("SIGNOFF_MISMATCH", "Invalid product definition signoff challenge");
  const record = candidateRecord(candidate);
  return Object.freeze({
    schema_version: "1.0" as const,
    record_type: "product-definition-signoff-challenge" as const,
    project: candidate.frozen_requirement.project,
    formal_baseline: candidate.frozen_requirement.project.formal_baseline,
    frozen_requirement_id: candidate.frozen_requirement.frozen_requirement_id,
    frozen_requirement_digest: candidate.frozen_requirement_digest,
    product_definition_id: candidate.product_definition_id,
    product_definition_digest: digestJson(record),
    full_display_digest: digestJson(record),
    signoff_id: input.signoff_id,
    created_at: input.created_at,
    expires_at: input.expires_at,
  });
}

export function createUnverifiedProductDefinitionDisplay(
  value: ProductDefinitionSignoffChallenge,
  input: { readonly display_id: string; readonly displayed_at: string },
): ProductDefinitionDisplay {
  if (input.display_id.length === 0) fail("SIGNOFF_MISMATCH", "Display ID is required");
  assertTimeBetween(input.displayed_at, value.created_at, value.expires_at, "display time");
  return Object.freeze({ schema_version: "1.0" as const, record_type: "product-definition-display" as const, challenge: value, challenge_digest: digestJson(value), display_id: input.display_id, displayed_at: input.displayed_at });
}

export function createUnverifiedProductDefinitionUserAction(
  display: ProductDefinitionDisplay,
  input: { readonly user_action_id: string; readonly action: "confirm" | "reject" | "cancel"; readonly occurred_at: string },
): ProductDefinitionUserAction {
  if (input.user_action_id.length === 0 || input.user_action_id === display.display_id) fail("SIGNOFF_MISMATCH", "Independent user action ID is required");
  assertTimeBetween(input.occurred_at, display.displayed_at, display.challenge.expires_at, "user action time");
  return Object.freeze({ schema_version: "1.0" as const, record_type: "product-definition-user-action" as const, challenge_digest: display.challenge_digest, display_id: display.display_id, display_digest: digestJson(display), user_action_id: input.user_action_id, event_source: "independent-user-action" as const, user_action: input.action, occurred_at: input.occurred_at });
}

export function verifyProductDefinitionInteraction(
  value: { readonly display: ProductDefinitionDisplay; readonly user_action: ProductDefinitionUserAction },
  verifier?: ProductDefinitionInteractionVerifier,
): VerifiedProductDefinitionInteraction {
  if (verifier === undefined || (verifier.verifier_kind !== "manual-isolated-fixture" && verifier.verifier_kind !== "trusted-host") || value.user_action.challenge_digest !== value.display.challenge_digest || value.user_action.display_id !== value.display.display_id || value.user_action.display_digest !== digestJson(value.display) || value.user_action.event_source !== "independent-user-action") fail("SIGNOFF_MISMATCH", "Trusted product definition verifier is required");
  let accepted = false;
  try { accepted = verifier.verify(value) === true; } catch { /* fail closed below */ }
  if (!accepted) fail("SIGNOFF_MISMATCH", "Product definition verifier rejected the interaction");
  const verified = Object.freeze({ verification_boundary: "product-definition-interaction-verifier" as const, display: value.display, user_action: value.user_action });
  const authorizers = new WeakSet<object>();
  authorizers.add(verifier);
  verifiedInteractions.set(verified, authorizers);
  return verified;
}

export function createProductDefinitionInteractionSession(value: VerifiedProductDefinitionInteraction): ProductDefinitionInteractionSession {
  if (verifiedInteractions.get(value) === undefined) fail("SIGNOFF_MISMATCH", "Verified product definition interaction is required");
  const session = Object.freeze({ runtime_boundary: "product-definition-interaction-session" as const });
  sessions.set(session, value);
  return session;
}

export function signProductDefinition(
  value: ProductDefinitionCandidate,
  verified: VerifiedProductDefinitionInteraction,
  session: ProductDefinitionInteractionSession,
  now: () => Date,
): SignedProductDefinition {
  const candidate = parseProductDefinitionCandidate(value);
  if (verifiedInteractions.get(verified) === undefined || sessions.get(session) !== verified) fail("SIGNOFF_MISMATCH", "A matching runtime signoff capability is required");
  const challenge = verified.display.challenge;
  const record = candidateRecord(candidate);
  if (verified.user_action.user_action !== "confirm" || challenge.product_definition_id !== candidate.product_definition_id || challenge.product_definition_digest !== digestJson(record) || challenge.full_display_digest !== digestJson(record) || challenge.frozen_requirement_id !== candidate.frozen_requirement.frozen_requirement_id || challenge.frozen_requirement_digest !== candidate.frozen_requirement_digest || challenge.project.repository_id !== candidate.frozen_requirement.project.repository_id || challenge.formal_baseline !== candidate.frozen_requirement.project.formal_baseline) fail("SIGNOFF_MISMATCH", "Signoff capability does not bind this complete product definition");
  const nowTime = now().getTime();
  if (Number.isNaN(nowTime) || nowTime >= parseTime(challenge.expires_at, "signoff expiry") || nowTime < parseTime(verified.user_action.occurred_at, "user action time")) fail("SIGNOFF_MISMATCH", "Signoff action is expired or not yet effective");
  return Object.freeze({ schema_version: "1.0" as const, record_type: "signed-product-definition" as const, status: "signed" as const, product_definition: record, product_definition_digest: digestJson(record), challenge, challenge_digest: digestJson(challenge), display: verified.display, display_digest: digestJson(verified.display), user_action: verified.user_action, user_action_digest: digestJson(verified.user_action), signed_at: verified.user_action.occurred_at });
}

export function recoverSignedProductDefinition(value: unknown): SignedProductDefinition {
  const snapshot = snapshotJsonValue(value);
  assertExactOwnFields(snapshot, ["schema_version", "record_type", "status", "product_definition", "product_definition_digest", "challenge", "challenge_digest", "display", "display_digest", "user_action", "user_action_digest", "signed_at"], "signed product definition");
  assertExactOwnFields(snapshot.challenge, ["schema_version", "record_type", "project", "formal_baseline", "frozen_requirement_id", "frozen_requirement_digest", "product_definition_id", "product_definition_digest", "full_display_digest", "signoff_id", "created_at", "expires_at"], "signoff challenge");
  assertExactOwnFields(snapshot.display, ["schema_version", "record_type", "challenge", "challenge_digest", "display_id", "displayed_at"], "signoff display");
  assertExactOwnFields(snapshot.user_action, ["schema_version", "record_type", "challenge_digest", "display_id", "display_digest", "user_action_id", "event_source", "user_action", "occurred_at"], "signoff user action");
  if (snapshot.schema_version !== "1.0" || snapshot.record_type !== "signed-product-definition" || snapshot.status !== "signed" || !isPlainRecord(snapshot.product_definition)) fail("SIGNOFF_MISMATCH", "Invalid signed product definition");
  const candidate = parseProductDefinitionCandidate(snapshot.product_definition);
  const record = candidateRecord(candidate);
  if (snapshot.product_definition_digest !== digestJson(record) || snapshot.challenge_digest !== digestJson(snapshot.challenge) || snapshot.display_digest !== digestJson(snapshot.display) || snapshot.user_action_digest !== digestJson(snapshot.user_action)) fail("SIGNOFF_MISMATCH", "Signed product definition identity does not match");
  const challenge = snapshot.challenge as unknown as ProductDefinitionSignoffChallenge;
  const display = snapshot.display as unknown as ProductDefinitionDisplay;
  const action = snapshot.user_action as unknown as ProductDefinitionUserAction;
  if (challenge.schema_version !== "1.0" || challenge.record_type !== "product-definition-signoff-challenge" || challenge.project.repository_id !== candidate.frozen_requirement.project.repository_id || challenge.formal_baseline !== candidate.frozen_requirement.project.formal_baseline || challenge.frozen_requirement_id !== candidate.frozen_requirement.frozen_requirement_id || challenge.frozen_requirement_digest !== candidate.frozen_requirement_digest || challenge.product_definition_id !== candidate.product_definition_id || challenge.product_definition_digest !== digestJson(record) || challenge.full_display_digest !== digestJson(record) || display.schema_version !== "1.0" || display.record_type !== "product-definition-display" || canonicalizeJson(display.challenge) !== canonicalizeJson(challenge) || display.challenge_digest !== snapshot.challenge_digest || action.schema_version !== "1.0" || action.record_type !== "product-definition-user-action" || action.challenge_digest !== snapshot.challenge_digest || action.display_id !== display.display_id || action.display_digest !== snapshot.display_digest || action.user_action !== "confirm" || action.event_source !== "independent-user-action" || snapshot.signed_at !== action.occurred_at) fail("SIGNOFF_MISMATCH", "Signed product definition bindings do not match");
  assertTimeBetween(display.displayed_at, challenge.created_at, challenge.expires_at, "display time");
  assertTimeBetween(action.occurred_at, display.displayed_at, challenge.expires_at, "user action time");
  return snapshot as unknown as SignedProductDefinition;
}
