import { Ajv, type ValidateFunction } from "ajv";

// 运行时只加载 Product Definition 2.0 Schema；v1 Schema 仅作为历史格式证据保留在仓库中。
import productDefinitionSchema from "../../schemas/v2/product-definition.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { recoverFrozenRequirement, type FrozenRequirement } from "./requirement-freeze.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export interface ProductSourceRef {
  readonly pointer: string;
  readonly value_digest: Sha256Digest;
}

// 字段级状态来源引用：绑定完整 Requirement Set item 及其 RFC8785 摘要，
// 与只允许 /values/N 的 ProductSourceRef 相互独立，不得混用。
export interface ProductFieldStatusSourceRef {
  readonly pointer: string;
  readonly item_digest: Sha256Digest;
}

export type ProductNonGoalsStatus = "identified" | "none";

export interface ProductNonGoalsIdentified {
  readonly status: "identified";
  readonly items: readonly ProductFact[];
  readonly source: ProductFieldStatusSourceRef;
}

export interface ProductNonGoalsNone {
  readonly status: "none";
  readonly items: readonly [];
  readonly source: ProductFieldStatusSourceRef;
}

export type ProductNonGoals = ProductNonGoalsIdentified | ProductNonGoalsNone;

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
  readonly activity: ProductFact;
  readonly result: ProductFact;
  readonly semantic_source: ProductSourceRef;
  readonly action: ProductJourneyAction;
  readonly state_change: ProductJourneyStateChange;
  readonly outcome: ProductJourneyState;
}

