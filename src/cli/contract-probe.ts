import { randomUUID } from "node:crypto";

import {
  createProcessIoAdapter,
  type ProcessIoAdapter,
} from "../adapters/node/process-io.ts";
import { canonicalizeJson } from "../domain/canonical-json.ts";
import { assertSupportedContractVersion } from "../domain/contract-version.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import { assertNoSensitiveFields } from "../domain/sensitive-fields.ts";
import { isPlainRecord } from "../domain/value-guards.ts";

interface ProbeInput {
  readonly schemaVersion: string;
  readonly subject: unknown;
}

function createReceipt(
  ok: boolean,
  code: string,
  data: Record<string, unknown>,
): MachineReceipt {
  return parseMachineReceipt({
    schema_version: "1.0",
    receipt_id: `receipt-${randomUUID()}`,
    ok,
    code,
    data,
  });
}

function writeReceipt(io: ProcessIoAdapter, receipt: MachineReceipt): void {
  io.writeOutput(canonicalizeJson(receipt));
}

function readArguments(args: readonly string[]): { readonly dryRun: boolean } {
  if (args.length === 0) {
    return { dryRun: false };
  }

  if (args.length === 1 && args[0] === "--dry-run") {
    return { dryRun: true };
  }

  throw new TypeError("Invalid contract probe arguments");
}

function parseProbeInput(rawInput: string): ProbeInput {
  let value: unknown;
  try {
    value = JSON.parse(rawInput) as unknown;
  } catch {
    throw new SyntaxError("Invalid JSON input");
  }

  assertNoSensitiveFields(value);

  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "schema_version") ||
    !Object.hasOwn(value, "subject")
  ) {
    throw new TypeError("Invalid contract probe input structure");
  }

  const schemaVersion = value.schema_version;
  assertSupportedContractVersion(schemaVersion);

  return {
    schemaVersion: schemaVersion as string,
    subject: value.subject,
  };
}

function classifyFailure(error: unknown): {
  readonly code: string;
  readonly diagnostic: string;
} {
  if (error instanceof SyntaxError) {
    return { code: "INVALID_JSON", diagnostic: "Invalid JSON input" };
  }

  if (error instanceof Error && /sensitive/i.test(error.message)) {
    return {
      code: "SENSITIVE_FIELD_DETECTED",
      diagnostic: "Sensitive field detected in input",
    };
  }

  return { code: "CONTRACT_PROBE_REJECTED", diagnostic: "Contract probe input rejected" };
}

async function main(io: ProcessIoAdapter): Promise<void> {
  let dryRun = false;

  try {
    ({ dryRun } = readArguments(io.args));
    const input = parseProbeInput(await io.readInput());

    writeReceipt(
      io,
      createReceipt(true, "CONTRACT_PROBE_SUCCEEDED", {
        canonical_json: canonicalizeJson(input.subject),
        digest: digestJson(input.subject),
        dry_run: dryRun,
        schema_version: input.schemaVersion,
      }),
    );
  } catch (error) {
    const failure = classifyFailure(error);
    writeReceipt(io, createReceipt(false, failure.code, { dry_run: dryRun }));
    io.writeDiagnostic(`${failure.diagnostic}\n`);
    io.setExitCode(1);
  }
}

await main(createProcessIoAdapter());
