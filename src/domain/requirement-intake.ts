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

interface IdentifiedIntentSummary {
  readonly status: "identified";
  readonly value: string;
}

interface MissingIntentSummary {
  readonly status: "missing";
  readonly reason: string;
}

interface IdentifiedDimension {
  readonly status: "identified";
  readonly items: readonly string[];
}

interface MissingDimension {
  readonly status: "missing";
  readonly items: readonly [];
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

  return snapshot;
}