export interface ProductDefinitionCandidate {
  readonly schema_version: "2.0";
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
    readonly non_goals: ProductNonGoals;
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

export type ProductDefinitionInteractionStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "expired" | "superseded";

export interface ProductDefinitionInteractionState {
  readonly status: ProductDefinitionInteractionStatus;
  readonly product_definition_id: string;
  readonly challenge_digest: Sha256Digest;
  readonly display_digest: Sha256Digest;
  readonly expires_at: string;
  readonly evaluated_at: string;
}

export type ProductDefinitionInteractionStateEvent =
  | { readonly type: "user-action"; readonly verified_interaction: VerifiedProductDefinitionInteraction; readonly evaluated_at: string }
  | { readonly type: "evaluate"; readonly evaluated_at: string }
  | { readonly type: "view-change"; readonly display: ProductDefinitionDisplay; readonly evaluated_at: string };

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

// 产品定义专属线格式版本：只接受 2.0 正例。该判定不放宽全局
// assertSupportedContractVersion（其继续只接受 1.0 信封与其他 1.0 契约对象）。
const PRODUCT_DEFINITION_CANDIDATE_VERSION = "2.0";
const NON_GOAL_ITEM_POINTER_PATTERN = /^\/requirement_set\/items\/(\d+)$/;

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCandidate: ValidateFunction = ajv.compile(productDefinitionSchema);
const verifiedInteractions = new WeakMap<object, WeakSet<object>>();
const canonicalVerifiedInteractions = new Map<Sha256Digest, VerifiedProductDefinitionInteraction>();
const interactionSessionsByDisplay = new Map<Sha256Digest, ProductDefinitionInteractionSession>();
const interactionSessionRecords = new WeakMap<object, {
  verified_interaction: VerifiedProductDefinitionInteraction;
  current_state: ProductDefinitionInteractionState;
}>();

type ProductFactRole = "product_name" | "problem" | "target_users" | "goals" | "scenarios" | "scope" | "non_goals" | "capability" | "actor" | "activity" | "result";

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

function registerDirectFactRole(source: ProductSourceRef, role: ProductFactRole, directFactRoles: Map<string, ProductFactRole>): void {
  const sourceIdentity = canonicalizeJson(source);
  const existingRole = directFactRoles.get(sourceIdentity);
  if (existingRole !== undefined && existingRole !== role) {
    fail("SOURCE_BINDING_MISMATCH", "A direct product fact cannot fill multiple product roles");
  }
  directFactRoles.set(sourceIdentity, role);
}

function assertFact(
  frozen: FrozenRequirement,
  value: unknown,
  allowedFields: readonly string[],
  role: ProductFactRole,
  directFactRoles: Map<string, ProductFactRole>,
): asserts value is ProductFact {
  if (!isPlainRecord(value) || typeof value.kind !== "string" || typeof value.value !== "string" || value.value.length === 0) {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product fact");
  }
  if (value.kind === "direct") {
    if (!isPlainRecord(value.source) || Object.keys(value).length !== 3) fail("INVALID_PRODUCT_DEFINITION", "Invalid direct product fact");
    const source = resolveRequirementSource(frozen, value.source.pointer as string);
    assertSourceRef(frozen, value.source, allowedFields);
    if (value.value !== source.value) fail("SOURCE_BINDING_MISMATCH", "Direct product fact must equal its source value");
    registerDirectFactRole(value.source as unknown as ProductSourceRef, role, directFactRoles);
    return;
  }
  if (value.kind !== "derived" || typeof value.derivation_summary !== "string" || value.derivation_summary.length === 0 || !Array.isArray(value.source_refs) || value.source_refs.length === 0 || Object.keys(value).length !== 4) fail("INVALID_PRODUCT_DEFINITION", "Invalid derived product fact");
  if (!value.derivation_summary.startsWith(`role:${role};`)) {
    fail("SOURCE_BINDING_MISMATCH", "Derived product fact must use a role-specific derivation summary");
  }
  for (const sourceRef of value.source_refs) assertSourceRef(frozen, sourceRef, allowedFields);
}

function assertFacts(
  frozen: FrozenRequirement,
  value: unknown,
  label: string,
  allowedFields: readonly string[],
  role: ProductFactRole,
  directFactRoles: Map<string, ProductFactRole>,
): void {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_PRODUCT_DEFINITION", `${label} is required`);
  for (const fact of value) assertFact(frozen, fact, allowedFields, role, directFactRoles);
}

// 非目标状态对象校验：先验证字段级状态来源，再验证 identified 条目。
// 合法候选只存在 identified/none 两态；rejected/deferred/unresolved 已由
// S1.2 字段级 readiness 阻断，出现即 fail closed。
function assertNonGoals(
  frozen: FrozenRequirement,
  value: unknown,
  directFactRoles: Map<string, ProductFactRole>,
): void {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, "status") ||
    !Object.hasOwn(value, "items") ||
    !Object.hasOwn(value, "source")
  ) {
    fail("INVALID_PRODUCT_DEFINITION", "Product non-goals must contain exactly status, items, and source");
  }
  const status = value.status;
  if (status !== "identified" && status !== "none") {
    fail("INVALID_PRODUCT_DEFINITION", "Product non-goals status must be identified or none");
  }
  const items = value.items;
  if (!Array.isArray(items)) fail("INVALID_PRODUCT_DEFINITION", "Product non-goals items must be an array");
  const source = value.source;
  if (
    !isPlainRecord(source) ||
    Object.keys(source).length !== 2 ||
    typeof source.pointer !== "string" ||
    typeof source.item_digest !== "string"
  ) {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product non-goals field status source");
  }
  // 字段级来源必须精确指向完整的 non_goal_gaps Requirement Set item：
  // 不能指向 constraint/clarification 等其他字段 item，也不能退化为 /values/N。
  const pointerMatch = NON_GOAL_ITEM_POINTER_PATTERN.exec(source.pointer);
  const item = pointerMatch === null ? undefined : frozen.requirement_set.items[Number(pointerMatch[1])];
  if (item === undefined || item.field !== "non_goal_gaps") {
    fail("SOURCE_BINDING_MISMATCH", "Product non-goals source must bind the complete non_goal_gaps Requirement Set item");
  }
  // item_digest 是该完整 item 的 RFC8785 SHA-256，显式 none 也保留字段、状态、空值和用户来源证据。
  if (digestJson(item) !== source.item_digest) {
    fail("SOURCE_BINDING_MISMATCH", "Product non-goals source digest must bind the complete Requirement Set item");
  }
  if (status === "none") {
    if (items.length !== 0) fail("INVALID_PRODUCT_DEFINITION", "Explicit none cannot carry fabricated non-goal facts");
    return;
  }
  if (items.length === 0) fail("INVALID_PRODUCT_DEFINITION", "Identified non-goals require at least one user-confirmed fact");
  // constraints 永远不能充当非目标来源；条目只允许绑定 non_goal_gaps item 下的值。
  for (const fact of items) assertFact(frozen, fact, ["non_goal_gaps"], "non_goals", directFactRoles);
}

