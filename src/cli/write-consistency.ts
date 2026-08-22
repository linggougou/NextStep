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
  deriveWorkingBaselineDigest,
  evaluateCandidateChange,
  parseCandidateChange,
  parseCandidateChangeDecision,
  type CandidateChange,
  type CandidateChangeDecision,
  type CandidateChangeProbe,
  type WorkingBaselineEvidence,
} from "../domain/candidate-change.ts";
import { assertWriteCommandPolicy, type WriteCommandActorRole } from "../domain/command-policy.ts";
import { parseWriteConfirmationEnvelope } from "../domain/confirmation-node.ts";
import { digestJson } from "../domain/content-digest.ts";
import { parseMachineReceipt, type MachineReceipt, type MachineReceiptCode } from "../domain/machine-receipt.ts";
import {
  ProjectContextError,
  parseProjectContext,
  projectContextDigest,
  resolveProjectContext,
  type ProjectContext,
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

export interface BoundWriteFileSystemPort extends WriteFileSystemPort {
  readonly canonical_project_root: string;
}

export interface CurrentWriteBaselineEvidence {
  readonly formal_baseline: string;
  readonly working_baseline: WorkingBaselineEvidence;
}

export interface WriteTransactionCliContext {
  readonly actor_role: WriteCommandActorRole;
  readonly confirmation_envelope: unknown;
  readonly file_system: BoundWriteFileSystemPort;
  readonly project_probe: ProjectRootProbe;
  readonly candidate_probe: CandidateChangeProbe;
  readonly canonical_project_root: string;
  readonly baseline_probe: () => CurrentWriteBaselineEvidence | Promise<CurrentWriteBaselineEvidence>;
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
  readonly candidate_change: unknown;
  readonly candidate_change_decision: unknown;
  readonly write_plan: unknown;
}

class WriteCliBoundaryError extends Error {
  readonly receiptCode: "WRITE_ACCESS_BLOCKED" | "WRITE_CONFIRMATION_REJECTED";

  constructor(receiptCode: "WRITE_ACCESS_BLOCKED" | "WRITE_CONFIRMATION_REJECTED", message: string) {
    super(message);
    this.receiptCode = receiptCode;
  }
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
  assertExactFields(
    value,
    ["transaction_id", "project_context", "candidate_change", "candidate_change_decision", "write_plan"],
    "write transaction command",
  );
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
        code === "WRITE_ACCESS_BLOCKED"
          ? "WRITE_ACCESS_BLOCKED"
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

function failWriteBoundary(
  code: "WRITE_ACCESS_BLOCKED" | "WRITE_CONFIRMATION_REJECTED",
  message: string,
): never {
  throw new WriteCliBoundaryError(code, message);
}

function assertTrustedWriteCapability(
  integration: WriteTransactionCliContext | undefined,
  dryRun: boolean,
): asserts integration is WriteTransactionCliContext {
  if (integration === undefined) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Integration execution capability is required");
  }
  if (integration.actor_role === "main-conversation-agent") {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Main conversation has no project capability");
  }
  if (
    typeof integration.now !== "function" ||
    integration.file_system === undefined ||
    integration.project_probe === undefined ||
    integration.candidate_probe === undefined ||
    typeof integration.baseline_probe !== "function" ||
    typeof integration.canonical_project_root !== "string" ||
    integration.canonical_project_root.length === 0 ||
    typeof integration.file_system.canonical_project_root !== "string" ||
    integration.file_system.canonical_project_root !== integration.canonical_project_root
  ) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Incomplete trusted project capability");
  }
  try {
    parseWriteConfirmationEnvelope(integration.confirmation_envelope);
  } catch {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Missing or malformed confirmation envelope");
  }
  try {
    assertWriteCommandPolicy({
      command: "write-transaction",
      dry_run: dryRun,
      actor_role: integration.actor_role,
      explicit_confirmation: true,
    });
  } catch {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Actor role cannot execute requested write mode");
  }
}

function parseCurrentBaselineEvidence(value: unknown): CurrentWriteBaselineEvidence {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.formal_baseline !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.formal_baseline) ||
    !isPlainRecord(value.working_baseline) ||
    Object.keys(value.working_baseline).length !== 2 ||
    typeof value.working_baseline.head_oid !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.working_baseline.head_oid) ||
    typeof value.working_baseline.dirty !== "boolean"
  ) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Trusted baseline probe returned invalid evidence");
  }
  return value as unknown as CurrentWriteBaselineEvidence;
}

function assertCurrentBaselineBinding(
  candidate: CandidateChange,
  plan: ReturnType<typeof parseWritePlan>,
  evidence: CurrentWriteBaselineEvidence,
): void {
  const workingDigest = deriveWorkingBaselineDigest(evidence.working_baseline);
  if (
    candidate.project.formal_baseline !== evidence.formal_baseline ||
    plan.formal_baseline !== evidence.formal_baseline ||
    candidate.working_baseline.head_oid !== evidence.working_baseline.head_oid ||
    candidate.working_baseline.dirty !== evidence.working_baseline.dirty ||
    candidate.working_baseline.baseline_digest !== workingDigest ||
    plan.working_baseline_digest !== workingDigest
  ) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Formal or working baseline drifted after preview");
  }
}

