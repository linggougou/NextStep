import { Ajv, type ValidateFunction } from "ajv";

import requirementSetSchema from "../../schemas/v1/requirement-set.schema.json" with { type: "json" };
import { snapshotJsonValue } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, projectForDigest, type Sha256Digest } from "./content-digest.ts";
import { parseRequirementIntake, type RequirementIntake } from "./requirement-intake.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

export const REQUIREMENT_FIELDS = [
  "intent_summary",
  "goals",
  "scenarios",
  "constraints",
  "expected_outputs",
  "non_goal_gaps",
  "clarification_gaps",
] as const;

export type RequirementField = (typeof REQUIREMENT_FIELDS)[number];
export type RequirementItemStatus = "identified" | "none" | "unresolved" | "rejected" | "deferred";

export interface RequirementSetItem {
  readonly field: RequirementField;
  readonly status: RequirementItemStatus;
  readonly values: readonly string[];
  readonly source: "candidate" | "user" | "unresolved";
}

export interface RequirementSet {
  readonly schema_version: "1.0";
  readonly requirement_set_id: string;
  readonly project: {
    readonly repository_id: Sha256Digest;
    readonly formal_baseline: string;
  };
  readonly version: number;
  readonly status: "incomplete" | "ready-for-confirmation";
  readonly source_candidate_digest: Sha256Digest;
  readonly items: readonly RequirementSetItem[];
  readonly summary: string;
  readonly content_digest: Sha256Digest;
}

export interface RequirementResolution {
  readonly field: RequirementField;
  readonly status: Exclude<RequirementItemStatus, "unresolved">;
  readonly values: readonly string[];
}

export interface RequirementSetInput {
  readonly schema_version: "1.0";
  readonly requirement_set_id: string;
  readonly project: { readonly repository_id: string; readonly formal_baseline: string };
  readonly version: number;
  readonly candidate: unknown;
  readonly user_resolutions: readonly unknown[];
}

export type RequirementSetErrorCode = "INVALID_REQUIREMENT_SET" | "SENSITIVE_CONTENT_DETECTED";

export class RequirementSetError extends Error {
  readonly code: RequirementSetErrorCode;

  constructor(code: RequirementSetErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({
  strict: true,
  allErrors: true,
  allowUnionTypes: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  ownProperties: true,
});
const validateRequirementSet: ValidateFunction<RequirementSet> = ajv.compile<RequirementSet>(requirementSetSchema);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OID_PATTERN = /^[a-f0-9]{40}$/;

function invalid(message: string): never {
  throw new RequirementSetError("INVALID_REQUIREMENT_SET", message);
}

function formatSchemaErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: "; " });
}

function assertSafeContent(value: unknown): void {
  try {
    assertNoSensitiveContent(value);
  } catch {
    throw new RequirementSetError("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in Requirement Set");
  }
}

function assertProject(value: unknown): asserts value is RequirementSet["project"] {
  if (
    !isPlainRecord(value) ||
    typeof value.repository_id !== "string" ||
    !SHA256_PATTERN.test(value.repository_id) ||
    typeof value.formal_baseline !== "string" ||
    !OID_PATTERN.test(value.formal_baseline)
  ) {
    invalid("Requirement Set project identity is invalid");
  }
}

function valuesForCandidateField(intake: RequirementIntake, field: RequirementField): readonly string[] | undefined {
  if (field === "intent_summary") {
    return intake.candidate.intent_summary.status === "identified"
      ? [intake.candidate.intent_summary.value]
      : undefined;
  }
  const dimension = intake.candidate[field];
  return dimension.status === "identified" ? dimension.items.map((item) => item.value) : undefined;
}

function parseResolution(value: unknown): RequirementResolution {
  const snapshot = snapshotJsonValue(value);
  if (
    !isPlainRecord(snapshot) ||
    typeof snapshot.field !== "string" ||
    !REQUIREMENT_FIELDS.includes(snapshot.field as RequirementField) ||
    typeof snapshot.status !== "string" ||
    !["identified", "none", "rejected", "deferred"].includes(snapshot.status) ||
    !Array.isArray(snapshot.values) ||
    snapshot.values.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    invalid("Invalid user requirement resolution");
  }

  if ((snapshot.status === "identified") !== (snapshot.values.length > 0)) {
    invalid("Identified resolutions require values and other resolutions must be empty");
  }

  return snapshot as unknown as RequirementResolution;
}

