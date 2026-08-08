import { Ajv, type ValidateFunction } from "ajv";

import machineReceiptSchema from "../../schemas/v1/machine-receipt.schema.json" with { type: "json" };
import { parseCanonicalJsonBytes } from "./canonical-json.ts";
import { assertDigestMatches } from "./content-digest.ts";
import { assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

export type MachineReceiptCode =
  | "CONTRACT_PROBE_SUCCEEDED"
  | "CONTRACT_PROBE_REJECTED"
  | "INVALID_JSON"
  | "SENSITIVE_FIELD_DETECTED";

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

    assertOwnFields(
      snapshot.data,
      snapshot.ok
        ? ["canonical_json", "digest", "dry_run", "schema_version"]
        : ["dry_run"],
      "data field",
    );

    if (snapshot.ok) {
      const canonicalJson = snapshot.data.canonical_json;
      const digest = snapshot.data.digest;
      if (typeof canonicalJson !== "string" || typeof digest !== "string") {
        throw new TypeError("Invalid successful machine receipt data");
      }

      const subject = parseCanonicalJsonBytes(Buffer.from(canonicalJson, "utf8"));
      assertNoSensitiveFields(subject);
      assertDigestMatches(subject, digest);
    }

    return snapshot;
  },
};

export function parseMachineReceipt(value: unknown): MachineReceipt {
  return MACHINE_RECEIPT_SCHEMA.parse(value);
}
