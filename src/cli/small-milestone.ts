import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { evaluateSmallMilestonePlan, SmallMilestoneError } from "../domain/small-milestone.ts";

type SmallMilestoneReceiptCode =
  | "SMALL_MILESTONE_ACCEPTED"
  | "SMALL_MILESTONE_REJECTED"
  | "INVALID_JSON"
  | "SENSITIVE_FIELD_DETECTED";

interface SmallMilestoneReceipt {
  readonly schema_version: "1.0";
  readonly receipt_id: string;
  readonly ok: boolean;
  readonly code: SmallMilestoneReceiptCode;
  readonly data: Readonly<Record<string, unknown>>;
}

function receipt(ok: boolean, code: SmallMilestoneReceiptCode, data: Readonly<Record<string, unknown>>): SmallMilestoneReceipt {
  const body = { schema_version: "1.0" as const, ok, code, data };
  return Object.freeze({ schema_version: body.schema_version, receipt_id: `receipt-${digestJson(body).slice("sha256:".length, 39)}`, ok, code, data });
}

class SmallMilestoneCliError extends Error {
  readonly code: SmallMilestoneReceiptCode;
  constructor(code: SmallMilestoneReceiptCode) { super("Small milestone CLI input rejected"); this.code = code; }
}

function parseInput(bytes: Uint8Array): unknown {
  try { return parseCanonicalJsonBytes(bytes); } catch { throw new SmallMilestoneCliError("INVALID_JSON"); }
}

function classifyFailure(error: unknown): SmallMilestoneReceiptCode {
  if (error instanceof SmallMilestoneCliError) return error.code;
  if (error instanceof SmallMilestoneError && error.reasons.some(({ code }) => code === "SENSITIVE_INPUT")) return "SENSITIVE_FIELD_DETECTED";
  return "SMALL_MILESTONE_REJECTED";
}

export async function runSmallMilestone(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) throw new SmallMilestoneCliError("SMALL_MILESTONE_REJECTED");
    const plan = evaluateSmallMilestonePlan(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "SMALL_MILESTONE_ACCEPTED", {
      canonical_json: canonicalizeJson(plan),
      digest: digestJson(plan),
      schema_version: "1.0",
      small_milestone_plan: plan,
    })));
  } catch (error) {
    io.writeOutput(canonicalizeJson(receipt(false, classifyFailure(error), { dry_run: false })));
    io.writeDiagnostic("Small milestone input rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await runSmallMilestone(createProcessIoAdapter());
