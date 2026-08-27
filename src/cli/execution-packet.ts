import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { evaluateExecutionPacket, ExecutionPacketError, type ExecutionPacketEvaluationContext } from "../domain/execution-packet.ts";

type ExecutionPacketReceiptCode = "EXECUTION_PACKET_VALID" | "EXECUTION_PACKET_REJECTED" | "INVALID_JSON" | "SENSITIVE_FIELD_DETECTED";
interface ExecutionPacketReceipt { readonly schema_version: "1.0"; readonly receipt_id: string; readonly ok: boolean; readonly code: ExecutionPacketReceiptCode; readonly data: Readonly<Record<string, unknown>> }

function receipt(ok: boolean, code: ExecutionPacketReceiptCode, data: Readonly<Record<string, unknown>>): ExecutionPacketReceipt {
  const body = { schema_version: "1.0" as const, ok, code, data };
  return Object.freeze({ schema_version: body.schema_version, receipt_id: `receipt-${digestJson(body).slice("sha256:".length, 39)}`, ok, code, data });
}

class ExecutionPacketCliError extends Error {
  readonly code: ExecutionPacketReceiptCode;
  constructor(code: ExecutionPacketReceiptCode) { super("Execution packet CLI input rejected"); this.code = code; }
}

function parseInput(bytes: Uint8Array): unknown {
  try { return parseCanonicalJsonBytes(bytes); } catch { throw new ExecutionPacketCliError("INVALID_JSON"); }
}

function classifyFailure(error: unknown): ExecutionPacketReceiptCode {
  if (error instanceof ExecutionPacketCliError) return error.code;
  if (error instanceof ExecutionPacketError && error.reasons.some(({ code }) => code === "SENSITIVE_INPUT")) return "SENSITIVE_FIELD_DETECTED";
  return "EXECUTION_PACKET_REJECTED";
}

export async function runExecutionPacket(io: ProcessIoAdapter, context?: ExecutionPacketEvaluationContext): Promise<void> {
  try {
    if (io.args.length !== 0) throw new ExecutionPacketCliError("EXECUTION_PACKET_REJECTED");
    const result = evaluateExecutionPacket(parseInput(await io.readInput()), context);
    io.writeOutput(canonicalizeJson(receipt(true, "EXECUTION_PACKET_VALID", { canonical_json: canonicalizeJson(result), digest: digestJson(result), execution_packet_result: result, schema_version: "1.0" })));
  } catch (error) {
    io.writeOutput(canonicalizeJson(receipt(false, classifyFailure(error), { dry_run: false })));
    io.writeDiagnostic("Execution packet input rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await runExecutionPacket(createProcessIoAdapter());
