import { Ajv, type ValidateFunction } from "ajv";

import projectValueRunSchema from "../../schemas/v1/project-value-run.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export type ProjectValueValidationErrorCode = "INVALID_INPUT" | "SENSITIVE_INPUT_REJECTED" | "DUPLICATE_RUN_ID";
export type ProjectValueExclusionReason = "duplicate-project-identity" | "synthetic" | "retrospective" | "nextstep-self" | "nextstep-derived" | "used-nextstep-false" | "missing-user-authorization" | "missing-user-confirmation" | "evidence-binding-mismatch";
type Outcome = "completed" | "abandoned" | "blocked";

export interface ProjectValueRun {
  readonly schema_version: "1.0"; readonly run_id: string; readonly run_kind: "real" | "synthetic";
  readonly collection_mode: "prospective" | "retrospective"; readonly project_origin: "external-user-project" | "nextstep-self" | "nextstep-derived";
  readonly project_identity: Sha256Digest; readonly evidence_digest: Sha256Digest; readonly evidence_binding_digest: Sha256Digest;
  readonly user_authorization_ref: string | null; readonly started_at: string; readonly ended_at: string; readonly used_nextstep: boolean;
  readonly metrics: { readonly time_to_first_frozen_requirement_seconds: number | null; readonly user_intervention_count: number; readonly false_block_count: number | null; readonly false_block_evidence_refs: readonly string[]; readonly recovery_seconds: readonly number[]; readonly outcome: Outcome };
  readonly user_confirmation: { readonly confirmed: boolean; readonly confirmation_ref: string | null };
}
export interface ProjectValueInput { readonly schema_version: "1.0"; readonly runs: readonly ProjectValueRun[] }
export interface ProjectValueAggregate {
  readonly schema_version: "1.0"; readonly total_records: number; readonly synthetic_records: number; readonly qualified_real_runs: number; readonly target_qualified_real_runs: 3; readonly duplicate_project_records: number;
  readonly excluded_records: readonly { readonly run_id: string; readonly reason_code: ProjectValueExclusionReason }[];
  readonly medians: { readonly time_to_first_frozen_requirement_seconds: number | null; readonly user_intervention_count: number | null; readonly adjudicated_false_block_count: number | null; readonly recovery_seconds: number | null };
  readonly outcomes: Readonly<Record<Outcome, number>>; readonly validation_state: "real-runs-insufficient" | "three-real-runs-observed"; readonly evidence_digest: Sha256Digest;
}

export class ProjectValueValidationError extends Error {
  constructor(readonly code: ProjectValueValidationErrorCode, message: string) { super(message); }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateInput: ValidateFunction = ajv.compile(projectValueRunSchema);
const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function fail(code: ProjectValueValidationErrorCode, message: string): never { throw new ProjectValueValidationError(code, message); }
function compareIds(left: ProjectValueRun, right: ProjectValueRun): number { return left.run_id < right.run_id ? -1 : left.run_id > right.run_id ? 1 : 0; }
function assertNoForbiddenFields(value: JsonValue): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach(assertNoForbiddenFields); return; }
  for (const [field, child] of Object.entries(value)) {
    const normalized = field.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2").replaceAll(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    if (field !== "user_authorization_ref" && /(?:^|_)(?:api_?key|authorization|business_content|chat_transcript|conversation|cookie|credential|full_chat|password|private_key|secret|session|source_code|token)s?(?:_|$)/.test(normalized)) throw new Error("Sensitive field");
    assertNoForbiddenFields(child);
  }
}
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : sorted[middle - 1]! / 2 + sorted[middle]! / 2;
}
function timestamp(value: string): number {
  const match = ISO_TIME.exec(value);
  if (match === null) return Number.NaN;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day); calendar.setUTCHours(hour, minute, second, 0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) return Number.NaN;
  return Date.parse(value);
}

