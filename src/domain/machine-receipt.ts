import { Ajv, type ValidateFunction } from "ajv";

import machineReceiptSchema from "../../schemas/v1/machine-receipt.schema.json" with { type: "json" };
import { canonicalizeJson, parseCanonicalJsonBytes } from "./canonical-json.ts";
import { assertDigestMatches, digestJson } from "./content-digest.ts";
import { assertNoSensitiveFields } from "./sensitive-fields.ts";
import {
  buildRequirementIntakeUserOutput,
  parseRequirementIntake,
} from "./requirement-intake.ts";
import { parseInteractionPrototype } from "./interaction-prototype.ts";
import { parseCarrierDecision } from "./carrier-decision.ts";
import { parseAcceptanceProfileDecision } from "./acceptance-profile.ts";
import { parseCandidateChangeDecision } from "./candidate-change.ts";
import { recoverFrozenRequirement } from "./requirement-freeze.ts";
import { parseProductDefinitionCandidate } from "./product-definition.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";
import { parseWriteTransactionResult } from "./write-transaction.ts";

export type MachineReceiptCode =
  | "CONTRACT_PROBE_SUCCEEDED"
  | "CONTRACT_PROBE_REJECTED"
  | "INVALID_JSON"
  | "SENSITIVE_FIELD_DETECTED"
  | "REQUIREMENT_INTAKE_ACCEPTED"
  | "REQUIREMENT_INTAKE_REJECTED"
  | "DEVELOPMENT_TASK_EMBEDDED"
  | "REQUIREMENT_FREEZE_ACCEPTED"
  | "REQUIREMENT_FREEZE_REJECTED"
  | "REQUIREMENT_NOT_FROZEN"
  | "CONFIRMATION_MISMATCH"
  | "IDENTITY_CONFLICT"
  | "PRODUCT_DEFINITION_ACCEPTED"
  | "PRODUCT_DEFINITION_REJECTED"
  | "INTERACTION_PROTOTYPE_ACCEPTED"
  | "INTERACTION_PROTOTYPE_REJECTED"
  | "CARRIER_DECISION_ACCEPTED"
  | "CARRIER_DECISION_REJECTED"
  | "ACCEPTANCE_PROFILE_ACCEPTED"
  | "ACCEPTANCE_PROFILE_REJECTED"
  | "PROFILE_CONFLICT_REJECTED"
  | "CANDIDATE_CHANGE_PREVIEWED"
  | "CANDIDATE_CHANGE_REJECTED"
  | "WRITE_PREVIEWED"
  | "WRITE_COMMITTED"
  | "WRITE_CONFIRMATION_REJECTED"
  | "WRITE_CONFLICT_REJECTED"
  | "WRITE_PARTIAL_BLOCKED"
  | "WRITE_ACCESS_BLOCKED";

export interface MachineReceipt {
  readonly schema_version: "1.0";
  readonly receipt_id: string;
  readonly ok: boolean;
  readonly code: MachineReceiptCode;
  readonly data: Readonly<UnknownRecord>;
}

export interface ExecutableSchema<T> {
  parse(value: unknown): T;
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

const validateMachineReceipt: ValidateFunction<MachineReceipt> =
  ajv.compile<MachineReceipt>(machineReceiptSchema);

function formatSchemaErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: "; " });
}

function assertOwnFields(
  value: unknown,
  fields: readonly string[],
  label: string,
): asserts value is UnknownRecord {
  if (!isPlainRecord(value) || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new TypeError(`Invalid machine receipt ${label} ownership`);
  }
}

