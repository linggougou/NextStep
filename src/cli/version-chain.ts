import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { evaluateVersionChain, VersionChainError } from "../domain/version-chain.ts";

type VersionChainReceiptCode =
  | "VERSION_CHAIN_ACCEPTED"
  | "VERSION_CHAIN_REJECTED"
  | "INVALID_JSON"
  | "SENSITIVE_FIELD_DETECTED";

interface VersionChainReceipt {
  readonly schema_version: "1.0";
  readonly receipt_id: string;
  readonly ok: boolean;
  readonly code: VersionChainReceiptCode;
  readonly data: Readonly<Record<string, unknown>>;
}

function receipt(
  ok: boolean,
  code: VersionChainReceiptCode,
  data: Readonly<Record<string, unknown>>,
): VersionChainReceipt {
  const body = { schema_version: "1.0" as const, ok, code, data };
  return Object.freeze({
    schema_version: body.schema_version,
    receipt_id: `receipt-${digestJson(body).slice("sha256:".length, 39)}`,
    ok,
    code,
    data,
  });
}

class VersionChainCliError extends Error {
  readonly code: VersionChainReceiptCode;

  constructor(code: VersionChainReceiptCode) {
    super("Version chain CLI input rejected");
    this.code = code;
  }
}

function parseInput(bytes: Uint8Array): unknown {
  try {
    return parseCanonicalJsonBytes(bytes);
  } catch {
    throw new VersionChainCliError("INVALID_JSON");
  }
}

function classifyFailure(error: unknown): VersionChainReceiptCode {
  if (error instanceof VersionChainCliError) return error.code;
  if (
    error instanceof VersionChainError &&
    error.reasons.some(({ code }) => code === "SENSITIVE_INPUT")
  ) {
    return "SENSITIVE_FIELD_DETECTED";
  }
  return "VERSION_CHAIN_REJECTED";
}

export async function runVersionChain(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) throw new VersionChainCliError("VERSION_CHAIN_REJECTED");
    const versionChain = evaluateVersionChain(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "VERSION_CHAIN_ACCEPTED", {
      canonical_json: canonicalizeJson(versionChain),
      digest: digestJson(versionChain),
      schema_version: "1.0",
      version_chain: versionChain,
    })));
  } catch (error) {
    const code = classifyFailure(error);
    io.writeOutput(canonicalizeJson(receipt(false, code, { dry_run: false })));
    io.writeDiagnostic("Version chain input rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runVersionChain(createProcessIoAdapter());
}
