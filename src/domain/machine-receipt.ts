import { Ajv, type ValidateFunction } from "ajv";

import machineReceiptSchema from "../../schemas/v1/machine-receipt.schema.json" with { type: "json" };
import { canonicalizeJson, parseCanonicalJsonBytes } from "./canonical-json.ts";
import { assertDigestMatches } from "./content-digest.ts";
import { assertNoSensitiveFields } from "./sensitive-fields.ts";
import {
  buildRequirementIntakeUserOutput,
  parseRequirementIntake,
} from "./requirement-intake.ts";
import { recoverFrozenRequirement } from "./requirement-freeze.ts";
import { parseProductDefinitionCandidate } from "./product-definition.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

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
  | "PRODUCT_DEFINITION_REJECTED";

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

    const successfulFields: Record<Extract<MachineReceiptCode, `${string}_ACCEPTED` | "CONTRACT_PROBE_SUCCEEDED">, readonly string[]> = {
      CONTRACT_PROBE_SUCCEEDED: ["canonical_json", "digest", "dry_run", "schema_version"],
      REQUIREMENT_INTAKE_ACCEPTED: ["canonical_json", "digest", "requirement_intake", "schema_version", "user_output"],
      REQUIREMENT_FREEZE_ACCEPTED: ["canonical_json", "digest", "frozen_requirement", "requirement_set", "schema_version"],
      PRODUCT_DEFINITION_ACCEPTED: ["canonical_json", "digest", "product_definition", "schema_version"],
    };
    if (snapshot.ok) {
      const fields = successfulFields[snapshot.code as keyof typeof successfulFields];
      if (fields === undefined) {
        throw new TypeError("Invalid successful machine receipt code");
      }
      assertOwnFields(snapshot.data, fields, "data field");
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
        const { status: _status, ...record } = productDefinition;
        if (canonicalJson !== canonicalizeJson(record)) {
          throw new TypeError("Product definition receipt payload does not match canonical JSON");
        }
      }
    }

    return snapshot;
  },
};

export function parseMachineReceipt(value: unknown): MachineReceipt {
  return MACHINE_RECEIPT_SCHEMA.parse(value);
}
