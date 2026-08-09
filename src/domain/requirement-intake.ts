import { Ajv, type ValidateFunction } from "ajv";

import requirementIntakeSchema from "../../schemas/v1/requirement-intake.schema.json" with { type: "json" };
import { snapshotJsonValue } from "./canonical-json.ts";
import { assertSupportedContractVersion } from "./contract-version.ts";
import { assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

export type RequirementIntakeErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUIREMENT_INTAKE"
  | "SENSITIVE_FIELD_DETECTED"
  | "DEVELOPMENT_TASK_EMBEDDED";

export class RequirementIntakeError extends Error {
  readonly code: RequirementIntakeErrorCode;

  constructor(code: RequirementIntakeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface EvidenceSpan {
  readonly start: number;
  readonly end: number;
  readonly quote: string;
}

interface IdentifiedIntentSummary {
  readonly status: "identified";
  readonly source: "quoted" | "derived";
  readonly value: string;
  readonly evidence: readonly EvidenceSpan[];
}

interface MissingIntentSummary {
  readonly status: "missing";
  readonly reason: string;
  readonly clarification_question: string;
}

interface IdentifiedFact {
  readonly value: string;
  readonly evidence: readonly EvidenceSpan[];
}

interface IdentifiedDimension {
  readonly status: "identified";
  readonly items: readonly IdentifiedFact[];
}

interface MissingDimension {
  readonly status: "missing";
  readonly items: readonly [];
  readonly clarification_question: string;
}

type RequirementDimension = IdentifiedDimension | MissingDimension;

export interface RequirementIntake {
  readonly schema_version: "1.0";
  readonly candidate: {
    readonly raw_expression: string;
    readonly intent_summary: IdentifiedIntentSummary | MissingIntentSummary;
    readonly goals: RequirementDimension;
    readonly scenarios: RequirementDimension;
    readonly constraints: RequirementDimension;
    readonly expected_outputs: RequirementDimension;
    readonly non_goal_gaps: RequirementDimension;
    readonly clarification_gaps: RequirementDimension;
  };
}

const DIMENSIONS = [
  ["goals", "目标"],
  ["scenarios", "场景"],
  ["constraints", "约束"],
  ["expected_outputs", "期望输出"],
  ["non_goal_gaps", "非目标缺口"],
  ["clarification_gaps", "待澄清缺口"],
] as const;

type DimensionField = (typeof DIMENSIONS)[number][0];

export interface RequirementIntakeUserOutput {
  readonly status: "candidate-only";
  readonly raw_expression: string;
  readonly candidate_summary: string;
  readonly identified_facts: readonly {
    readonly field: "intent_summary" | DimensionField;
    readonly label: string;
    readonly value: string;
    readonly source: "quoted" | "derived";
    readonly evidence: readonly EvidenceSpan[];
  }[];
  readonly missing_information: readonly {
    readonly field: "intent_summary" | DimensionField;
    readonly label: string;
    readonly clarification_question: string;
  }[];
  readonly clarification_questions: readonly string[];
  readonly next_step: string;
}

const DEVELOPMENT_TASK_FIELDS = new Set([
  "development_task",
  "development_tasks",
  "implementation_task",
  "implementation_tasks",
  "coding_task",
  "coding_tasks",
  "developer_task",
  "developer_tasks",
]);

const ajv = new Ajv({
  strict: true,
  allErrors: true,
  allowUnionTypes: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  ownProperties: true,
});

const validateRequirementIntake: ValidateFunction<RequirementIntake> =
  ajv.compile<RequirementIntake>(requirementIntakeSchema);

function findDevelopmentTaskField(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findDevelopmentTaskField(item);
      if (nested !== undefined) {
        return nested;
      }
    }
    return undefined;
  }

  if (!isPlainRecord(value)) {
    return undefined;
  }

  for (const [field, nestedValue] of Object.entries(value)) {
    if (DEVELOPMENT_TASK_FIELDS.has(field)) {
      return field;
    }
    const nested = findDevelopmentTaskField(nestedValue);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function formatSchemaErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: "; " });
}

function assertRequirementRoot(value: unknown): asserts value is UnknownRecord {
  if (
    !isPlainRecord(value) ||
    !Object.hasOwn(value, "schema_version") ||
    !Object.hasOwn(value, "candidate")
  ) {
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      "Requirement intake must contain its own schema_version and candidate",
    );
  }
}

