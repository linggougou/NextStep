import { Ajv, type ValidateFunction } from "ajv";

import frozenRequirementSchema from "../../schemas/v1/frozen-requirement.schema.json" with { type: "json" };
import requirementFreezeCommandSchema from "../../schemas/v1/requirement-freeze-command.schema.json" with { type: "json" };
import { canonicalizeJson } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import {
  assertConfirmationMatchesRequirementSet,
  parseConfirmationEnvelope,
  type ConfirmationEnvelope,
} from "./requirement-confirmation.ts";
import {
  listUnresolvedRequirementFields,
  parseRequirementSet,
  type RequirementSet,
} from "./requirement-set.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export interface RequirementFreezeCommand {
  readonly schema_version: "1.0";
  readonly action: "freeze-requirement-set";
  readonly requirement_set: RequirementSet;
  readonly confirmation: ConfirmationEnvelope;
  readonly known_frozen_records?: readonly unknown[];
}

export interface FrozenRequirement {
  readonly schema_version: "1.0";
  readonly frozen_requirement_id: string;
  readonly status: "frozen";
  readonly project: RequirementSet["project"];
  readonly requirement_set_version: number;
  readonly requirement_set: RequirementSet;
  readonly requirement_content_digest: Sha256Digest;
  readonly confirmation: ConfirmationEnvelope;
  readonly confirmation_binding_digest: Sha256Digest;
  readonly confirmation_view_digest: Sha256Digest;
  readonly next_step: "S1.3.product-definition";
}

export type RequirementFreezeErrorCode = "INVALID_REQUIREMENT_FREEZE" | "UNRESOLVED_REQUIREMENTS" | "CONFIRMATION_MISMATCH" | "IDENTITY_CONFLICT" | "REQUIREMENT_NOT_FROZEN" | "SENSITIVE_CONTENT_DETECTED";

export class RequirementFreezeError extends Error {
  readonly code: RequirementFreezeErrorCode;

  constructor(code: RequirementFreezeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCommand: ValidateFunction = ajv.compile(requirementFreezeCommandSchema);
const validateFrozenRequirement: ValidateFunction = ajv.compile(frozenRequirementSchema);

function fail(code: RequirementFreezeErrorCode, message: string): never {
  throw new RequirementFreezeError(code, message);
}

function formatSchemaErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: "; " });
}

function assertSafeContent(value: unknown): void {
  try {
    assertNoSensitiveContent(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in frozen requirement");
  }
}

function frozenRequirementId(contentDigest: Sha256Digest, confirmationDigest: Sha256Digest): string {
  return `frozen-${digestJson({ content_digest: contentDigest, confirmation_digest: confirmationDigest }).slice("sha256:".length)}`;
}

function translateConfirmationError(error: unknown): never {
  if (error instanceof Error && "code" in error && error.code === "UNRESOLVED_REQUIREMENTS") {
    fail("UNRESOLVED_REQUIREMENTS", "Requirement Set is incomplete");
  }
  fail("CONFIRMATION_MISMATCH", "Confirmation does not match the Requirement Set");
}

export function parseRequirementFreezeCommand(value: unknown): RequirementFreezeCommand {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in requirement freeze command");
  }
  assertSafeContent(snapshot);
  if (!validateCommand(snapshot) || !isPlainRecord(snapshot)) {
    fail("INVALID_REQUIREMENT_FREEZE", `Invalid requirement freeze command: ${formatSchemaErrors(validateCommand)}`);
  }
  let requirementSet: RequirementSet;
  let confirmation: ConfirmationEnvelope;
  try {
    requirementSet = parseRequirementSet(snapshot.requirement_set);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SENSITIVE_CONTENT_DETECTED") {
      fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in requirement freeze command");
    }
    fail("INVALID_REQUIREMENT_FREEZE", "Invalid Requirement Set in freeze command");
  }
  try {
    confirmation = parseConfirmationEnvelope(snapshot.confirmation);
    assertConfirmationMatchesRequirementSet(confirmation, requirementSet);
  } catch (error) {
    translateConfirmationError(error);
  }
  const knownFrozenRecords = Array.isArray(snapshot.known_frozen_records)
    ? snapshot.known_frozen_records
    : undefined;
  return {
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation,
    ...(knownFrozenRecords === undefined ? {} : { known_frozen_records: knownFrozenRecords }),
  };
}

