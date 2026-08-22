import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { pathToFileURL } from "node:url";

import { createProcessIoAdapter, type ProcessIoAdapter } from "../adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import {
  CandidateChangeError,
  evaluateCandidateChange,
  parseCandidateChange,
  type CandidateChangeProbe,
  type WorkingBaselineEvidence,
} from "../domain/candidate-change.ts";
import { assertWriteCommandPolicy, type WriteCommandActorRole } from "../domain/command-policy.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt, type MachineReceiptCode } from "../domain/machine-receipt.ts";
import {
  ProjectContextError,
  parseProjectContext,
  resolveProjectContext,
  type ProjectResolutionInput,
  type ProjectRootProbe,
} from "../domain/project-context.ts";
import { isPlainRecord } from "../domain/value-guards.ts";
import {
  executeWriteTransaction,
  parseWritePlan,
  parseWriteTransactionResult,
  type WriteFileSystemPort,
  type WriteTransactionCode,
  type WriteTransactionResult,
} from "../domain/write-transaction.ts";

const S15_STAGE_PATTERN = /(?:^|\/)V1\s*\/\s*M1\.2\s*\/\s*S1\.5(?:$|\b)/;

export interface CandidateChangePreviewContext {
  readonly project_probe?: ProjectRootProbe;
  readonly candidate_probe?: CandidateChangeProbe;
  readonly now?: () => Date;
}

export interface WriteTransactionCliContext {
  readonly actor_role: WriteCommandActorRole;
  readonly confirmation_envelope: unknown;
  readonly file_system: WriteFileSystemPort;
  readonly now: () => Date;
}

interface CandidatePreviewCommand {
  readonly project_resolution: ProjectResolutionInput;
  readonly candidate_change: unknown;
  readonly working_baseline: WorkingBaselineEvidence;
}

interface WriteTransactionCommand {
  readonly transaction_id: string;
  readonly project_context: unknown;
  readonly write_plan: unknown;
}

function receipt(
  ok: boolean,
  code: MachineReceiptCode,
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

function assertExactFields(value: unknown, fields: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new TypeError(`Invalid ${label}`);
  }
}

function parseCandidatePreviewCommand(value: unknown): CandidatePreviewCommand {
  assertExactFields(value, ["project_resolution", "candidate_change", "working_baseline"], "candidate preview command");
  return value as unknown as CandidatePreviewCommand;
}

function parseWriteCommand(value: unknown): WriteTransactionCommand {
  assertExactFields(value, ["transaction_id", "project_context", "write_plan"], "write transaction command");
  if (typeof value.transaction_id !== "string" || value.transaction_id.length === 0) {
    throw new TypeError("Write transaction id is required");
  }
  return value as unknown as WriteTransactionCommand;
}

function isAccessible(path: string, mode: number): boolean {
  try {
    accessSync(path, mode);
    return true;
  } catch {
    return false;
  }
}

/** 同步端口仅用于组合 W2 的同步领域契约；异步 Node adapter 仍服务 W3 写事务。 */
export function createNodeProjectRootProbe(): ProjectRootProbe {
  return {
    exists: existsSync,
    isDirectory: (path) => {
      try { return lstatSync(path).isDirectory(); } catch { return false; }
    },
    isSymbolicLink: (path) => {
      try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
    },
    isReadable: (path) => isAccessible(path, fsConstants.R_OK),
    isWritable: (path) => isAccessible(path, fsConstants.W_OK),
    realpath: (path) => realpathSync(path),
    readFileUtf8: (path) => readFileSync(path, "utf8"),
  };
}

export function createNodeCandidateChangeProbe(): CandidateChangeProbe {
  return {
    exists: existsSync,
    isDirectory: (path) => {
      try { return lstatSync(path).isDirectory(); } catch { return false; }
    },
    isWritable: (path) => isAccessible(path, fsConstants.W_OK),
    realpath: (path) => realpathSync(path),
    readFileUtf8: (path) => readFileSync(path, "utf8"),
  };
}

function assertS15Stage(projectContext: unknown): ReturnType<typeof parseProjectContext> {
  const context = parseProjectContext(projectContext);
  const stage = `${context.stage.lifecycle_stage}/${context.stage.stage_name}`;
  if (!S15_STAGE_PATTERN.test(stage.replace(/\s+/g, ""))) {
    throw new ProjectContextError("PROJECT_STAGE_SOURCE_MISSING", "Current project stage is not V1 / M1.2 / S1.5");
  }
  return context;
}

function safeDiagnostic(error: unknown, fallback: string): string {
  if (error instanceof ProjectContextError) return `${fallback}: ${error.code}`;
  if (error instanceof CandidateChangeError) return `${fallback}: ${error.code}`;
  return fallback;
}

function candidateFailureCode(error: unknown): MachineReceiptCode {
  const code = error instanceof CandidateChangeError || error instanceof ProjectContextError
    ? error.code
    : undefined;
  if (code === "SENSITIVE_CONTENT_DETECTED") return "SENSITIVE_FIELD_DETECTED";
  if (code === "WRITE_CONFLICT_REJECTED") return code;
  if (
    code === "WRITE_ACCESS_BLOCKED" ||
    (typeof code === "string" && /^(?:PROJECT_|WRITE_PATH_ESCAPE)/.test(code))
  ) return "WRITE_ACCESS_BLOCKED";
  return "CANDIDATE_CHANGE_REJECTED";
}