function sourceRefsMatch(left: ProductSourceRef, right: ProductSourceRef): boolean {
  return left.pointer === right.pointer && left.value_digest === right.value_digest;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

export function digestProductJourneyTransition(productDefinitionId: string, step: ProductJourneyStep): Sha256Digest {
  return digestJson({
    product_definition_id: productDefinitionId,
    sequence: step.sequence,
    actor: step.actor,
    activity: step.activity,
    result: step.result,
    semantic_source: step.semantic_source,
    action: step.action,
    state_change: step.state_change,
    outcome: step.outcome,
  });
}

function hasCompletedJourneyChain(
  steps: readonly ProductJourneyStep[],
  semanticSource: ProductSourceRef,
  completionSequence: number,
): boolean {
  let state: ProductJourneyState = "not-started";
  let sawStart = false;
  for (const step of steps) {
    if (!sourceRefsMatch(step.semantic_source, semanticSource)) continue;
    if (step.sequence > completionSequence) break;
    if (step.state_change.from !== state) return false;
    state = step.state_change.to;
    if (step.action === "start") sawStart = true;
    if (step.sequence === completionSequence) {
      return sawStart && step.action === "complete" && state === "completed";
    }
  }
  return false;
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
    if (step === undefined || step.action !== "complete" || step.state_change.to !== "completed" || step.outcome !== "completed" || !sourceRefsMatch(step.semantic_source, semanticSource) || !hasCompletedJourneyChain(steps, semanticSource, step.sequence) || digestProductJourneyTransition(productDefinitionId, step) !== evidence.transition_digest) {
      fail("SOURCE_BINDING_MISMATCH", "Metric evidence must bind the matching completed journey transition");
    }
  }
}

function assertProductSpecificJourneyFact(fact: ProductFact, label: "activity" | "result"): void {
  if (["start", "complete", "not-started", "in-progress", "completed"].includes(fact.value)) {
    fail("INVALID_PRODUCT_DEFINITION", `Journey ${label} must not be a state label`);
  }
}

