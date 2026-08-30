import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { evaluateCapabilityPreflight, type CapabilityPreflightRuntime } from "../domain/capability-preflight.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";

function receipt(ok: boolean, code: MachineReceipt["code"], data: Record<string, unknown>): MachineReceipt {
  return parseMachineReceipt({ schema_version: "1.0", receipt_id: `receipt-${randomUUID()}`, ok, code, data });
}

export async function runCapabilityPreflight(
  io: ProcessIoAdapter,
  runtime?: CapabilityPreflightRuntime,
): Promise<void> {
  try {
    if (io.args.length !== 0 || runtime === undefined) throw new TypeError("Trusted host runtime is required");
    const input = parseCanonicalJsonBytes(await io.readInput());
    const result = await evaluateCapabilityPreflight(input, runtime);
    io.writeOutput(canonicalizeJson(receipt(true, "CONTRACT_PROBE_SUCCEEDED", {
      canonical_json: canonicalizeJson(result),
      digest: digestJson(result),
      dry_run: true,
      schema_version: "1.0",
    })));
  } catch {
    io.writeOutput(canonicalizeJson(receipt(false, "CONTRACT_PROBE_REJECTED", { dry_run: false })));
    io.writeDiagnostic("Capability preflight rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCapabilityPreflight(createProcessIoAdapter());
}