function buildSummary(items: readonly RequirementSetItem[]): string {
  return items.map((item) => `${item.field}|${item.status}|${item.values.join("\u001f")}`).join("\n");
}

function assertItemSemantics(items: readonly RequirementSetItem[]): void {
  if (items.length !== REQUIREMENT_FIELDS.length) {
    invalid("Requirement Set must contain every requirement field exactly once");
  }
  const fields = new Set<RequirementField>();
  for (const item of items) {
    if (!REQUIREMENT_FIELDS.includes(item.field) || fields.has(item.field)) {
      invalid("Requirement Set fields must be unique and known");
    }
    fields.add(item.field);
    if ((item.status === "identified") !== (item.values.length > 0)) {
      invalid("Requirement Set values do not match item status");
    }
    if (item.status === "unresolved" && item.source !== "unresolved") {
      invalid("Unresolved items must preserve their unresolved source");
    }
    if (item.status !== "unresolved" && item.source === "unresolved") {
      invalid("Resolved items cannot have unresolved source");
    }
  }
}

export function listUnresolvedRequirementFields(requirementSet: RequirementSet): readonly RequirementField[] {
  return requirementSet.items
    .filter((item) => item.status === "unresolved")
    .map((item) => item.field);
}

export function parseRequirementSet(value: unknown): RequirementSet {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    throw new RequirementSetError("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in Requirement Set");
  }
  assertSafeContent(snapshot);
  if (!validateRequirementSet(snapshot)) {
    invalid(`Invalid Requirement Set schema: ${formatSchemaErrors(validateRequirementSet)}`);
  }
  const requirementSet = snapshot as unknown as RequirementSet;
  assertProject(requirementSet.project);
  assertItemSemantics(requirementSet.items);
  if (requirementSet.summary !== buildSummary(requirementSet.items)) {
    invalid("Requirement Set summary does not match its items");
  }
  try {
    assertDigestMatches(projectForDigest(requirementSet, ["content_digest"]), requirementSet.content_digest);
  } catch {
    invalid("Requirement Set content identity does not match");
  }
  const expectedStatus = listUnresolvedRequirementFields(requirementSet).length === 0
    ? "ready-for-confirmation"
    : "incomplete";
  if (requirementSet.status !== expectedStatus) {
    invalid("Requirement Set status does not match unresolved items");
  }
  return requirementSet;
}

export function buildRequirementSet(value: RequirementSetInput): RequirementSet {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    throw new RequirementSetError("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in Requirement Set");
  }
  assertSafeContent(snapshot);
  if (
    !isPlainRecord(snapshot) ||
    snapshot.schema_version !== "1.0" ||
    typeof snapshot.requirement_set_id !== "string" ||
    snapshot.requirement_set_id.length === 0 ||
    !Number.isSafeInteger(snapshot.version) ||
    (snapshot.version as number) < 1 ||
    !Array.isArray(snapshot.user_resolutions)
  ) {
    invalid("Invalid Requirement Set input");
  }
  assertProject(snapshot.project);
  const intake = parseRequirementIntake(snapshot.candidate);
  const resolutions = new Map<RequirementField, RequirementResolution>();
  for (const item of snapshot.user_resolutions) {
    const resolution = parseResolution(item);
    if (resolutions.has(resolution.field)) {
      invalid("Duplicate user requirement resolution");
    }
    resolutions.set(resolution.field, resolution);
  }

  const items: RequirementSetItem[] = REQUIREMENT_FIELDS.map((field) => {
    const candidateValues = valuesForCandidateField(intake, field);
    const resolution = resolutions.get(field);
    if (candidateValues !== undefined) {
      if (resolution !== undefined) {
        invalid("User resolution cannot replace an identified candidate fact");
      }
      return { field, status: "identified", values: candidateValues, source: "candidate" };
    }
    if (resolution === undefined) {
      return { field, status: "unresolved", values: [], source: "unresolved" };
    }
    return { field, status: resolution.status, values: resolution.values, source: "user" };
  });
  assertItemSemantics(items);
  const base = {
    schema_version: "1.0" as const,
    requirement_set_id: snapshot.requirement_set_id,
    project: snapshot.project,
    version: snapshot.version,
    status: items.some((item) => item.status === "unresolved")
      ? "incomplete" as const
      : "ready-for-confirmation" as const,
    source_candidate_digest: digestJson(intake),
    items,
    summary: buildSummary(items),
  };
  return parseRequirementSet({
    ...base,
    content_digest: digestJson(base),
  });
}