function assertJourneySteps(
  frozen: FrozenRequirement,
  value: unknown,
  directFactRoles: Map<string, ProductFactRole>,
): asserts value is readonly ProductJourneyStep[] {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_PRODUCT_DEFINITION", "journey steps is required");
  const stateBySemanticSource = new Map<string, ProductJourneyState>();
  for (const [index, step] of value.entries()) {
    if (!isPlainRecord(step) || step.sequence !== index + 1 || !isPlainRecord(step.state_change) || !isPlainRecord(step.semantic_source)) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey steps must be ordered and include a state change");
    }
    const actor = step.actor;
    const activity = step.activity;
    const result = step.result;
    assertFact(frozen, actor, ["scenarios"], "actor", directFactRoles);
    assertFact(frozen, activity, ["goals", "expected_outputs", "scenarios"], "activity", directFactRoles);
    assertFact(frozen, result, ["goals", "expected_outputs"], "result", directFactRoles);
    assertProductSpecificJourneyFact(activity, "activity");
    assertProductSpecificJourneyFact(result, "result");
    const stateChange = step.state_change as Record<string, unknown>;
    const semanticSource = step.semantic_source as unknown as ProductSourceRef;
    assertSourceRef(frozen, semanticSource, ["goals", "expected_outputs"]);
    if ((step.action !== "start" || stateChange.from !== "not-started" || stateChange.to !== "in-progress") && (step.action !== "complete" || stateChange.from !== "in-progress" || stateChange.to !== "completed")) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey action must make a legal state transition");
    }
    const sourceIdentity = canonicalizeJson(semanticSource);
    const previousState = stateBySemanticSource.get(sourceIdentity) ?? "not-started";
    if (stateChange.from !== previousState || step.outcome !== stateChange.to) {
      fail("INVALID_PRODUCT_DEFINITION", "Journey states must be continuous for each semantic source and outcome must equal the target state");
    }
    stateBySemanticSource.set(sourceIdentity, stateChange.to as ProductJourneyState);
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
  if (!isPlainRecord(candidateInput)) {
    fail("INVALID_PRODUCT_DEFINITION", "Invalid product definition schema");
  }
  // 产品专属版本判定：只接受 2.0 正例；旧 1.0 候选明确拒绝，
  // 不提供自动迁移、双读、猜测或旧签名复用。
  if (candidateInput.schema_version !== PRODUCT_DEFINITION_CANDIDATE_VERSION) {
    if (candidateInput.schema_version === "1.0") {
      fail("INVALID_PRODUCT_DEFINITION", "Product Definition 1.0 candidates are rejected; rebuild a 2.0 candidate from the current Frozen Requirement");
    }
    fail("INVALID_PRODUCT_DEFINITION", "Product definition candidate must use schema_version 2.0");
  }
  if (!validateCandidate(candidateInput)) {
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
  const directFactRoles = new Map<string, ProductFactRole>();
  assertFact(frozen, prd.product_name, ["intent_summary", "expected_outputs"], "product_name", directFactRoles);
  assertFact(frozen, prd.problem, ["scenarios", "goals"], "problem", directFactRoles);
  assertFacts(frozen, prd.target_users, "target_users", ["scenarios"], "target_users", directFactRoles);
  assertFacts(frozen, prd.goals, "goals", ["goals"], "goals", directFactRoles);
  assertFacts(frozen, prd.scenarios, "scenarios", ["scenarios"], "scenarios", directFactRoles);
  assertFacts(frozen, prd.scope, "scope", ["goals", "expected_outputs", "constraints"], "scope", directFactRoles);
  assertNonGoals(frozen, prd.non_goals, directFactRoles);
  const journey = candidateInput.user_journey as Record<string, unknown>;
  const capabilityMap = candidateInput.capability_map as Record<string, unknown>;
  if (journey.product_definition_id !== candidateInput.product_definition_id || capabilityMap.product_definition_id !== candidateInput.product_definition_id) fail("INVALID_PRODUCT_DEFINITION", "Journey and capability map must reference the product definition");
  assertJourneySteps(frozen, journey.steps, directFactRoles);
  assertMetrics(frozen, prd.success_metrics, candidateInput.product_definition_id as string, journey.steps);
  assertFacts(frozen, capabilityMap.capabilities, "capabilities", ["goals", "expected_outputs"], "capability", directFactRoles);
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

function parseProductDefinitionInteractionReplay(
  value: { readonly display: ProductDefinitionDisplay; readonly user_action: ProductDefinitionUserAction },
): { readonly display: ProductDefinitionDisplay; readonly user_action: ProductDefinitionUserAction } {
  let snapshot: ReturnType<typeof snapshotJsonValue>;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("SIGNOFF_MISMATCH", "Invalid product definition interaction replay");
  }
  assertExactOwnFields(snapshot, ["display", "user_action"], "product definition interaction replay");
  assertExactOwnFields(snapshot.display, ["schema_version", "record_type", "challenge", "challenge_digest", "display_id", "displayed_at"], "product definition display");
  assertExactOwnFields(snapshot.display.challenge, ["schema_version", "record_type", "project", "formal_baseline", "frozen_requirement_id", "frozen_requirement_digest", "product_definition_id", "product_definition_digest", "full_display_digest", "signoff_id", "created_at", "expires_at"], "product definition challenge");
  assertExactOwnFields(snapshot.display.challenge.project, ["repository_id", "formal_baseline"], "product definition challenge project");
  assertExactOwnFields(snapshot.user_action, ["schema_version", "record_type", "challenge_digest", "display_id", "display_digest", "user_action_id", "event_source", "user_action", "occurred_at"], "product definition user action");
  const display = snapshot.display as unknown as ProductDefinitionDisplay;
  const action = snapshot.user_action as unknown as ProductDefinitionUserAction;
  if (
    display.schema_version !== "1.0" ||
    display.record_type !== "product-definition-display" ||
    display.challenge.schema_version !== "1.0" ||
    display.challenge.record_type !== "product-definition-signoff-challenge" ||
    typeof display.display_id !== "string" ||
    display.display_id.length === 0 ||
    typeof action.user_action_id !== "string" ||
    action.user_action_id.length === 0 ||
    action.user_action_id === display.display_id ||
    action.schema_version !== "1.0" ||
    action.record_type !== "product-definition-user-action" ||
    action.event_source !== "independent-user-action" ||
    (action.user_action !== "confirm" && action.user_action !== "reject" && action.user_action !== "cancel")
  ) {
    fail("SIGNOFF_MISMATCH", "Invalid product definition interaction replay");
  }
  assertTimeBetween(display.displayed_at, display.challenge.created_at, display.challenge.expires_at, "display time");
  assertTimeBetween(action.occurred_at, display.displayed_at, display.challenge.expires_at, "user action time");
  return Object.freeze({ display, user_action: action });
}

