import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import { CarrierDecisionError, parseCarrierDecision } from "../domain/carrier-decision.ts";

function receipt(ok: boolean, code: MachineReceipt["code"], data: Record<string, unknown>): MachineReceipt {
  return parseMachineReceipt({ schema_version: "1.0", receipt_id: `receipt-${randomUUID()}`, ok, code, data });
}

function parseInput(bytes: Uint8Array): unknown {
  try {
    return parseCanonicalJsonBytes(bytes);
  } catch {
    throw new TypeError("Invalid canonical JSON input");
  }
}

function isSensitiveFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    (typeof code === "string" && /^SENSITIVE_(CONTENT|FIELD)_DETECTED$/.test(code)) ||
    /sensitive/i.test(error.message)
  );
}

function classifyFailure(error: unknown): { readonly code: MachineReceipt["code"]; readonly diagnostic: string } {
  if (isSensitiveFailure(error)) {
    return { code: "SENSITIVE_FIELD_DETECTED", diagnostic: "Sensitive field detected in input" };
  }
  if (error instanceof CarrierDecisionError) {
    return { code: "CARRIER_DECISION_REJECTED", diagnostic: "Carrier decision input rejected" };
  }
  return { code: "CARRIER_DECISION_REJECTED", diagnostic: "Carrier decision input rejected" };
}

export async function runCarrierDecision(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new TypeError("Carrier decision does not accept command arguments");
    }
    const decision = parseCarrierDecision(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "CARRIER_DECISION_ACCEPTED", {
      canonical_json: canonicalizeJson(decision),
      digest: digestJson(decision),
      carrier_decision: decision,
      schema_version: "1.0",
    })));
  } catch (error) {
    const failure = classifyFailure(error);
    io.writeOutput(canonicalizeJson(receipt(false, failure.code, { dry_run: false })));
    io.writeDiagnostic(`${failure.diagnostic}\n`);
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCarrierDecision(createProcessIoAdapter());
}