function writeFailure(io: ProcessIoAdapter, code: MachineReceiptCode, dryRun: boolean, diagnostic: string): void {
  io.writeOutput(canonicalizeJson(receipt(false, code, { dry_run: dryRun })));
  io.writeDiagnostic(`${diagnostic}\n`);
  io.setExitCode(1);
}

export async function runCandidateChangePreview(
  io: ProcessIoAdapter,
  integration: CandidateChangePreviewContext = {},
): Promise<void> {
  try {
    if (io.args.length !== 0) throw new TypeError("Candidate preview does not accept command arguments");
    const command = parseCandidatePreviewCommand(parseInput(await io.readInput()));
    const project = assertS15Stage(resolveProjectContext(
      command.project_resolution,
      integration.project_probe ?? createNodeProjectRootProbe(),
    ));
    const now = integration.now?.() ?? new Date();
    if (!(now instanceof Date) || Number.isNaN(now.valueOf())) throw new TypeError("Invalid candidate preview clock");
    const candidate = parseCandidateChange(command.candidate_change);
    if (candidate.targets.some((target) => target.kind === "delete")) {
      writeFailure(
        io,
        "CANDIDATE_CHANGE_REJECTED",
        true,
        "Candidate change rejected: delete targets are not supported by the S1.5 write-plan boundary",
      );
      return;
    }
    const decision = evaluateCandidateChange({
      candidate,
      project_context: project,
      working_baseline: command.working_baseline,
      now: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
      dry_run: true,
    }, integration.candidate_probe ?? createNodeCandidateChangeProbe());
    if (decision.status === "rejected") {
      const code = decision.rejection?.code;
      const receiptCode: MachineReceiptCode =
        code === "WRITE_CONFLICT_REJECTED" || code === "WRITE_ACCESS_BLOCKED"
          ? code
          : "CANDIDATE_CHANGE_REJECTED";
      writeFailure(io, receiptCode, true, `Candidate change rejected: ${code ?? "unknown"}`);
      return;
    }
    io.writeOutput(canonicalizeJson(receipt(true, "CANDIDATE_CHANGE_PREVIEWED", {
      canonical_json: canonicalizeJson(decision),
      digest: digestJson(decision),
      candidate_change_decision: decision,
      dry_run: true,
      schema_version: "1.0",
    })));
  } catch (error) {
    writeFailure(io, candidateFailureCode(error), true, safeDiagnostic(error, "Candidate preview blocked"));
  }
}

function parseMode(args: readonly string[]): boolean {
  if (args.length !== 1 || (args[0] !== "--dry-run" && args[0] !== "--commit")) {
    throw new TypeError("Write transaction requires exactly --dry-run or --commit");
  }
  return args[0] === "--dry-run";
}

function receiptData(result: WriteTransactionResult): Record<string, unknown> {
  return {
    canonical_json: canonicalizeJson(result),
    digest: digestJson(result),
    dry_run: result.dry_run,
    schema_version: "1.0",
    write_transaction_result: result,
  };
}

function isSuccessfulWriteCode(code: WriteTransactionCode): code is "WRITE_PREVIEWED" | "WRITE_COMMITTED" {
  return code === "WRITE_PREVIEWED" || code === "WRITE_COMMITTED";
}

export async function runWriteTransaction(
  io: ProcessIoAdapter,
  integration?: WriteTransactionCliContext,
): Promise<void> {
  let dryRun = false;
  try {
    dryRun = parseMode(io.args);
    // 角色/确认来自进程内集成能力，绝不从 stdin、参数或环境变量读取。
    if (integration === undefined) throw new Error("Integration execution capability is required");
    assertWriteCommandPolicy({
      command: "write-transaction",
      dry_run: dryRun,
      actor_role: integration.actor_role,
      explicit_confirmation: integration.confirmation_envelope !== undefined,
    });
    if (typeof integration.now !== "function" || integration.file_system === undefined) {
      throw new TypeError("Incomplete integration execution capability");
    }

    const command = parseWriteCommand(parseInput(await io.readInput()));
    const context = assertS15Stage(command.project_context);
    const plan = parseWritePlan(command.write_plan);
    if (plan.project_context_digest !== digestJson(context)) {
      throw new ProjectContextError("INVALID_PROJECT_CONTEXT", "Write plan project context binding does not match");
    }

    const result = parseWriteTransactionResult(await executeWriteTransaction({
      transaction_id: command.transaction_id,
      plan,
      confirmation_envelope: integration.confirmation_envelope,
      file_system: integration.file_system,
      now: integration.now,
      dry_run: dryRun,
    }));
    const ok = isSuccessfulWriteCode(result.code);
    io.writeOutput(canonicalizeJson(receipt(ok, result.code, receiptData(result))));
    if (!ok) {
      io.writeDiagnostic(`Write transaction failed: ${result.code}\n`);
      io.setExitCode(1);
    }
  } catch (error) {
    writeFailure(io, "WRITE_ACCESS_BLOCKED", dryRun, safeDiagnostic(error, "Write transaction blocked"));
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWriteTransaction(createProcessIoAdapter());
}
