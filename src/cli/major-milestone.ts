import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";
import { evaluateMajorMilestonePlan, MajorMilestoneError } from "../domain/major-milestone.ts";

type MajorMilestoneReceiptCode =
  | "MAJOR_MILESTONE_ACCEPTED"
  | "MAJOR_MILESTONE_REJECTED"
  | "INVALID_JSON"
  | "SENSITIVE_FIELD_DETECTED";

interface MajorMilestoneReceipt {
  readonly schema_version: "1.0";
  readonly receipt_id: string;
  readonly ok: boolean;
  readonly code: MajorMilestoneReceiptCode;
  readonly data: Readonly<Record<string, unknown>>;
}

function receipt(ok: boolean, code: MajorMilestoneReceiptCode, data: Readonly<Record<string, unknown>>): MajorMilestoneReceipt {
  const body = { schema_version: "1.0" as const, ok, code, data };
  return Object.freeze({ schema_version: body.schema_version, receipt_id: `receipt-${digestJson(body).slice("sha256:".length, 39)}`, ok, code, data });
}

class MajorMilestoneCliError extends Error {
  readonly code: MajorMilestoneReceiptCode;
  constructor(code: MajorMilestoneReceiptCode) {
    super("Major milestone CLI input rejected");
    this.code = code;
  }
}

function parseInput(bytes: Uint8Array): unknown {
  try { return parseCanonicalJsonBytes(bytes); }
  catch { throw new MajorMilestoneCliError("INVALID_JSON"); }
}

function classifyFailure(error: unknown): MajorMilestoneReceiptCode {
  if (error instanceof MajorMilestoneCliError) return error.code;
  if (error instanceof MajorMilestoneError && error.reasons.some(({ code }) => code === "SENSITIVE_INPUT")) return "SENSITIVE_FIELD_DETECTED";
  return "MAJOR_MILESTONE_REJECTED";
}

export async function runMajorMilestone(io: ProcessIoAdapter): Promise<void> {
  try {
    if (io.args.length !== 0) throw new MajorMilestoneCliError("MAJOR_MILESTONE_REJECTED");
    const plan = evaluateMajorMilestonePlan(parseInput(await io.readInput()));
    io.writeOutput(canonicalizeJson(receipt(true, "MAJOR_MILESTONE_ACCEPTED", {
      canonical_json: canonicalizeJson(plan),
      digest: digestJson(plan),
      major_milestone_plan: plan,
      schema_version: "1.0",
    })));
  } catch (error) {
    io.writeOutput(canonicalizeJson(receipt(false, classifyFailure(error), { dry_run: false })));
    io.writeDiagnostic("Major milestone input rejected\n");
    io.setExitCode(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMajorMilestone(createProcessIoAdapter());
}
