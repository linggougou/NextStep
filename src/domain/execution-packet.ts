import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import executionPacketSchema from "../../schemas/v1/execution-packet.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { parseSmallMilestonePlan, type SmallMilestone, type SmallMilestoneId, type SmallMilestonePlan } from "./small-milestone.ts";
import { isPlainRecord } from "./value-guards.ts";
import type { VersionChainProject } from "./version-chain.ts";

export interface ExecutionPacketControlIdentity {
  readonly repository_id: Sha256Digest;
  readonly route_generation: number;
  readonly stage_id: string;
  readonly plan_id: string;
  readonly plan_generation: number;
  readonly task_id: SmallMilestoneId;
  readonly task_attempt: number;
  readonly baseline_oid: string;
}

export interface ExecutionPacketCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "execution-packet-candidate";
  readonly command: "packet-build";
  readonly dry_run: boolean;
  readonly project: VersionChainProject;
  readonly small_milestone_plan: SmallMilestonePlan;
  readonly selected_milestone_id: SmallMilestoneId;
  readonly control_identity: ExecutionPacketControlIdentity;
  readonly target: { readonly milestone_id: SmallMilestoneId; readonly objective: string; readonly why_now: string };
  readonly input_bindings: readonly { readonly input_id: string; readonly requirement: string; readonly source_ref: string; readonly source_digest: string }[];
  readonly dependency_proofs: readonly { readonly dependency_id: SmallMilestoneId; readonly status: "satisfied"; readonly evidence_ref: string; readonly evidence_digest: string }[];
  readonly scope: { readonly allowed_paths: readonly string[]; readonly forbidden_paths: readonly string[]; readonly non_goals: readonly string[]; readonly modifies_signed_upstream: boolean; readonly change_request_ref: string | null };
  readonly output_contract: { readonly required_outputs: readonly string[]; readonly candidate_form: "immutable-candidate" };
  readonly verification: {
    readonly checks: readonly { readonly check_id: string; readonly check_type: "positive" | "negative" | "blocked" | "recovery" }[];
    readonly acceptance_types: readonly ("integration" | "interaction" | "product" | "ui_restoration")[];
    readonly failure_rules: readonly string[];
  };
  readonly execution: {
    readonly sandbox_mode: "isolated-worktree";
    readonly host_mode: "manual-isolated";
    readonly timeout_policy: { readonly timeout_ms: number; readonly on_timeout: "blocked" };
  };
  readonly reporting: { readonly result_schema_version: "1.0"; readonly evidence_requirements: readonly string[]; readonly escalation_rules: readonly string[] };
  readonly validity: { readonly created_at: string; readonly expires_at: string };
}

export interface ExecutionPacketEvaluationContext {
  readonly clock: () => unknown;
  readonly expected: {
    readonly repository_id: string;
    readonly baseline_oid: string;
    readonly route_generation: 1;
    readonly plan_generation: 1;
    readonly task_attempt: 1;
  };
  readonly input_authorities: readonly {
    readonly input_id: "S2.3" | "S4";
    readonly source_ref: string;
    readonly source_digest: string;
  }[];
  readonly accepted_dependency_results: readonly {
    readonly dependency_id: SmallMilestoneId;
    readonly repository_id: string;
    readonly baseline_oid: string;
    readonly route_generation: 1;
    readonly stage_id: string;
    readonly plan_id: string;
    readonly plan_generation: 1;
    readonly task_id: SmallMilestoneId;
    readonly task_attempt: number;
    readonly status: "accepted";
    readonly result_ref: string;
    readonly result_digest: string;
  }[];
}