export function verifyProductDefinitionInteraction(
  value: { readonly display: ProductDefinitionDisplay; readonly user_action: ProductDefinitionUserAction },
  verifier?: ProductDefinitionInteractionVerifier,
): VerifiedProductDefinitionInteraction {
  const replay = parseProductDefinitionInteractionReplay(value);
  if (verifier === undefined || (verifier.verifier_kind !== "manual-isolated-fixture" && verifier.verifier_kind !== "trusted-host") || replay.user_action.challenge_digest !== replay.display.challenge_digest || replay.user_action.display_id !== replay.display.display_id || replay.user_action.display_digest !== digestJson(replay.display)) fail("SIGNOFF_MISMATCH", "Trusted product definition verifier is required");
  let accepted = false;
  try { accepted = verifier.verify(replay) === true; } catch { /* fail closed below */ }
  if (!accepted) fail("SIGNOFF_MISMATCH", "Product definition verifier rejected the interaction");
  const replayDigest = digestJson(replay);
  const verified = canonicalVerifiedInteractions.get(replayDigest) ?? Object.freeze({
    verification_boundary: "product-definition-interaction-verifier" as const,
    display: replay.display,
    user_action: replay.user_action,
  });
  canonicalVerifiedInteractions.set(replayDigest, verified);
  const authorizers = verifiedInteractions.get(verified) ?? new WeakSet<object>();
  authorizers.add(verifier);
  verifiedInteractions.set(verified, authorizers);
  return verified;
}

export function createProductDefinitionInteractionSession(value: VerifiedProductDefinitionInteraction): ProductDefinitionInteractionSession {
  if (verifiedInteractions.get(value) === undefined) fail("SIGNOFF_MISMATCH", "Verified product definition interaction is required");
  const displayIdentity = digestJson(value.display);
  const existingSession = interactionSessionsByDisplay.get(displayIdentity);
  if (existingSession !== undefined) return existingSession;
  const display = value.display;
  const initialState = Object.freeze({
    status: "pending" as const,
    product_definition_id: display.challenge.product_definition_id,
    challenge_digest: display.challenge_digest,
    display_digest: digestJson(display),
    expires_at: display.challenge.expires_at,
    evaluated_at: display.displayed_at,
  });
  const session = Object.freeze({ runtime_boundary: "product-definition-interaction-session" as const });
  interactionSessionsByDisplay.set(displayIdentity, session);
  interactionSessionRecords.set(session, {
    verified_interaction: value,
    current_state: initialState,
  });
  return session;
}

export function getProductDefinitionInteractionState(
  session: ProductDefinitionInteractionSession,
): ProductDefinitionInteractionState {
  const record = interactionSessionRecords.get(session);
  if (record === undefined) fail("SIGNOFF_MISMATCH", "A trusted product definition interaction session is required");
  return record.current_state;
}

function stateMatchesDisplay(state: ProductDefinitionInteractionState, display: ProductDefinitionDisplay): boolean {
  return (
    state.product_definition_id === display.challenge.product_definition_id &&
    state.challenge_digest === display.challenge_digest &&
    state.display_digest === digestJson(display) &&
    state.expires_at === display.challenge.expires_at
  );
}