export const MACHINE_RECEIPT_SCHEMA: ExecutableSchema<MachineReceipt> = {
  parse(value: unknown): MachineReceipt {
    const snapshot = assertNoSensitiveFields(value);
    assertOwnFields(
      snapshot,
      ["schema_version", "receipt_id", "ok", "code", "data"],
      "root field",
    );

    if (!validateMachineReceipt(snapshot)) {
      throw new TypeError(`Invalid machine receipt schema: ${formatSchemaErrors(validateMachineReceipt)}`);
    }

    const successfulFields: Partial<Record<MachineReceiptCode, readonly string[]>> = {
      CONTRACT_PROBE_SUCCEEDED: ["canonical_json", "digest", "dry_run", "schema_version"],
      REQUIREMENT_INTAKE_ACCEPTED: ["canonical_json", "digest", "requirement_intake", "schema_version", "user_output"],
      REQUIREMENT_FREEZE_ACCEPTED: ["canonical_json", "digest", "frozen_requirement", "requirement_set", "schema_version"],
      PRODUCT_DEFINITION_ACCEPTED: ["canonical_json", "digest", "product_definition", "schema_version"],
      INTERACTION_PROTOTYPE_ACCEPTED: ["canonical_json", "digest", "interaction_prototype", "schema_version"],
      CARRIER_DECISION_ACCEPTED: ["canonical_json", "digest", "carrier_decision", "schema_version"],
      ACCEPTANCE_PROFILE_ACCEPTED: ["canonical_json", "digest", "acceptance_profile", "schema_version"],
      CANDIDATE_CHANGE_PREVIEWED: ["canonical_json", "digest", "candidate_change_decision", "dry_run", "schema_version"],
      WRITE_PREVIEWED: ["canonical_json", "digest", "dry_run", "schema_version", "write_transaction_result"],
      WRITE_COMMITTED: ["canonical_json", "digest", "dry_run", "schema_version", "write_transaction_result"],
    };
    if (snapshot.ok) {
      const fields = successfulFields[snapshot.code as keyof typeof successfulFields];
      if (fields === undefined) {
        throw new TypeError("Invalid successful machine receipt code");
      }
      assertOwnFields(snapshot.data, fields, "data field");
    } else if (Object.hasOwn(snapshot.data, "write_transaction_result")) {
      assertOwnFields(snapshot.data, ["canonical_json", "digest", "dry_run", "schema_version", "write_transaction_result"], "data field");
    } else {
      assertOwnFields(snapshot.data, ["dry_run"], "data field");
    }

    if (snapshot.ok) {
      const canonicalJson = snapshot.data.canonical_json;
      const digest = snapshot.data.digest;
      if (typeof canonicalJson !== "string" || typeof digest !== "string") {
        throw new TypeError("Invalid successful machine receipt data");
      }

      const subject = parseCanonicalJsonBytes(Buffer.from(canonicalJson, "utf8"));
      assertNoSensitiveFields(subject);
      assertDigestMatches(subject, digest);

      if (snapshot.code === "REQUIREMENT_INTAKE_ACCEPTED") {
        const intake = parseRequirementIntake(snapshot.data.requirement_intake);
        if (canonicalJson !== canonicalizeJson(intake)) {
          throw new TypeError("Requirement intake receipt payload does not match canonical JSON");
        }
        const expectedUserOutput = buildRequirementIntakeUserOutput(intake);
        if (canonicalizeJson(snapshot.data.user_output) !== canonicalizeJson(expectedUserOutput)) {
          throw new TypeError("Requirement intake receipt user output does not match candidate");
        }
      }
      if (snapshot.code === "REQUIREMENT_FREEZE_ACCEPTED") {
        const frozen = recoverFrozenRequirement(snapshot.data.frozen_requirement);
        if (canonicalJson !== canonicalizeJson(frozen)) {
          throw new TypeError("Frozen requirement receipt payload does not match canonical JSON");
        }
        if (canonicalizeJson(snapshot.data.requirement_set) !== canonicalizeJson(frozen.requirement_set)) {
          throw new TypeError("Frozen requirement receipt Requirement Set does not match frozen record");
        }
      }
      if (snapshot.code === "PRODUCT_DEFINITION_ACCEPTED") {
        const productDefinition = parseProductDefinitionCandidate(snapshot.data.product_definition);
        if (snapshot.data.schema_version !== "2.0" || productDefinition.schema_version !== "2.0") {
          throw new TypeError("Product definition receipt subject version must be 2.0");
        }
        const { status: _status, ...record } = productDefinition;
        if (canonicalJson !== canonicalizeJson(record)) {
          throw new TypeError("Product definition receipt payload does not match canonical JSON");
        }
      }
      if (snapshot.code === "INTERACTION_PROTOTYPE_ACCEPTED") {
        if (snapshot.data.schema_version !== "1.0") {
          throw new TypeError("Interaction prototype receipt subject version must be 1.0");
        }
        const prototype = parseInteractionPrototype(snapshot.data.interaction_prototype);
        if (canonicalJson !== canonicalizeJson(prototype)) {
          throw new TypeError("Interaction prototype receipt payload does not match canonical JSON");
        }
      }
      if (snapshot.code === "CARRIER_DECISION_ACCEPTED") {
        if (snapshot.data.schema_version !== "1.0") {
          throw new TypeError("Carrier decision receipt subject version must be 1.0");
        }
        const decision = parseCarrierDecision(snapshot.data.carrier_decision);
        if (canonicalJson !== canonicalizeJson(decision)) {
          throw new TypeError("Carrier decision receipt payload does not match canonical JSON");
        }
      }
      if (snapshot.code === "ACCEPTANCE_PROFILE_ACCEPTED") {
        if (snapshot.data.schema_version !== "1.0") {
          throw new TypeError("Acceptance profile receipt subject version must be 1.0");
        }
        const profile = parseAcceptanceProfileDecision(snapshot.data.acceptance_profile);
        if (canonicalJson !== canonicalizeJson(profile)) {
          throw new TypeError("Acceptance profile receipt payload does not match canonical JSON");
        }
      }
      if (snapshot.code === "CANDIDATE_CHANGE_PREVIEWED") {
        if (snapshot.data.schema_version !== "1.0" || snapshot.data.dry_run !== true) {
          throw new TypeError("Candidate change preview receipt must be a 1.0 dry-run");
        }
        const decision = parseCandidateChangeDecision(snapshot.data.candidate_change_decision);
        if (decision.status !== "ready-for-confirmation" || canonicalJson !== canonicalizeJson(decision)) {
          throw new TypeError("Candidate change preview receipt payload does not match decision");
        }
      }
      if (snapshot.code === "WRITE_PREVIEWED" || snapshot.code === "WRITE_COMMITTED") {
        const result = parseWriteTransactionResult(snapshot.data.write_transaction_result);
        if (
          snapshot.data.schema_version !== "1.0" ||
          result.code !== snapshot.code ||
          result.dry_run !== snapshot.data.dry_run ||
          canonicalJson !== canonicalizeJson(result)
        ) {
          throw new TypeError("Write transaction receipt payload does not match result");
        }
      }
    } else if (Object.hasOwn(snapshot.data, "write_transaction_result")) {
      const result = parseWriteTransactionResult(snapshot.data.write_transaction_result);
      if (
        snapshot.data.schema_version !== "1.0" ||
        result.code !== snapshot.code ||
        result.dry_run !== snapshot.data.dry_run ||
        snapshot.data.canonical_json !== canonicalizeJson(result) ||
        snapshot.data.digest !== digestJson(result)
      ) {
        throw new TypeError("Failed write transaction receipt payload does not match result");
      }
    }

    return snapshot;
  },
};

export function parseMachineReceipt(value: unknown): MachineReceipt {
  return MACHINE_RECEIPT_SCHEMA.parse(value);
}