export interface ExecutionPacket {
  readonly schema_version: "1.0";
  readonly packet_id: string;
  readonly packet_digest: Sha256Digest;
  readonly repository_id: Sha256Digest;
  readonly route_generation: number;
  readonly stage_id: string;
  readonly plan_id: string;
  readonly plan_generation: number;
  readonly task_id: SmallMilestoneId;
  readonly task_attempt: number;
  readonly baseline_oid: string;
  readonly milestone_id: SmallMilestoneId;
  readonly objective: string;
  readonly why_now: string;
  readonly source_refs: readonly { readonly source_id: string; readonly ref: string }[];
  readonly input_digests: readonly { readonly source_id: string; readonly digest: string }[];
  readonly dependency_proofs: ExecutionPacketCandidate["dependency_proofs"];
  readonly allowed_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
  readonly non_goals: readonly string[];
  readonly modifies_signed_upstream: boolean;
  readonly change_request_ref: string | null;
  readonly required_outputs: readonly string[];
  readonly candidate_form: "immutable-candidate";
  readonly checks: ExecutionPacketCandidate["verification"]["checks"];
  readonly acceptance_types: ExecutionPacketCandidate["verification"]["acceptance_types"];
  readonly failure_rules: readonly string[];
  readonly sandbox_mode: "isolated-worktree";
  readonly host_mode: "manual-isolated";
  readonly timeout_policy: ExecutionPacketCandidate["execution"]["timeout_policy"];
  readonly result_schema_version: "1.0";
  readonly evidence_requirements: readonly string[];
  readonly escalation_rules: readonly string[];
  readonly created_at: string;
  readonly expires_at: string;
  readonly dedup_key: Sha256Digest;
}

export interface ExecutionPacketResult {
  readonly schema_version: "1.0";
  readonly record_type: "execution-packet-validation";
  readonly status: "packet-valid-only";
  readonly candidate: ExecutionPacketCandidate;
  readonly execution_packet: ExecutionPacket;
  readonly candidate_digest: Sha256Digest;
  readonly summary: { readonly field_group_count: 10; readonly source_ref_count: number; readonly dependency_proof_count: number; readonly check_count: number; readonly side_effects: "none" };
}

export type ExecutionPacketReasonCode =
  | "INVALID_EXECUTION_PACKET" | "SENSITIVE_INPUT" | "DRY_RUN_REQUIRED" | "UPSTREAM_SMALL_MILESTONE_INVALID"
  | "PROJECT_BINDING_MISMATCH" | "CONTROL_IDENTITY_MISMATCH" | "MILESTONE_NOT_FOUND" | "MILESTONE_NOT_UNIQUE"
  | "MILESTONE_CONTRACT_MISMATCH" | "INPUT_BINDING_MISSING" | "INPUT_BINDING_CONFLICT" | "SOURCE_DIGEST_INVALID"
  | "DEPENDENCY_PROOF_MISSING" | "DEPENDENCY_UNSATISFIED" | "DEPENDENCY_PROOF_CONFLICT" | "PATH_NOT_NORMALIZED"
  | "PATH_SCOPE_CONFLICT" | "CONTROL_PATH_FORBIDDEN" | "CHANGE_REQUEST_REQUIRED" | "ACCEPTANCE_PROFILE_CONFLICT"
  | "CHECK_COVERAGE_MISSING" | "HOST_MODE_BLOCKED" | "INVALID_VALIDITY_WINDOW"
  | "EVALUATION_CONTEXT_REQUIRED" | "INVALID_VALIDATION_CLOCK" | "PACKET_NOT_YET_VALID" | "PACKET_EXPIRED"
  | "SIGNED_UPSTREAM_FORBIDDEN" | "SIGNED_PATH_FORBIDDEN" | "INITIAL_IDENTITY_REQUIRED" | "PLAN_ID_MISMATCH"
  | "INPUT_AUTHORITY_CONFLICT" | "DEPENDENCY_AUTHORITY_CONFLICT"
  | "PACKET_DIGEST_MISMATCH" | "DEDUP_KEY_MISMATCH" | "SUMMARY_MISMATCH" | "RESULT_INTEGRITY_MISMATCH";

export interface ExecutionPacketReason { readonly code: ExecutionPacketReasonCode; readonly path: string; readonly message: string }