function snapshotProductDefinitionDisplay(value: unknown): ProductDefinitionDisplay {
  let snapshot: ReturnType<typeof snapshotJsonValue>;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("SIGNOFF_MISMATCH", "Invalid product definition display");
  }
  assertExactOwnFields(snapshot, ["schema_version", "record_type", "challenge", "challenge_digest", "display_id", "displayed_at"], "product definition display");
  assertExactOwnFields(snapshot.challenge, ["schema_version", "record_type", "project", "formal_baseline", "frozen_requirement_id", "frozen_requirement_digest", "product_definition_id", "product_definition_digest", "full_display_digest", "signoff_id", "created_at", "expires_at"], "product definition challenge");
  assertExactOwnFields(snapshot.challenge.project, ["repository_id", "formal_baseline"], "product definition challenge project");
  const display = snapshot as unknown as ProductDefinitionDisplay;
  if (
    display.schema_version !== "1.0" ||
    display.record_type !== "product-definition-display" ||
    display.challenge.schema_version !== "1.0" ||
    display.challenge.record_type !== "product-definition-signoff-challenge" ||
    typeof display.display_id !== "string" ||
    display.display_id.length === 0 ||
    typeof display.displayed_at !== "string" ||
    typeof display.challenge_digest !== "string" ||
    typeof display.challenge.product_definition_id !== "string" ||
    typeof display.challenge.created_at !== "string" ||
    typeof display.challenge.expires_at !== "string"
  ) {
    fail("SIGNOFF_MISMATCH", "Invalid product definition display");
  }
  return display;
}

function snapshotProductDefinitionInteractionEvent(
  value: ProductDefinitionInteractionStateEvent,
): ProductDefinitionInteractionStateEvent {
  if (!isPlainRecord(value)) fail("SIGNOFF_MISMATCH", "Invalid product definition interaction event");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (descriptorKeys.some((key) => typeof key === "symbol")) {
    fail("SIGNOFF_MISMATCH", "Invalid product definition interaction event fields");
  }
  const typeDescriptor = descriptors.type;
  if (typeDescriptor === undefined || !typeDescriptor.enumerable || !("value" in typeDescriptor)) {
    fail("SIGNOFF_MISMATCH", "Invalid product definition interaction event type");
  }
  const eventType: unknown = typeDescriptor.value;
  if (eventType !== "user-action" && eventType !== "evaluate" && eventType !== "view-change") {
    fail("SIGNOFF_MISMATCH", "Unknown product definition interaction event type");
  }
  const expectedFields = eventType === "user-action"
    ? ["type", "verified_interaction", "evaluated_at"]
    : eventType === "view-change"
      ? ["type", "display", "evaluated_at"]
      : ["type", "evaluated_at"];
  if (
    descriptorKeys.length !== expectedFields.length ||
    expectedFields.some((field) => {
      const descriptor = descriptors[field];
      return descriptor === undefined || !descriptor.enumerable || !("value" in descriptor);
    })
  ) {
    fail("SIGNOFF_MISMATCH", "Invalid product definition interaction event fields");
  }
  const evaluatedAt = descriptors.evaluated_at?.value;
  if (typeof evaluatedAt !== "string") fail("SIGNOFF_MISMATCH", "Invalid product definition interaction evaluation time");
  if (eventType === "user-action") {
    return Object.freeze({
      type: eventType,
      verified_interaction: descriptors.verified_interaction?.value as VerifiedProductDefinitionInteraction,
      evaluated_at: evaluatedAt,
    });
  }
  if (eventType === "view-change") {
    return Object.freeze({
      type: eventType,
      display: snapshotProductDefinitionDisplay(descriptors.display?.value),
      evaluated_at: evaluatedAt,
    });
  }
  return Object.freeze({ type: eventType, evaluated_at: evaluatedAt });
}

