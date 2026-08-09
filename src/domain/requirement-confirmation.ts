import { Ajv, type ValidateFunction } from "ajv";

import confirmationSchema from "../../schemas/v1/requirement-confirmation.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { parseRequirementSet, type RequirementSet } from "./requirement-set.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export interface ConfirmationChallenge {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-challenge";
  readonly action: "freeze-requirement-set";
  readonly project: { readonly repository_id: Sha256Digest };
  readonly formal_baseline: string;
  readonly requirement_set_id: string;
  readonly requirement_set_version: number;
  readonly requirement_set_digest: Sha256Digest;
  readonly confirmation_view: Readonly<Record<string, unknown>>;
  readonly confirmation_view_digest: Sha256Digest;
  readonly confirmation_id: string;
  readonly created_at: string;
}

export interface ConfirmationEnvelope {
  readonly schema_version: "1.0";
  readonly record_type: "confirmation-envelope";
  readonly action: "freeze-requirement-set";
  readonly project: { readonly repository_id: Sha256Digest };
  readonly formal_baseline: string;
  readonly requirement_set_id: string;
  readonly requirement_set_version: number;
  readonly requirement_set_digest: Sha256Digest;
  readonly confirmation_view_digest: Sha256Digest;
  readonly confirmation_id: string;
  readonly challenge: ConfirmationChallenge;
  readonly challenge_digest: Sha256Digest;
  readonly confirmation_kind: "explicit-user-confirmation";
  readonly confirmed_at: string;
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

function assertDateTime(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail("INVALID_CONFIRMATION", `Invalid ${label}`);
  }
}

function confirmationView(requirementSet: RequirementSet): Record<string, unknown> {
  return {
    requirement_set_id: requirementSet.requirement_set_id,
    requirement_set_version: requirementSet.version,
    requirement_set_digest: requirementSet.content_digest,
    project: requirementSet.project,
    summary: requirementSet.summary,
    items: requirementSet.items,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

export function createConfirmationChallenge(
  value: RequirementSet,
  input: { readonly confirmation_id: string; readonly created_at: string },
): ConfirmationChallenge {
  const requirementSet = parseRequirementSet(value);
  if (requirementSet.status !== "ready-for-confirmation") {
    fail("UNRESOLVED_REQUIREMENTS", "Unresolved requirements cannot be confirmed");
  }
  assertDateTime(input.created_at, "confirmation challenge time");
  if (input.confirmation_id.length === 0) {
    fail("INVALID_CONFIRMATION", "Confirmation ID is required");
  }
  const view = confirmationView(requirementSet);
  return parseConfirmationChallenge({
    schema_version: "1.0",
    record_type: "confirmation-challenge",
    action: "freeze-requirement-set",
    project: { repository_id: requirementSet.project.repository_id },
    formal_baseline: requirementSet.project.formal_baseline,
    requirement_set_id: requirementSet.requirement_set_id,
    requirement_set_version: requirementSet.version,
    requirement_set_digest: requirementSet.content_digest,
    confirmation_view: view,
    confirmation_view_digest: digestJson(view),
    confirmation_id: input.confirmation_id,
    created_at: input.created_at,
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
  assertDateTime(snapshot.created_at, "confirmation challenge time");
  try {
    assertDigestMatches(snapshot.confirmation_view, String(snapshot.confirmation_view_digest));
  } catch {
    fail("CONFIRMATION_MISMATCH", "Confirmation view identity does not match");
  }
  return snapshot as unknown as ConfirmationChallenge;
}

export function createConfirmationEnvelope(
  value: ConfirmationChallenge,
  input: { readonly confirmation_kind: "explicit-user-confirmation"; readonly confirmed_at: string },
): ConfirmationEnvelope {
  const challenge = parseConfirmationChallenge(value);
  assertDateTime(input.confirmed_at, "confirmation time");
  if (input.confirmation_kind !== "explicit-user-confirmation") {
    fail("INVALID_CONFIRMATION", "Only an explicit confirmation envelope is accepted");
  }
  return parseConfirmationEnvelope({
    schema_version: "1.0",
    record_type: "confirmation-envelope",
    action: challenge.action,
    project: challenge.project,
    formal_baseline: challenge.formal_baseline,
    requirement_set_id: challenge.requirement_set_id,
    requirement_set_version: challenge.requirement_set_version,
    requirement_set_digest: challenge.requirement_set_digest,
    confirmation_view_digest: challenge.confirmation_view_digest,
    confirmation_id: challenge.confirmation_id,
    challenge,
    challenge_digest: digestJson(challenge),
    confirmation_kind: input.confirmation_kind,
    confirmed_at: input.confirmed_at,
  });
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
  assertDateTime(snapshot.confirmed_at, "confirmation time");
  const challenge = parseConfirmationChallenge(snapshot.challenge);
  try {
    assertDigestMatches(challenge, String(snapshot.challenge_digest));
  } catch {
    fail("CONFIRMATION_MISMATCH", "Confirmation challenge identity does not match");
  }
  for (const field of [
    "action",
    "project",
    "formal_baseline",
    "requirement_set_id",
    "requirement_set_version",
    "requirement_set_digest",
    "confirmation_view_digest",
    "confirmation_id",
  ] as const) {
    if (!sameJson(snapshot[field], challenge[field])) {
      fail("CONFIRMATION_MISMATCH", "Confirmation envelope does not match its challenge");
    }
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
  });
  if (
    !sameJson(envelope.challenge, expectedChallenge) ||
    envelope.action !== "freeze-requirement-set" ||
    envelope.project.repository_id !== requirementSet.project.repository_id ||
    envelope.formal_baseline !== requirementSet.project.formal_baseline ||
    envelope.requirement_set_id !== requirementSet.requirement_set_id ||
    envelope.requirement_set_version !== requirementSet.version ||
    envelope.requirement_set_digest !== requirementSet.content_digest ||
    envelope.confirmation_view_digest !== expectedChallenge.confirmation_view_digest
  ) {
    fail("CONFIRMATION_MISMATCH", "Confirmation does not bind the current Requirement Set");
  }
}