function sortReasons(reasons: readonly ExecutionPacketReason[]): readonly ExecutionPacketReason[] {
  return Object.freeze([...reasons].sort((left, right) => {
    const leftKey = `${left.code}\u0000${left.path}\u0000${left.message}`;
    const rightKey = `${right.code}\u0000${right.path}\u0000${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }).map((reason) => Object.freeze({ ...reason })));
}

export class ExecutionPacketError extends Error {
  readonly reasons: readonly ExecutionPacketReason[];
  constructor(reasons: readonly ExecutionPacketReason[]) { super("Execution packet candidate rejected"); this.reasons = sortReasons(reasons); }
}

function reject(code: ExecutionPacketReasonCode, path: string, message: string): never { throw new ExecutionPacketError([{ code, path, message }]); }

const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: false, coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true });
const validateCandidate: ValidateFunction<ExecutionPacketCandidate> = ajv.compile<ExecutionPacketCandidate>(executionPacketSchema);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const requiredChecks = ["positive", "negative", "blocked", "recovery"] as const;

function safeValue(value: unknown, integrity = false): JsonValue {
  let snapshot: JsonValue;
  try { snapshot = snapshotJsonValue(value); } catch { reject(integrity ? "RESULT_INTEGRITY_MISMATCH" : "INVALID_EXECUTION_PACKET", "$", "Value must be safe JSON"); }
  try { assertNoSensitiveFields(snapshot); assertNoSensitiveContent(snapshot); }
  catch { reject(integrity ? "RESULT_INTEGRITY_MISMATCH" : "SENSITIVE_INPUT", "$", "Value contains sensitive input"); }
  return snapshot;
}

function schemaReasons(errors: readonly ErrorObject[]): readonly ExecutionPacketReason[] {
  return errors.map((error) => ({ code: "INVALID_EXECUTION_PACKET", path: error.instancePath || "$", message: `Schema keyword rejected: ${error.keyword}` }));
}

function expectedStage(milestone: SmallMilestone): string {
  return `P5/V${milestone.major_milestone_id[1]}/${milestone.major_milestone_id}/${milestone.milestone_id}`;
}

function isNormalizedPath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\") || path.includes("//") || path.includes("\0") || path.length === 0) return false;
  if (path.includes("*") && (!path.endsWith("/**") || path.slice(0, -3).includes("*"))) return false;
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function pathRoot(path: string): string { return path.endsWith("/**") ? path.slice(0, -3) : path; }
function pathsOverlap(left: string, right: string): boolean {
  const a = pathRoot(left); const b = pathRoot(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function isControlPath(path: string): boolean {
  const root = pathRoot(path);
  return root === ".git" || root.startsWith(".git/") || root === ".codex" || root.startsWith(".codex/") || root === "PROJECT_ROUTE_LOCK.md";
}

const signedTruthRoots = ["docs/product-specs", "docs/design-docs", "docs/architecture", "docs/exec-plans"] as const;
function overlapsSignedTruth(path: string): boolean { return signedTruthRoots.some((root) => pathsOverlap(path, root)); }
function planIdFor(plan: SmallMilestonePlan): string { return `plan-${plan.candidate_digest.slice("sha256:".length, 31)}`; }

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function parseUpstream(candidate: ExecutionPacketCandidate): SmallMilestonePlan {
  let plan: SmallMilestonePlan;
  try { plan = parseSmallMilestonePlan(candidate.small_milestone_plan); }
  catch {
    const selectedCount = Array.isArray(candidate.small_milestone_plan.milestones)
      ? candidate.small_milestone_plan.milestones.filter(({ milestone_id }) => milestone_id === candidate.selected_milestone_id).length
      : 0;
    if (selectedCount > 1) reject("MILESTONE_NOT_UNIQUE", "/selected_milestone_id", "Selected milestone appears more than once");
    reject("UPSTREAM_SMALL_MILESTONE_INVALID", "/small_milestone_plan", "Accepted S2.3 plan revalidation failed");
  }
  if (canonicalizeJson(candidate.project) !== canonicalizeJson(plan.project)) reject("PROJECT_BINDING_MISMATCH", "/project", "Project differs from accepted S2.3 plan");
  return plan;
}

function assertEvaluationContext(context: ExecutionPacketEvaluationContext | undefined): asserts context is ExecutionPacketEvaluationContext {
  const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
  const exactKeys = (value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean => {
    const actual = Object.keys(value).sort(); const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((field, index) => field === sorted[index]);
  };
  const contextRecord = context as unknown;
  if (!isRecord(contextRecord) || !exactKeys(contextRecord, ["clock", "expected", "input_authorities", "accepted_dependency_results"]) || typeof contextRecord.clock !== "function") {
    reject("EVALUATION_CONTEXT_REQUIRED", "/context", "A trusted in-process evaluation context is required");
  }
  const expected = contextRecord.expected;
  const inputs = contextRecord.input_authorities;
  const dependencies = contextRecord.accepted_dependency_results;
  const inputFields = ["input_id", "source_ref", "source_digest"] as const;
  const dependencyFields = ["dependency_id", "repository_id", "baseline_oid", "route_generation", "stage_id", "plan_id", "plan_generation", "task_id", "task_attempt", "status", "result_ref", "result_digest"] as const;
  if (!isRecord(expected) || !exactKeys(expected, ["repository_id", "baseline_oid", "route_generation", "plan_generation", "task_attempt"]) || !Array.isArray(inputs) || !inputs.every((value) => isRecord(value) && exactKeys(value, inputFields)) || !Array.isArray(dependencies) || !dependencies.every((value) => isRecord(value) && exactKeys(value, dependencyFields))) reject("EVALUATION_CONTEXT_REQUIRED", "/context", "Trusted evaluation context shape differs");
}

function readValidationClock(context: ExecutionPacketEvaluationContext): number {
  let raw: unknown;
  try { raw = context.clock(); } catch { reject("INVALID_VALIDATION_CLOCK", "/context/clock", "Validation clock failed"); }
  const value = raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(value)) reject("INVALID_VALIDATION_CLOCK", "/context/clock", "Validation clock must return a finite instant");
  return value;
}

function semanticReasons(
  candidate: ExecutionPacketCandidate,
  plan: SmallMilestonePlan,
  milestone: SmallMilestone,
  context?: ExecutionPacketEvaluationContext,
  now?: number,
): readonly ExecutionPacketReason[] {
  const reasons: ExecutionPacketReason[] = [];
  const add = (code: ExecutionPacketReasonCode, path: string, message: string): void => { reasons.push({ code, path, message }); };
  if (!candidate.dry_run) add("DRY_RUN_REQUIRED", "/dry_run", "S2.4 is candidate-only");
  const identity = candidate.control_identity;
  if (identity.repository_id !== candidate.project.repository_id || identity.baseline_oid !== candidate.project.formal_baseline || identity.task_id !== milestone.milestone_id || identity.stage_id !== expectedStage(milestone)) add("CONTROL_IDENTITY_MISMATCH", "/control_identity", "Control identity differs from project or selected milestone");
  if (identity.route_generation !== 1 || identity.plan_generation !== 1 || identity.task_attempt !== 1) add("INITIAL_IDENTITY_REQUIRED", "/control_identity", "S2.4 supports initial generation and attempt only");
  if (identity.plan_id !== planIdFor(plan)) add("PLAN_ID_MISMATCH", "/control_identity/plan_id", "Plan id must be derived from the accepted S2.3 candidate digest");
  if (context !== undefined) {
    const expected = context.expected;
    if (expected === undefined || expected.repository_id !== plan.project.repository_id || expected.baseline_oid !== plan.project.formal_baseline || expected.route_generation !== 1 || expected.plan_generation !== 1 || expected.task_attempt !== 1) add("CONTROL_IDENTITY_MISMATCH", "/context/expected", "Trusted identity context differs from the revalidated S2.3 plan");
    else if (identity.repository_id !== expected.repository_id || identity.baseline_oid !== expected.baseline_oid || identity.route_generation !== expected.route_generation || identity.plan_generation !== expected.plan_generation || identity.task_attempt !== expected.task_attempt) add("CONTROL_IDENTITY_MISMATCH", "/control_identity", "Candidate identity differs from trusted context");
  }
  const target = candidate.target;
  const expectedWhy = `Execute ${milestone.title} after accepted dependencies`;
  if (target.milestone_id !== milestone.milestone_id || target.objective !== milestone.outputs || target.why_now !== expectedWhy || !sameStrings(candidate.scope.non_goals, [milestone.non_goals]) || !sameStrings(candidate.output_contract.required_outputs, [milestone.outputs]) || !sameStrings(candidate.verification.failure_rules, [milestone.failure_return]) || !sameStrings(candidate.reporting.evidence_requirements, [milestone.tests, milestone.definition_of_done]) || !sameStrings(candidate.reporting.escalation_rules, [milestone.failure_return])) add("MILESTONE_CONTRACT_MISMATCH", "/target", "Packet does not preserve the complete selected milestone contract");

  const requiredInputs = ["S2.3", "S4"] as const;
  const inputIds = candidate.input_bindings.map(({ input_id }) => input_id);
  if (candidate.input_bindings.length !== 2 || new Set(inputIds).size !== inputIds.length || requiredInputs.some((id) => inputIds.filter((value) => value === id).length !== 1) || candidate.input_bindings.some(({ input_id, requirement }) => input_id !== requirement)) add("INPUT_BINDING_CONFLICT", "/input_bindings", "S2.3 and S4 bindings are required exactly once");
  candidate.input_bindings.forEach((binding, index) => { if (!digestPattern.test(binding.source_digest)) add("SOURCE_DIGEST_INVALID", `/input_bindings/${index}/source_digest`, "Source digest is invalid"); });
  const s23Binding = candidate.input_bindings.find(({ input_id }) => input_id === "S2.3");
  if (s23Binding?.source_digest !== plan.candidate_digest) add("INPUT_BINDING_CONFLICT", "/input_bindings", "S2.3 binding digest differs from the revalidated plan");
  if (context !== undefined) {
    const authorities = Array.isArray(context.input_authorities) ? context.input_authorities : [];
    const authorityIds = authorities.map(({ input_id }) => input_id);
    const authorityShapeValid = authorities.length === 2 && new Set(authorityIds).size === 2 && requiredInputs.every((id) => authorityIds.filter((value) => value === id).length === 1);
    const authorityMatches = authorityShapeValid && candidate.input_bindings.every((binding) => {
      const authority = authorities.find(({ input_id }) => input_id === binding.input_id);
      return authority?.source_ref === binding.source_ref && authority.source_digest === binding.source_digest && digestPattern.test(authority.source_digest);
    });
    if (!authorityMatches) add("INPUT_AUTHORITY_CONFLICT", "/context/input_authorities", "Input bindings differ from trusted S2.3 and S4 authorities");
  }

  const proofIds = candidate.dependency_proofs.map(({ dependency_id }) => dependency_id);
  for (const dependency of milestone.depends_on) if (!proofIds.includes(dependency)) add("DEPENDENCY_PROOF_MISSING", "/dependency_proofs", "Required dependency proof is missing");
  if (new Set(proofIds).size !== proofIds.length || proofIds.some((id) => !milestone.depends_on.includes(id)) || candidate.dependency_proofs.some(({ evidence_digest }) => !digestPattern.test(evidence_digest))) add("DEPENDENCY_PROOF_CONFLICT", "/dependency_proofs", "Dependency proofs conflict with the selected milestone");
  candidate.dependency_proofs.forEach((proof, index) => { if (proof.status !== "satisfied") add("DEPENDENCY_UNSATISFIED", `/dependency_proofs/${index}/status`, "Dependency is not satisfied"); });
  if (context !== undefined) {
    const authorities = Array.isArray(context.accepted_dependency_results) ? context.accepted_dependency_results : [];
    const authorityIds = authorities.map(({ dependency_id }) => dependency_id);
    let valid = authorities.length === milestone.depends_on.length && new Set(authorityIds).size === authorityIds.length && milestone.depends_on.every((id) => authorityIds.filter((value) => value === id).length === 1);
    for (const authority of authorities) {
      const dependency = plan.milestones.find(({ milestone_id }) => milestone_id === authority.dependency_id);
      const proof = candidate.dependency_proofs.find(({ dependency_id }) => dependency_id === authority.dependency_id);
      if (dependency === undefined || proof === undefined || authority.repository_id !== plan.project.repository_id || authority.baseline_oid !== plan.project.formal_baseline || authority.route_generation !== 1 || authority.stage_id !== expectedStage(dependency) || authority.plan_id !== planIdFor(plan) || authority.plan_generation !== 1 || authority.task_id !== authority.dependency_id || !Number.isInteger(authority.task_attempt) || authority.task_attempt < 1 || authority.status !== "accepted" || authority.result_ref !== proof.evidence_ref || authority.result_digest !== proof.evidence_digest || !digestPattern.test(authority.result_digest)) valid = false;
    }
    if (!valid) add("DEPENDENCY_AUTHORITY_CONFLICT", "/context/accepted_dependency_results", "Dependency proofs differ from trusted accepted Result identities");
  }

  const allPaths = [...candidate.scope.allowed_paths, ...candidate.scope.forbidden_paths];
  allPaths.forEach((path, index) => { if (!isNormalizedPath(path)) add("PATH_NOT_NORMALIZED", `/scope/paths/${index}`, "Path is not normalized"); });
  for (let index = 0; index < candidate.scope.allowed_paths.length; index += 1) {
    const path = candidate.scope.allowed_paths[index]!;
    if (isControlPath(path)) add("CONTROL_PATH_FORBIDDEN", `/scope/allowed_paths/${index}`, "Control path cannot be modified");
    if (overlapsSignedTruth(path)) add("SIGNED_PATH_FORBIDDEN", `/scope/allowed_paths/${index}`, "Signed product, design, architecture and plan truth cannot be modified");
    for (let other = index + 1; other < candidate.scope.allowed_paths.length; other += 1) if (pathsOverlap(path, candidate.scope.allowed_paths[other]!)) add("PATH_SCOPE_CONFLICT", "/scope/allowed_paths", "Allowed paths overlap");
  }
  for (let index = 0; index < candidate.scope.forbidden_paths.length; index += 1) for (let other = index + 1; other < candidate.scope.forbidden_paths.length; other += 1) if (pathsOverlap(candidate.scope.forbidden_paths[index]!, candidate.scope.forbidden_paths[other]!)) add("PATH_SCOPE_CONFLICT", "/scope/forbidden_paths", "Forbidden paths overlap");
  for (const allowed of candidate.scope.allowed_paths) for (const forbidden of candidate.scope.forbidden_paths) if (pathsOverlap(allowed, forbidden)) add("PATH_SCOPE_CONFLICT", "/scope", "Allowed and forbidden paths overlap");
  if (candidate.scope.modifies_signed_upstream || candidate.scope.change_request_ref !== null) add("SIGNED_UPSTREAM_FORBIDDEN", "/scope", "S2.4 cannot modify signed upstream truth or carry a Change Request");

  const owner = plan.major_milestone_plan.milestones.find(({ milestone_id }) => milestone_id === milestone.major_milestone_id);
  const expectedAcceptances = owner?.acceptances.map(({ acceptance_type }) => acceptance_type) ?? [];
  if (!sameStrings(candidate.verification.acceptance_types, expectedAcceptances)) add("ACCEPTANCE_PROFILE_CONFLICT", "/verification/acceptance_types", "Acceptance types differ from the accepted Profile");
  const checkTypes = candidate.verification.checks.map(({ check_type }) => check_type);
  if (new Set(candidate.verification.checks.map(({ check_id }) => check_id)).size !== candidate.verification.checks.length || requiredChecks.some((type) => checkTypes.filter((value) => value === type).length !== 1)) add("CHECK_COVERAGE_MISSING", "/verification/checks", "Positive, negative, blocked and recovery checks are required exactly once");
  const created = Date.parse(candidate.validity.created_at); const expires = Date.parse(candidate.validity.expires_at);
  const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const canonicalDates = Number.isFinite(created) && Number.isFinite(expires) && utcPattern.test(candidate.validity.created_at) && utcPattern.test(candidate.validity.expires_at);
  if (!canonicalDates || expires <= created || expires - created > 86_400_000) add("INVALID_VALIDITY_WINDOW", "/validity", "Validity must be canonical UTC, increasing and no longer than 24 hours");
  else if (now !== undefined && now < created) add("PACKET_NOT_YET_VALID", "/validity/created_at", "Packet validity window has not started");
  else if (now !== undefined && now >= expires) add("PACKET_EXPIRED", "/validity/expires_at", "Packet validity window has expired");
  return reasons;
}

function buildPacket(candidate: ExecutionPacketCandidate): ExecutionPacket {
  const candidateDigest = digestJson(candidate);
  const packetBody = {
    schema_version: "1.0" as const, packet_id: `ep-${candidateDigest.slice("sha256:".length, 31)}`,
    ...candidate.control_identity, milestone_id: candidate.target.milestone_id, objective: candidate.target.objective, why_now: candidate.target.why_now,
    source_refs: candidate.input_bindings.map(({ input_id, source_ref }) => ({ source_id: input_id, ref: source_ref })),
    input_digests: candidate.input_bindings.map(({ input_id, source_digest }) => ({ source_id: input_id, digest: source_digest })),
    dependency_proofs: candidate.dependency_proofs,
    allowed_paths: candidate.scope.allowed_paths, forbidden_paths: candidate.scope.forbidden_paths, non_goals: candidate.scope.non_goals,
    modifies_signed_upstream: candidate.scope.modifies_signed_upstream, change_request_ref: candidate.scope.change_request_ref,
    required_outputs: candidate.output_contract.required_outputs, candidate_form: candidate.output_contract.candidate_form,
    checks: candidate.verification.checks, acceptance_types: candidate.verification.acceptance_types, failure_rules: candidate.verification.failure_rules,
    sandbox_mode: candidate.execution.sandbox_mode, host_mode: candidate.execution.host_mode, timeout_policy: candidate.execution.timeout_policy,
    result_schema_version: candidate.reporting.result_schema_version, evidence_requirements: candidate.reporting.evidence_requirements, escalation_rules: candidate.reporting.escalation_rules,
    created_at: candidate.validity.created_at, expires_at: candidate.validity.expires_at,
  };
  const packetDigest = digestJson(packetBody);
  const dedupKey = digestJson({ repository_id: candidate.control_identity.repository_id, plan_id: candidate.control_identity.plan_id, plan_generation: candidate.control_identity.plan_generation, task_id: candidate.control_identity.task_id, task_attempt: candidate.control_identity.task_attempt, packet_digest: packetDigest, route_generation: candidate.control_identity.route_generation });
  return snapshotJsonValue({ ...packetBody, packet_digest: packetDigest, dedup_key: dedupKey }) as unknown as ExecutionPacket;
}

function buildResult(candidate: ExecutionPacketCandidate): ExecutionPacketResult {
  const packet = buildPacket(candidate);
  return snapshotJsonValue({
    schema_version: "1.0", record_type: "execution-packet-validation", status: "packet-valid-only", candidate,
    execution_packet: packet, candidate_digest: digestJson(candidate),
    summary: { field_group_count: 10, source_ref_count: packet.source_refs.length, dependency_proof_count: packet.dependency_proofs.length, check_count: packet.checks.length, side_effects: "none" },
  }) as unknown as ExecutionPacketResult;
}

export function evaluateExecutionPacket(value: unknown, context?: ExecutionPacketEvaluationContext): ExecutionPacketResult {
  const snapshot = safeValue(value);
  if (!isPlainRecord(snapshot)) reject("INVALID_EXECUTION_PACKET", "$", "Candidate must be an object");
  if (!validateCandidate(snapshot)) throw new ExecutionPacketError(schemaReasons(validateCandidate.errors ?? []));
  const candidate = snapshot as unknown as ExecutionPacketCandidate;
  assertEvaluationContext(context);
  const now = readValidationClock(context);
  const plan = parseUpstream(candidate);
  const selected = plan.milestones.filter(({ milestone_id }) => milestone_id === candidate.selected_milestone_id);
  if (selected.length === 0) reject("MILESTONE_NOT_FOUND", "/selected_milestone_id", "Selected milestone is absent");
  if (selected.length !== 1) reject("MILESTONE_NOT_UNIQUE", "/selected_milestone_id", "Selected milestone is not unique");
  const reasons = semanticReasons(candidate, plan, selected[0]!, context, now);
  if (reasons.length > 0) throw new ExecutionPacketError(reasons);
  return buildResult(candidate);
}

const RESULT_FIELDS = ["schema_version", "record_type", "status", "candidate", "execution_packet", "candidate_digest", "summary"] as const;

export function parseExecutionPacketResult(value: unknown, context?: ExecutionPacketEvaluationContext): ExecutionPacketResult {
  const snapshot = safeValue(value, true);
  if (!isPlainRecord(snapshot)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result must be an object");
  assertEvaluationContext(context);
  const fields = Object.keys(snapshot).sort(); const expected = [...RESULT_FIELDS].sort();
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index]) || snapshot.record_type !== "execution-packet-validation" || snapshot.status !== "packet-valid-only") reject("RESULT_INTEGRITY_MISMATCH", "$", "Result fields or status differ");
  if (!isPlainRecord(snapshot.execution_packet)) reject("RESULT_INTEGRITY_MISMATCH", "/execution_packet", "Packet is invalid");
  const packet = snapshot.execution_packet;
  const { packet_digest: packetDigest, dedup_key: dedupKey, ...packetBody } = packet;
  if (typeof packetDigest !== "string" || digestJson(packetBody) !== packetDigest) reject("PACKET_DIGEST_MISMATCH", "/execution_packet/packet_digest", "Packet digest differs");
  const dedupProjection = { repository_id: packet.repository_id, plan_id: packet.plan_id, plan_generation: packet.plan_generation, task_id: packet.task_id, task_attempt: packet.task_attempt, packet_digest: packetDigest, route_generation: packet.route_generation };
  if (typeof dedupKey !== "string" || digestJson(dedupProjection) !== dedupKey) reject("DEDUP_KEY_MISMATCH", "/execution_packet/dedup_key", "Dedup key differs");
  let restored: ExecutionPacketResult;
  try {
    if (!isPlainRecord(snapshot.candidate) || !validateCandidate(snapshot.candidate)) reject("RESULT_INTEGRITY_MISMATCH", "/candidate", "Result candidate schema differs");
    const candidate = snapshot.candidate as unknown as ExecutionPacketCandidate;
    const plan = parseUpstream(candidate);
    const selected = plan.milestones.filter(({ milestone_id }) => milestone_id === candidate.selected_milestone_id);
    if (selected.length !== 1 || semanticReasons(candidate, plan, selected[0]!, context).length > 0) reject("RESULT_INTEGRITY_MISMATCH", "/candidate", "Result candidate semantics or authority differ");
    restored = buildResult(candidate);
  } catch { reject("RESULT_INTEGRITY_MISMATCH", "/candidate", "Result candidate cannot be restored"); }
  if (canonicalizeJson(snapshot.summary) !== canonicalizeJson(restored.summary)) reject("SUMMARY_MISMATCH", "/summary", "Result summary differs");
  if (canonicalizeJson(snapshot) !== canonicalizeJson(restored)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result content differs from deterministic reconstruction");
  return restored;
}