export function parseProjectValueInput(value: unknown): ProjectValueInput {
  let snapshot: JsonValue;
  try { snapshot = snapshotJsonValue(value); } catch { fail("INVALID_INPUT", "Input must be finite JSON data"); }
  try { assertNoForbiddenFields(snapshot); assertNoSensitiveContent(snapshot); } catch { fail("SENSITIVE_INPUT_REJECTED", "Sensitive input is forbidden"); }
  if (!isPlainRecord(snapshot) || !validateInput(snapshot)) fail("INVALID_INPUT", "Input does not match the project value contract");
  const input = snapshot as unknown as ProjectValueInput;
  for (const run of input.runs) {
    const started = timestamp(run.started_at); const ended = timestamp(run.ended_at);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) fail("INVALID_INPUT", "Run timestamp order is invalid");
  }
  const seen = new Set<string>();
  for (const run of input.runs) { if (seen.has(run.run_id)) fail("DUPLICATE_RUN_ID", "run_id values must be unique"); seen.add(run.run_id); }
  return input;
}

function exclusion(run: ProjectValueRun, duplicateIdentities: ReadonlySet<string>): ProjectValueExclusionReason | null {
  if (duplicateIdentities.has(run.project_identity)) return "duplicate-project-identity";
  if (run.run_kind === "synthetic") return "synthetic";
  if (run.collection_mode === "retrospective") return "retrospective";
  if (run.project_origin === "nextstep-self") return "nextstep-self";
  if (run.project_origin === "nextstep-derived") return "nextstep-derived";
  if (!run.used_nextstep) return "used-nextstep-false";
  if (run.user_authorization_ref === null) return "missing-user-authorization";
  if (!run.user_confirmation.confirmed || run.user_confirmation.confirmation_ref === null) return "missing-user-confirmation";
  const binding = digestJson({ run_id: run.run_id, project_identity: run.project_identity, evidence_digest: run.evidence_digest });
  return run.evidence_binding_digest === binding ? null : "evidence-binding-mismatch";
}

export function evaluateProjectValueRuns(value: unknown): ProjectValueAggregate {
  const input = parseProjectValueInput(value);
  const runs = [...input.runs].sort(compareIds);
  const identityCounts = new Map<string, number>();
  for (const run of runs) identityCounts.set(run.project_identity, (identityCounts.get(run.project_identity) ?? 0) + 1);
  const duplicateIdentities = new Set([...identityCounts].filter(([, count]) => count > 1).map(([identity]) => identity));
  const excluded: { run_id: string; reason_code: ProjectValueExclusionReason }[] = [];
  const qualified: ProjectValueRun[] = [];
  for (const run of runs) { const reason = exclusion(run, duplicateIdentities); reason === null ? qualified.push(run) : excluded.push({ run_id: run.run_id, reason_code: reason }); }
  const outcomes: Record<Outcome, number> = { completed: 0, abandoned: 0, blocked: 0 };
  for (const run of qualified) outcomes[run.metrics.outcome] += 1;
  const medians = {
    time_to_first_frozen_requirement_seconds: median(qualified.flatMap((run) => run.metrics.time_to_first_frozen_requirement_seconds === null ? [] : [run.metrics.time_to_first_frozen_requirement_seconds])),
    user_intervention_count: median(qualified.map((run) => run.metrics.user_intervention_count)),
    adjudicated_false_block_count: median(qualified.flatMap((run) => run.metrics.false_block_count === null ? [] : [run.metrics.false_block_count])),
    recovery_seconds: median(qualified.flatMap((run) => run.metrics.recovery_seconds)),
  };
  return Object.freeze({ schema_version: "1.0", total_records: runs.length, synthetic_records: runs.filter((run) => run.run_kind === "synthetic").length, qualified_real_runs: qualified.length, target_qualified_real_runs: 3, duplicate_project_records: runs.filter((run) => duplicateIdentities.has(run.project_identity)).length, excluded_records: Object.freeze(excluded), medians: Object.freeze(medians), outcomes: Object.freeze(outcomes), validation_state: qualified.length >= 3 ? "three-real-runs-observed" : "real-runs-insufficient", evidence_digest: digestJson({ runs }) });
}