function assertCurrentProjectBinding(
  submittedValue: unknown,
  planContextDigest: string,
  integration: WriteTransactionCliContext,
): ProjectContext {
  const submitted = assertS15Stage(submittedValue);
  if (submitted.project_root !== integration.canonical_project_root) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Submitted project root is not bound to the trusted canonical root");
  }
  const current = assertS15Stage(resolveProjectContext({
    workspace_roots: [integration.canonical_project_root],
    requested_project: submitted.project_name,
    explicit_canonical_root: integration.canonical_project_root,
    action_summary: submitted.confirmation_view.action,
  }, integration.project_probe));
  const currentDigest = projectContextDigest(current);
  if (current.project_root !== integration.canonical_project_root) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Resolved project root escaped the trusted canonical root");
  }
  if (currentDigest !== projectContextDigest(submitted) || currentDigest !== planContextDigest) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Project route lock or project context drifted after preview");
  }
  return current;
}

function assertPlanMatchesPreview(
  candidate: CandidateChange,
  decision: CandidateChangeDecision,
  plan: ReturnType<typeof parseWritePlan>,
  context: ProjectContext,
  now: Date,
): void {
  if (
    decision.status !== "ready-for-confirmation" ||
    decision.rejection !== null ||
    decision.candidate_change_id !== candidate.candidate_change_id ||
    decision.candidate_change_digest !== digestJson(candidate) ||
    decision.project_context_digest !== candidate.project_context_digest
  ) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Write command is not bound to a ready preview decision");
  }
  if (Date.parse(candidate.expires_at) <= now.valueOf()) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Candidate change expired after preview");
  }
  if (
    candidate.project_context_digest !== projectContextDigest(context) ||
    plan.candidate_change_digest !== digestJson(candidate) ||
    candidate.project.repository_id !== plan.project.repository_id ||
    candidate.project.formal_baseline !== plan.formal_baseline ||
    candidate.working_baseline.baseline_digest !== plan.working_baseline_digest ||
    candidate.targets.some((target) => target.kind === "delete")
  ) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Write plan project or baseline does not match previewed candidate");
  }
  const candidateTargets = candidate.targets.map((target) => ({
    path: target.path,
    mode: target.kind,
    before_digest: target.before_digest,
    after_digest: target.after_digest,
    content: target.after_content,
  }));
  if (canonicalizeJson(candidateTargets) !== canonicalizeJson(plan.targets)) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Write plan targets do not match previewed candidate");
  }
}

function assertFreshCandidateDecision(
  candidate: CandidateChange,
  submitted: CandidateChangeDecision,
  current: CandidateChangeDecision,
): void {
  if (
    current.status !== "ready-for-confirmation" ||
    current.rejection !== null ||
    submitted.status !== "ready-for-confirmation" ||
    submitted.rejection !== null ||
    submitted.candidate_change_id !== current.candidate_change_id ||
    submitted.candidate_change_digest !== current.candidate_change_digest ||
    submitted.project_context_digest !== current.project_context_digest ||
    submitted.candidate_change_digest !== digestJson(candidate)
  ) {
    failWriteBoundary("WRITE_CONFIRMATION_REJECTED", "Candidate is not currently ready or preview identity was forged");
  }
}

function assertNoProtectedTargets(plan: ReturnType<typeof parseWritePlan>): void {
  if (plan.targets.some((target) => target.path.split("/", 1)[0]?.toLowerCase() === ".git")) {
    failWriteBoundary("WRITE_ACCESS_BLOCKED", "Protected .git targets are not writable through S1.5");
  }
}

export async function runWriteTransaction(
  io: ProcessIoAdapter,
  integration?: WriteTransactionCliContext,
): Promise<void> {
  let dryRun = false;
  try {
    dryRun = parseMode(io.args);
    // 角色、确认、规范根与两个 I/O 端口来自进程内可信组合能力，绝不从 stdin、参数或环境变量读取。
    // 端口本身无法在领域层反射其根，因此组合根必须把 file_system/project_probe 与同一个 canonical root 一起注入。
    assertTrustedWriteCapability(integration, dryRun);

    const command = parseWriteCommand(parseInput(await io.readInput()));
    const plan = parseWritePlan(command.write_plan);
    assertNoProtectedTargets(plan);
    const context = assertCurrentProjectBinding(command.project_context, plan.project_context_digest, integration);
    const candidate = parseCandidateChange(command.candidate_change);
    const decision = parseCandidateChangeDecision(command.candidate_change_decision);
    const now = integration.now();
    if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
      failWriteBoundary("WRITE_ACCESS_BLOCKED", "Invalid trusted integration clock");
    }
    const baseline = parseCurrentBaselineEvidence(await integration.baseline_probe());
    assertCurrentBaselineBinding(candidate, plan, baseline);
    const currentDecision = evaluateCandidateChange({
      candidate,
      project_context: context,
      working_baseline: baseline.working_baseline,
      now: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
      dry_run: true,
    }, integration.candidate_probe);
    assertFreshCandidateDecision(candidate, decision, currentDecision);
    assertPlanMatchesPreview(candidate, decision, plan, context, now);

    const result = parseWriteTransactionResult(await executeWriteTransaction({
      transaction_id: command.transaction_id,
      plan,
      confirmation_envelope: integration.confirmation_envelope,
      file_system: integration.file_system,
      now: () => now,
      dry_run: dryRun,
    }));
    const ok = isSuccessfulWriteCode(result.code);
    io.writeOutput(canonicalizeJson(receipt(ok, result.code, receiptData(result))));
    if (!ok) {
      io.writeDiagnostic(`Write transaction failed: ${result.code}\n`);
      io.setExitCode(1);
    }
  } catch (error) {
    const code = error instanceof WriteCliBoundaryError ? error.receiptCode : "WRITE_ACCESS_BLOCKED";
    writeFailure(io, code, dryRun, safeDiagnostic(error, "Write transaction blocked"));
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const io = createProcessIoAdapter();
  if (io.args.length === 0) await runCandidateChangePreview(io);
  else await runWriteTransaction(io);
}
