import { randomUUID } from "node:crypto";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import {
  freezeRequirementSet,
  RequirementFreezeError,
} from "../domain/requirement-freeze.ts";

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

function parseInput(rawInput: Uint8Array): unknown {
  try {
    return parseCanonicalJsonBytes(rawInput);
  } catch (error) {
    if (error instanceof TypeError && error.message === "Invalid canonical JSON input") {
      throw new RequirementFreezeError("INVALID_REQUIREMENT_FREEZE", "Invalid JSON input");
    }
    throw new RequirementFreezeError("INVALID_REQUIREMENT_FREEZE", "Requirement freeze input must use canonical JSON");
  }
}

function classifyFailure(error: unknown): { readonly code: MachineReceipt["code"]; readonly diagnostic: string } {
  if (error instanceof RequirementFreezeError) {
    switch (error.code) {
      case "SENSITIVE_CONTENT_DETECTED":
        return { code: "SENSITIVE_FIELD_DETECTED", diagnostic: "Sensitive content detected in input" };
      case "UNRESOLVED_REQUIREMENTS":
      case "REQUIREMENT_NOT_FROZEN":
        return { code: "REQUIREMENT_NOT_FROZEN", diagnostic: "Requirement Set is not eligible for product definition" };
      case "CONFIRMATION_MISMATCH":
        return { code: "CONFIRMATION_MISMATCH", diagnostic: "Confirmation does not match Requirement Set" };
      case "IDENTITY_CONFLICT":
        return { code: "IDENTITY_CONFLICT", diagnostic: "Confirmation identity conflict" };
      case "INVALID_REQUIREMENT_FREEZE":
        return { code: "REQUIREMENT_FREEZE_REJECTED", diagnostic: "Requirement freeze input rejected" };
    }
  }
  return { code: "REQUIREMENT_FREEZE_REJECTED", diagnostic: "Requirement freeze input rejected" };
}

async function main(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new RequirementFreezeError("INVALID_REQUIREMENT_FREEZE", "Requirement freeze does not accept command arguments");
    }
    const frozen = freezeRequirementSet(parseInput(await io.readInput()));
    writeReceipt(
      io,
      createReceipt(true, "REQUIREMENT_FREEZE_ACCEPTED", {
        canonical_json: canonicalizeJson(frozen),
        digest: digestJson(frozen),
        frozen_requirement: frozen,
        requirement_set: frozen.requirement_set,
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