export function reduceProductDefinitionInteractionState(
  session: ProductDefinitionInteractionSession,
  event: ProductDefinitionInteractionStateEvent,
): ProductDefinitionInteractionState {
  const record = interactionSessionRecords.get(session);
  if (record === undefined) fail("SIGNOFF_MISMATCH", "A trusted product definition interaction session is required");
  const eventSnapshot = snapshotProductDefinitionInteractionEvent(event);
  const state = record.current_state;
  const eventType = eventSnapshot.type;
  const userActionEvent = eventSnapshot as Extract<ProductDefinitionInteractionStateEvent, { readonly type: "user-action" }>;
  const viewChangeEvent = eventSnapshot as Extract<ProductDefinitionInteractionStateEvent, { readonly type: "view-change" }>;
  const verifiedInteraction = eventType === "user-action" ? userActionEvent.verified_interaction : undefined;
  if (
    eventType === "user-action" &&
    (
      verifiedInteraction === undefined ||
      verifiedInteractions.get(verifiedInteraction) === undefined ||
      !sameJson(verifiedInteraction.display, record.verified_interaction.display) ||
      !stateMatchesDisplay(state, verifiedInteraction.display)
    )
  ) {
    fail("SIGNOFF_MISMATCH", "User action capability does not match the current product definition session");
  }
  if (state.status === "rejected" || state.status === "cancelled" || state.status === "expired" || state.status === "superseded") {
    return state;
  }
  const evaluatedAt = parseTime(eventSnapshot.evaluated_at, "product definition interaction evaluation time");
  if (evaluatedAt < parseTime(state.evaluated_at, "previous product definition interaction evaluation time")) {
    fail("SIGNOFF_MISMATCH", "Product definition interaction events must be monotonic");
  }
  const transition = (status: ProductDefinitionInteractionStatus): ProductDefinitionInteractionState => {
    const nextState = Object.freeze({ ...state, status, evaluated_at: eventSnapshot.evaluated_at });
    record.current_state = nextState;
    return nextState;
  };
  if (evaluatedAt >= parseTime(state.expires_at, "product definition signoff expiry")) {
    return transition("expired");
  }
  if (eventType === "view-change") {
    const display = viewChangeEvent.display;
    if (evaluatedAt < parseTime(display.displayed_at, "changed product definition display time")) {
      fail("SIGNOFF_MISMATCH", "A product definition view change cannot be evaluated before it is displayed");
    }
    return transition(stateMatchesDisplay(state, display) ? state.status : "superseded");
  }
  if (eventType === "evaluate") return transition(state.status);
  const action = userActionEvent.verified_interaction.user_action;
  if (evaluatedAt < parseTime(action.occurred_at, "product definition user action time")) {
    fail("SIGNOFF_MISMATCH", "A product definition user action cannot be evaluated before it occurs");
  }
  if (action.user_action === "confirm") {
    if (state.status === "confirmed") {
      if (userActionEvent.verified_interaction !== record.verified_interaction) {
        fail("SIGNOFF_MISMATCH", "Confirm action capability is not the current canonical replay");
      }
      return transition(state.status);
    }
    record.verified_interaction = userActionEvent.verified_interaction;
    return transition("confirmed");
  }
  return transition(action.user_action === "reject" ? "rejected" : "cancelled");
}

export function signProductDefinition(
  value: ProductDefinitionCandidate,
  verified: VerifiedProductDefinitionInteraction,
  session: ProductDefinitionInteractionSession,
  now: () => Date,
): SignedProductDefinition {
  const candidate = parseProductDefinitionCandidate(value);
  const sessionRecord = interactionSessionRecords.get(session);
  if (verifiedInteractions.get(verified) === undefined || sessionRecord === undefined || sessionRecord.verified_interaction !== verified) fail("SIGNOFF_MISMATCH", "A matching runtime signoff capability is required");
  const challenge = verified.display.challenge;
  const record = candidateRecord(candidate);
  if (verified.user_action.user_action !== "confirm" || challenge.product_definition_id !== candidate.product_definition_id || challenge.product_definition_digest !== digestJson(record) || challenge.full_display_digest !== digestJson(record) || challenge.frozen_requirement_id !== candidate.frozen_requirement.frozen_requirement_id || challenge.frozen_requirement_digest !== candidate.frozen_requirement_digest || challenge.project.repository_id !== candidate.frozen_requirement.project.repository_id || challenge.formal_baseline !== candidate.frozen_requirement.project.formal_baseline) fail("SIGNOFF_MISMATCH", "Signoff capability does not bind this complete product definition");
  const nowValue = now();
  const nowTime = nowValue instanceof Date ? nowValue.getTime() : Number.NaN;
  const currentState = sessionRecord.current_state;
  if (Number.isNaN(nowTime) || nowTime >= parseTime(challenge.expires_at, "signoff expiry") || nowTime < parseTime(verified.user_action.occurred_at, "user action time") || nowTime < parseTime(currentState.evaluated_at, "product definition interaction evaluation time") || currentState.status !== "confirmed" || !stateMatchesDisplay(currentState, verified.display)) fail("SIGNOFF_MISMATCH", "Product definition signoff is not the current confirmed state");
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
