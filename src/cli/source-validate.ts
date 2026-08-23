import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { evaluateArchitectureRiskAssessment } from "../domain/architecture-risk.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";

function receipt(
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

function parseInput(bytes: Uint8Array): unknown {
  try {
    return parseCanonicalJsonBytes(bytes);
  } catch {
    throw new TypeError("Invalid canonical JSON input");
  }
}

export async function runSourceValidate(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new TypeError("Architecture risk source validation does not accept command arguments");
    }
    const assessment = evaluateArchitectureRiskAssessment(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "ARCHITECTURE_RISK_ASSESSMENT_ACCEPTED", {
      canonical_json: canonicalizeJson(assessment),
      digest: digestJson(assessment),
      architecture_risk_assessment: assessment,
      schema_version: "1.0",
    })));
  } catch {
    io.writeOutput(canonicalizeJson(receipt(false, "ARCHITECTURE_RISK_ASSESSMENT_REJECTED", {
      dry_run: false,
    })));
    io.writeDiagnostic("Architecture risk assessment input rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSourceValidate(createProcessIoAdapter());
}
