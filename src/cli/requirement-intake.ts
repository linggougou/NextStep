import { randomUUID } from "node:crypto";

import {
  createProcessIoAdapter,
  type ProcessIoAdapter,
} from "../adapters/node/process-io.ts";
import {
  canonicalizeJson,
  parseCanonicalJsonBytes,
} from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import {
  parseRequirementIntake,
  RequirementIntakeError,
} from "../domain/requirement-intake.ts";

function createReceipt(
  ok: boolean,
  code: MachineReceipt["code"],
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

function parseInput(rawInput: Uint8Array) {
  let value: unknown;
  try {
    value = parseCanonicalJsonBytes(rawInput);
  } catch (error) {
    if (error instanceof TypeError && error.message === "Invalid canonical JSON input") {
      throw new RequirementIntakeError("INVALID_JSON", "Invalid JSON input");
    }
    throw new RequirementIntakeError(
      "INVALID_REQUIREMENT_INTAKE",
      "Requirement intake input must use canonical JSON",
    );
  }
  return parseRequirementIntake(value);
}

function classifyFailure(error: unknown): {
  readonly code: MachineReceipt["code"];
  readonly diagnostic: string;
} {
  if (error instanceof RequirementIntakeError) {
    switch (error.code) {
      case "INVALID_JSON":
        return { code: "INVALID_JSON", diagnostic: "Invalid JSON input" };
      case "SENSITIVE_FIELD_DETECTED":
        return { code: "SENSITIVE_FIELD_DETECTED", diagnostic: "Sensitive field detected in input" };
      case "DEVELOPMENT_TASK_EMBEDDED":
        return {
          code: "DEVELOPMENT_TASK_EMBEDDED",
          diagnostic: "Development tasks are not allowed in requirement intake",
        };
      case "INVALID_REQUIREMENT_INTAKE":
        return {
          code: "REQUIREMENT_INTAKE_REJECTED",
          diagnostic: "Requirement intake input rejected",
        };
    }
  }
  return { code: "REQUIREMENT_INTAKE_REJECTED", diagnostic: "Requirement intake input rejected" };
}

async function main(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new RequirementIntakeError(
        "INVALID_REQUIREMENT_INTAKE",
        "Requirement intake does not accept command arguments",
      );
    }
    const intake = parseInput(await io.readInput());
    writeReceipt(
      io,
      createReceipt(true, "REQUIREMENT_INTAKE_ACCEPTED", {
        canonical_json: canonicalizeJson(intake),
        digest: digestJson(intake),
        requirement_intake: intake,
        schema_version: "1.0",
      }),
    );
  } catch (error) {
    const failure = classifyFailure(error);
    writeReceipt(io, createReceipt(false, failure.code, { dry_run: false }));
    io.writeDiagnostic(`${failure.diagnostic}\n`);
    io.setExitCode(1);
  }
}

await main(createProcessIoAdapter());