export function recoverFrozenRequirement(value: unknown): FrozenRequirement {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in frozen requirement");
  }
  assertSafeContent(snapshot);
  if (!validateFrozenRequirement(snapshot) || !isPlainRecord(snapshot)) {
    fail("INVALID_REQUIREMENT_FREEZE", "Invalid frozen requirement schema");
  }
  let requirementSet: RequirementSet;
  let confirmation: ConfirmationEnvelope;
  try {
    requirementSet = parseRequirementSet(snapshot.requirement_set);
    confirmation = parseConfirmationEnvelope(snapshot.confirmation);
    assertConfirmationMatchesRequirementSet(confirmation, requirementSet);
  } catch (error) {
    translateConfirmationError(error);
  }
  if (
    canonicalizeJson(snapshot.project) !== canonicalizeJson(requirementSet.project) ||
    snapshot.requirement_set_version !== requirementSet.version ||
    snapshot.requirement_content_digest !== requirementSet.content_digest ||
    snapshot.confirmation_binding_digest !== digestJson(confirmation) ||
    snapshot.confirmation_view_digest !== confirmation.confirmation_view_digest ||
    snapshot.frozen_requirement_id !== frozenRequirementId(requirementSet.content_digest, digestJson(confirmation))
  ) {
    fail("INVALID_REQUIREMENT_FREEZE", "Frozen requirement identity does not match its content");
  }
  if (requirementSet.status !== "ready-for-confirmation" || listUnresolvedRequirementFields(requirementSet).length !== 0) {
    fail("UNRESOLVED_REQUIREMENTS", "Frozen requirement contains unresolved facts");
  }
  return snapshot as unknown as FrozenRequirement;
}

export function freezeRequirementSet(
  value: unknown,
  existingRecords?: readonly unknown[],
): FrozenRequirement {
  const command = parseRequirementFreezeCommand(value);
  if (command.requirement_set.status !== "ready-for-confirmation") {
    fail("UNRESOLVED_REQUIREMENTS", `Unresolved requirements: ${listUnresolvedRequirementFields(command.requirement_set).join(",")}`);
  }
  const knownRecords = existingRecords ?? command.known_frozen_records ?? [];
  const recoveredRecords = knownRecords.map((record) => recoverFrozenRequirement(record));
  const bindingDigest = digestJson(command.confirmation);
  const matchingConfirmation = recoveredRecords.filter(
    (record) => record.confirmation.confirmation_id === command.confirmation.confirmation_id,
  );
  for (const record of matchingConfirmation) {
    if (
      record.requirement_content_digest !== command.requirement_set.content_digest ||
      record.confirmation_binding_digest !== bindingDigest
    ) {
      fail("IDENTITY_CONFLICT", "Confirmation ID is already bound to different frozen content");
    }
    return record;
  }
  const contentDigest = command.requirement_set.content_digest;
  return recoverFrozenRequirement({
    schema_version: "1.0",
    frozen_requirement_id: frozenRequirementId(contentDigest, bindingDigest),
    status: "frozen",
    project: command.requirement_set.project,
    requirement_set_version: command.requirement_set.version,
    requirement_set: command.requirement_set,
    requirement_content_digest: contentDigest,
    confirmation: command.confirmation,
    confirmation_binding_digest: bindingDigest,
    confirmation_view_digest: command.confirmation.confirmation_view_digest,
    next_step: "S1.3.product-definition",
  });
}

export function resolveProductDefinitionEntry(value: unknown): {
  readonly status: "frozen";
  readonly next_step: "S1.3.product-definition";
} {
  try {
    const frozen = recoverFrozenRequirement(value);
    return { status: frozen.status, next_step: frozen.next_step };
  } catch (error) {
    if (error instanceof RequirementFreezeError && error.code === "SENSITIVE_CONTENT_DETECTED") {
      throw error;
    }
    fail("REQUIREMENT_NOT_FROZEN", "Product definition requires a valid frozen requirement");
  }
}
