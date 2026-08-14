import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt } from "../domain/machine-receipt.ts";
import { AcceptanceProfileError, evaluateAcceptanceProfile } from "../domain/acceptance-profile.ts";

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

function isConflictFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    (typeof code === "string" && code.includes("CONFLICT")) ||
    /conflict|冲突/.test(error.message)
  );
}

function classifyFailure(error: unknown): { readonly code: MachineReceipt["code"]; readonly diagnostic: string } {
  if (isSensitiveFailure(error)) {
    return { code: "SENSITIVE_FIELD_DETECTED", diagnostic: "Sensitive field detected in input" };
  }
  // 路线/Profile 冲突必须 fail closed 并阻塞：独立冲突码，禁止降级为 headless 放行。
  if (error instanceof AcceptanceProfileError && isConflictFailure(error)) {
    return { code: "PROFILE_CONFLICT_REJECTED", diagnostic: "Acceptance profile conflict with the target project route" };
  }
  if (error instanceof AcceptanceProfileError) {
    return { code: "ACCEPTANCE_PROFILE_REJECTED", diagnostic: "Acceptance profile input rejected" };
  }
  return { code: "ACCEPTANCE_PROFILE_REJECTED", diagnostic: "Acceptance profile input rejected" };
}

export async function runAcceptanceProfile(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) {
      throw new TypeError("Acceptance profile does not accept command arguments");
    }
    const profile = evaluateAcceptanceProfile(parseInput(await io.readInput()));
    if (profile.status === "rejected") {
      const rejection = profile.rejection;
      if (rejection === null) throw new TypeError("Rejected acceptance profile is missing rejection details");
      throw new AcceptanceProfileError(rejection.code, rejection.reasons.join("; "));
    }
    io.writeOutput(canonicalizeJson(receipt(true, "ACCEPTANCE_PROFILE_ACCEPTED", {
      canonical_json: canonicalizeJson(profile),
      digest: digestJson(profile),
      acceptance_profile: profile,
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
  await runAcceptanceProfile(createProcessIoAdapter());
}
