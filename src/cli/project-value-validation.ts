import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson } from "../domain/canonical-json.ts";
import { ProjectValueValidationError, evaluateProjectValueRuns } from "../domain/project-value-validation.ts";

type CliErrorCode = "INVALID_INPUT" | "NON_CANONICAL_INPUT" | "SENSITIVE_INPUT_REJECTED" | "DUPLICATE_RUN_ID";
class CliInputError extends Error { constructor(readonly code: CliErrorCode) { super(code); } }

function parseCanonicalInput(bytes: Uint8Array): unknown {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CliInputError("INVALID_INPUT"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { throw new CliInputError("INVALID_INPUT"); }
  let canonical: string;
  try { canonical = canonicalizeJson(parsed); } catch { throw new CliInputError("INVALID_INPUT"); }
  if (text !== canonical) throw new CliInputError("NON_CANONICAL_INPUT");
  return parsed;
}

function errorCode(error: unknown): CliErrorCode {
  if (error instanceof CliInputError || error instanceof ProjectValueValidationError) return error.code;
  return "INVALID_INPUT";
}

export async function runProjectValueValidation(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) throw new CliInputError("INVALID_INPUT");
    io.writeOutput(canonicalizeJson(evaluateProjectValueRuns(parseCanonicalInput(await io.readInput()))));
  } catch (error) {
    io.writeDiagnostic(`${errorCode(error)}\n`);
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runProjectValueValidation(createProcessIoAdapter());
}