function assertEvidenceSpan(rawExpression: string, evidence: EvidenceSpan): void {
  if (
    !Number.isSafeInteger(evidence.start) ||
    !Number.isSafeInteger(evidence.end) ||
    evidence.start < 0 ||
    evidence.end <= evidence.start ||
    evidence.end > rawExpression.length ||
    rawExpression.slice(evidence.start, evidence.end) !== evidence.quote
  ) {
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      "Requirement evidence position and quote must match raw_expression",
    );
  }
}

function assertEvidenceSemantics(intake: RequirementIntake): void {
  const { candidate } = intake;
  const intent = candidate.intent_summary;
  if (intent.status === "identified") {
    for (const evidence of intent.evidence) {
      assertEvidenceSpan(candidate.raw_expression, evidence);
    }
    if (
      intent.source === "quoted" &&
      (intent.evidence.length !== 1 || intent.value !== intent.evidence[0]?.quote)
    ) {
      throw new RequirementIntakeError(
        "INVALID_REQUIREMENT_INTAKE",
        "Quoted intent must exactly match its source evidence",
      );
    }
  }

  for (const [field] of DIMENSIONS) {
    const dimension = candidate[field];
    if (dimension.status === "identified") {
      for (const item of dimension.items) {
        const evidence = item.evidence[0];
        if (item.evidence.length !== 1 || evidence === undefined) {
          throw new RequirementIntakeError(
            "INVALID_REQUIREMENT_INTAKE",
            "Identified facts require exactly one source evidence span",
          );
        }
        assertEvidenceSpan(candidate.raw_expression, evidence);
        if (item.value !== evidence.quote) {
          throw new RequirementIntakeError(
            "INVALID_REQUIREMENT_INTAKE",
            "Identified facts must exactly match source evidence",
          );
        }
      }
    }
  }
}

export function parseRequirementIntake(value: unknown): RequirementIntake {
  let snapshot: ReturnType<typeof snapshotJsonValue>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch (error) {
    if (error instanceof Error && /sensitive/i.test(error.message)) {
      throw new RequirementIntakeError(
        "SENSITIVE_FIELD_DETECTED",
        "Sensitive field detected in requirement intake",
      );
    }
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      "Requirement intake must contain only JSON values",
    );
  }

  assertRequirementRoot(snapshot);
  const developmentTaskField = findDevelopmentTaskField(snapshot);
  if (developmentTaskField !== undefined) {
    throw new RequirementIntakeError(
      "DEVELOPMENT_TASK_EMBEDDED",
      "Requirement intake must not contain development tasks",
    );
  }

  try {
    assertSupportedContractVersion(snapshot.schema_version);
  } catch {
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      "Unsupported requirement intake version",
    );
  }

  if (!validateRequirementIntake(snapshot)) {
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      `Invalid requirement intake schema: ${formatSchemaErrors(validateRequirementIntake)}`,
    );
  }

  assertEvidenceSemantics(snapshot);
  return snapshot;
}

export function buildRequirementIntakeUserOutput(value: unknown): RequirementIntakeUserOutput {
  const intake = parseRequirementIntake(value);
  const { candidate } = intake;
  const identifiedFacts: RequirementIntakeUserOutput["identified_facts"][number][] = [];
  const missingInformation: RequirementIntakeUserOutput["missing_information"][number][] = [];

  if (candidate.intent_summary.status === "identified") {
    identifiedFacts.push({
      field: "intent_summary",
      label: "意图摘要",
      value: candidate.intent_summary.value,
      source: candidate.intent_summary.source,
      evidence: candidate.intent_summary.evidence,
    });
  } else {
    missingInformation.push({
      field: "intent_summary",
      label: "意图摘要",
      clarification_question: candidate.intent_summary.clarification_question,
    });
  }

  for (const [field, label] of DIMENSIONS) {
    const dimension = candidate[field];
    if (dimension.status === "identified") {
      for (const item of dimension.items) {
        identifiedFacts.push({
          field,
          label,
          value: item.value,
          source: "quoted",
          evidence: item.evidence,
        });
      }
    } else {
      missingInformation.push({
        field,
        label,
        clarification_question: dimension.clarification_question,
      });
    }
  }

  return snapshotJsonValue({
    status: "candidate-only",
    raw_expression: candidate.raw_expression,
    candidate_summary: candidate.intent_summary.status === "identified"
      ? candidate.intent_summary.value
      : `原始表达：${candidate.raw_expression}`,
    identified_facts: identifiedFacts,
    missing_information: missingInformation,
    clarification_questions: missingInformation.map((item) => item.clarification_question),
    next_step: "请回答待澄清问题；当前候选不会冻结、不会写入，也不会生成开发任务。",
  }) as unknown as RequirementIntakeUserOutput;
}
