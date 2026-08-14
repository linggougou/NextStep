import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import { InteractionPrototypeError, parseInteractionPrototype } from "../domain/interaction-prototype.ts";

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
  if (error instanceof InteractionPrototypeError) {
    return { code: "INTERACTION_PROTOTYPE_REJECTED", diagnostic: "Interaction prototype input rejected" };
  }
  return { code: "INTERACTION_PROTOTYPE_REJECTED", diagnostic: "Interaction prototype input rejected" };
}

export async function runInteractionPrototype(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new TypeError("Interaction prototype does not accept command arguments");
    }
    const prototype = parseInteractionPrototype(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "INTERACTION_PROTOTYPE_ACCEPTED", {
      canonical_json: canonicalizeJson(prototype),
      digest: digestJson(prototype),
      interaction_prototype: prototype,
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
  await runInteractionPrototype(createProcessIoAdapter());
}
