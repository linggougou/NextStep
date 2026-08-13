import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import { parseProductDefinitionCandidate, ProductDefinitionError } from "../domain/product-definition.ts";

function receipt(ok: boolean, code: MachineReceipt["code"], data: Record<string, unknown>): MachineReceipt {
  return parseMachineReceipt({ schema_version: "1.0", receipt_id: `receipt-${randomUUID()}`, ok, code, data });
}

function parseInput(bytes: Uint8Array): unknown {
  try {
    return parseCanonicalJsonBytes(bytes);
  } catch {
    throw new ProductDefinitionError("INVALID_PRODUCT_DEFINITION", "Product definition input must use canonical JSON");
  }
}

export async function runProductDefinition(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) throw new ProductDefinitionError("INVALID_PRODUCT_DEFINITION", "Product definition does not accept command arguments");
    const candidate = parseProductDefinitionCandidate(parseInput(await io.readInput()));
    const { status: _status, ...record } = candidate;
    io.writeOutput(canonicalizeJson(receipt(true, "PRODUCT_DEFINITION_ACCEPTED", {
      canonical_json: canonicalizeJson(record),
      digest: digestJson(record),
      product_definition: record,
      schema_version: "2.0",
    })));
  } catch (error) {
    const code = error instanceof ProductDefinitionError && error.code === "SENSITIVE_CONTENT_DETECTED"
      ? "SENSITIVE_FIELD_DETECTED"
      : "PRODUCT_DEFINITION_REJECTED";
    io.writeOutput(canonicalizeJson(receipt(false, code, { dry_run: false })));
    io.writeDiagnostic(`${code === "SENSITIVE_FIELD_DETECTED" ? "Sensitive field detected in input" : "Product definition input rejected"}\n`);
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runProductDefinition(createProcessIoAdapter());
}
