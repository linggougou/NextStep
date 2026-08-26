import { Ajv, type ValidateFunction } from "ajv";

import scalabilityBudgetSchema from "../../schemas/v1/scalability-budget.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { assertSupportedContractVersion } from "./contract-version.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { isPlainRecord } from "./value-guards.ts";

export const SCALABILITY_BUDGET_METRICS = [
  "control_cas_per_attempt",
  "immutable_evidence_files_per_attempt",
  "user_visible_confirmations_per_attempt",
  "consecutive_non_pass_attempts_per_milestone",
  "active_plan_generations_per_milestone",
  "active_independent_tasks_per_packet",
] as const;

export type ScalabilityBudgetMetric = (typeof SCALABILITY_BUDGET_METRICS)[number];
export type ScalabilityBudgetConclusion =
  | "within-budget"
  | "exception-required"
  | "unmeasurable";

export const SCALABILITY_BUDGET_LIMITS = Object.freeze({
  control_cas_per_attempt: 12,
  immutable_evidence_files_per_attempt: 24,
  user_visible_confirmations_per_attempt: 2,
  consecutive_non_pass_attempts_per_milestone: 2,
  active_plan_generations_per_milestone: 1,
  active_independent_tasks_per_packet: 5,
} as const satisfies Readonly<Record<ScalabilityBudgetMetric, number>>);

export interface ScalabilityBudgetInput {
  readonly schema_version: "1.0";
  readonly measurements: Readonly<Record<ScalabilityBudgetMetric, number | null>>;
}

export interface ScalabilityBudgetResult {
  readonly schema_version: "1.0";
  readonly conclusion: ScalabilityBudgetConclusion;
  readonly limits: Readonly<Record<ScalabilityBudgetMetric, number>>;
  readonly exceeded_metrics: readonly ScalabilityBudgetMetric[];
  readonly unmeasurable_metrics: readonly ScalabilityBudgetMetric[];
  readonly input_digest: Sha256Digest;
}

export type ScalabilityBudgetErrorCode = "INVALID_SCALABILITY_BUDGET";

export class ScalabilityBudgetError extends Error {
  readonly code: ScalabilityBudgetErrorCode;

  constructor(message: string) {
    super(message);
    this.code = "INVALID_SCALABILITY_BUDGET";
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateInput: ValidateFunction = ajv.compile(scalabilityBudgetSchema);

function fail(message: string): never {
  throw new ScalabilityBudgetError(message);
}

export function parseScalabilityBudgetInput(value: unknown): ScalabilityBudgetInput {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("Scalability budget input must contain only finite JSON values");
  }
  if (!isPlainRecord(snapshot)) {
    fail("Scalability budget input must be a plain object");
  }
  try {
    assertSupportedContractVersion(snapshot.schema_version);
  } catch {
    fail("Unsupported scalability budget contract version");
  }
  if (!validateInput(snapshot)) {
    fail(`Scalability budget input failed schema validation: ${ajv.errorsText(validateInput.errors, { separator: "; " })}`);
  }
  return snapshot as unknown as ScalabilityBudgetInput;
}

export function evaluateScalabilityBudget(value: unknown): ScalabilityBudgetResult {
  const input = parseScalabilityBudgetInput(value);
  const exceeded: ScalabilityBudgetMetric[] = [];
  const unmeasurable: ScalabilityBudgetMetric[] = [];

  for (const metric of SCALABILITY_BUDGET_METRICS) {
    const measurement = input.measurements[metric];
    if (measurement === null) {
      unmeasurable.push(metric);
    } else if (measurement > SCALABILITY_BUDGET_LIMITS[metric]) {
      exceeded.push(metric);
    }
  }

  const conclusion: ScalabilityBudgetConclusion = unmeasurable.length > 0
    ? "unmeasurable"
    : exceeded.length > 0
      ? "exception-required"
      : "within-budget";

  return Object.freeze({
    schema_version: "1.0" as const,
    conclusion,
    limits: SCALABILITY_BUDGET_LIMITS,
    exceeded_metrics: Object.freeze(exceeded),
    unmeasurable_metrics: Object.freeze(unmeasurable),
    input_digest: digestJson(input),
  });
}
