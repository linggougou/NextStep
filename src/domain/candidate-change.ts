import { Ajv, type ValidateFunction } from "ajv";

import candidateChangeSchema from "../../schemas/v1/candidate-change.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import {
  digestText,
  isWithinPath,
  parseProjectContext,
  projectContextDigest,
  type ProjectContext,
} from "./project-context.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

// S1.5-W2 候选变更领域契约（S3 §7.1 步骤 1-3、007/009 候选变更对象）：
// - 候选绑定项目/formal/工作基线、目标路径、before/after 摘要、影响摘要与会签后果。
// - 评估只允许 dry-run，绝不落盘；任何写入版本冲突、路径越界、权限不足、
//   过期或绑定不一致都 fail closed，被拒绝的裁决绝不降级。
// - 写入版本冲突使用独立错误码 WRITE_CONFLICT_REJECTED，与既有 Profile 码互不改动。

export type CandidateChangeErrorCode =
  | "INVALID_CANDIDATE_CHANGE"
  | "SENSITIVE_CONTENT_DETECTED"
  | "CANDIDATE_BINDING_MISMATCH"
  | "CANDIDATE_EXPIRED_REJECTED"
  | "WRITE_CONFLICT_REJECTED"
  | "WRITE_PATH_ESCAPE_BLOCKED"
  | "WRITE_ACCESS_BLOCKED";

export class CandidateChangeError extends Error {
  readonly code: CandidateChangeErrorCode;

  constructor(code: CandidateChangeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(code: CandidateChangeErrorCode, message: string): never {
  throw new CandidateChangeError(code, message);
}

export type CandidateChangeRejectionCode = Extract<
  CandidateChangeErrorCode,
  | "CANDIDATE_BINDING_MISMATCH"
  | "CANDIDATE_EXPIRED_REJECTED"
  | "WRITE_CONFLICT_REJECTED"
  | "WRITE_PATH_ESCAPE_BLOCKED"
  | "WRITE_ACCESS_BLOCKED"
>;

export interface CandidateChangeRejection {
  readonly code: CandidateChangeRejectionCode;
  readonly reasons: readonly string[];
}

export const CANDIDATE_CHANGE_TARGET_KINDS = ["create", "update", "delete"] as const;
export type CandidateChangeTargetKind = (typeof CANDIDATE_CHANGE_TARGET_KINDS)[number];

export interface CandidateChangeTarget {
  readonly path: string;
  readonly kind: CandidateChangeTargetKind;
  // create 必须为 null；update/delete 必须等于目标文件当前内容的原始字节摘要。
  readonly before_digest: Sha256Digest | null;
  // delete 必须为 null；create/update 必须等于 after_content 的原始字节摘要。
  readonly after_digest: Sha256Digest | null;
  // create/update 必须提供；delete 禁止提供。
  readonly after_content?: string;
}

export interface CandidateChangeWorkingBaseline {
  readonly head_oid: string;
  readonly dirty: boolean;
  readonly baseline_digest: Sha256Digest;
}

export interface CandidateChange {
  readonly schema_version: "1.0";
  readonly record_type: "candidate-change";
  readonly candidate_change_id: string;
  readonly project: {
    readonly repository_id: Sha256Digest;
    readonly formal_baseline: string;
  };
  readonly project_context_digest: Sha256Digest;
  readonly working_baseline: CandidateChangeWorkingBaseline;
  readonly targets: readonly CandidateChangeTarget[];
  readonly impact_summary: string;
  readonly signoff_consequence: string;
  readonly expires_at: string;
}

// 端口：目标项目工作树的基线证据（W3 fs 适配器实现）。评估只读，绝不写入。
export interface CandidateChangeProbe {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  isWritable(path: string): boolean;
  realpath(path: string): string;
  readFileUtf8(path: string): string;
}

export interface WorkingBaselineEvidence {
  readonly head_oid: string;
  readonly dirty: boolean;
}

export interface CandidateChangeEvaluationInput {
  readonly candidate: unknown;
  readonly project_context: ProjectContext;
  readonly working_baseline: WorkingBaselineEvidence;
  // 调用方提供的评估时钟（ISO8601 UTC），保证裁决可回放。
  readonly now: string;
  readonly dry_run: boolean;
}

export interface CandidateChangeDecision {
  readonly schema_version: "1.0";
  readonly record_type: "candidate-change-decision";
  readonly status: "ready-for-confirmation" | "rejected";
  readonly candidate_change_id: string;
  readonly candidate_change_digest: Sha256Digest;
  readonly project_context_digest: Sha256Digest;
  readonly dry_run: true;
  readonly evaluated_at: string;
  readonly rejection: CandidateChangeRejection | null;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OID_PATTERN = /^[a-f0-9]{40}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CANDIDATE_ID_PATTERN = /^candidate-change-[a-z0-9-]{1,64}$/;
const MAX_TARGET_PATH_LENGTH = 512;
const UNSAFE_SEGMENT_PATTERN = /[\s\u0000-\u001f\u007f\\]/;

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCandidateChange: ValidateFunction = ajv.compile(candidateChangeSchema);

// 对文件内容原始 UTF-8 字节计算 sha256（非 JCS），用于 before/after 基线。
export function digestFileContent(content: string): Sha256Digest {
  if (typeof content !== "string") {
    fail("INVALID_CANDIDATE_CHANGE", "File content must be a string");
  }
  return digestText(content);
}

// 工作基线证据摘要：head_oid + dirty 的 RFC8785 摘要。
export function deriveWorkingBaselineDigest(evidence: unknown): Sha256Digest {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(evidence);
  } catch {
    fail("INVALID_CANDIDATE_CHANGE", "Working baseline evidence is not JSON data");
  }
  if (
    !isPlainRecord(snapshot) ||
    Object.keys(snapshot).length !== 2 ||
    !Object.hasOwn(snapshot, "head_oid") ||
    !Object.hasOwn(snapshot, "dirty") ||
    typeof snapshot.head_oid !== "string" ||
    !OID_PATTERN.test(snapshot.head_oid) ||
    typeof snapshot.dirty !== "boolean"
  ) {
    fail("INVALID_CANDIDATE_CHANGE", "Working baseline evidence requires head_oid (40-hex OID) and dirty (boolean)");
  }
  return digestJson({ head_oid: snapshot.head_oid, dirty: snapshot.dirty });
}

function assertTargetSelfConsistency(target: CandidateChangeTarget, index: number): void {
  const label = `targets[${index}]`;
  if (target.kind === "create") {
    if (target.before_digest !== null) {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: create target must not declare before_digest`);
    }
    if (typeof target.after_content !== "string") {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: create target requires after_content`);
    }
    if (target.after_digest === null || target.after_digest !== digestFileContent(target.after_content)) {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: after_digest must match after_content`);
    }
    return;
  }
  if (target.kind === "update") {
    if (target.before_digest === null || !SHA256_PATTERN.test(target.before_digest)) {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: update target requires before_digest`);
    }
    if (typeof target.after_content !== "string") {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: update target requires after_content`);
    }
    if (target.after_digest === null || target.after_digest !== digestFileContent(target.after_content)) {
      fail("INVALID_CANDIDATE_CHANGE", `${label}: after_digest must match after_content`);
    }
    return;
  }
  if (target.before_digest === null || !SHA256_PATTERN.test(target.before_digest)) {
    fail("INVALID_CANDIDATE_CHANGE", `${label}: delete target requires before_digest`);
  }
  if (target.after_digest !== null) {
    fail("INVALID_CANDIDATE_CHANGE", `${label}: delete target must not declare after_digest`);
  }
  if (Object.hasOwn(target, "after_content")) {
    fail("INVALID_CANDIDATE_CHANGE", `${label}: delete target must not declare after_content`);
  }
}

export function parseCandidateChange(value: unknown): CandidateChange {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change: not JSON data");
  }
  try {
    assertNoSensitiveFields(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Invalid candidate change: sensitive field detected");
  }
  try {
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Invalid candidate change: sensitive content detected");
  }
  if (!validateCandidateChange(snapshot)) {
    fail(
      "INVALID_CANDIDATE_CHANGE",
      `Invalid candidate change: ${ajv.errorsText(validateCandidateChange.errors, { separator: "; " })}`,
    );
  }
  const candidate = snapshot as unknown as CandidateChange;
  candidate.targets.forEach((target, index) => assertTargetSelfConsistency(target, index));
  return candidate;
}

// 相对目标路径词法检查：拒绝绝对路径、".."、空段、空白、控制字符与反斜杠。
function assertRelativeTargetPath(path: string): string {
  if (path.length === 0 || path.length > MAX_TARGET_PATH_LENGTH) {
    throw new Error("目标路径长度非法");
  }
  if (path.startsWith("/")) {
    throw new Error("目标路径必须是项目根相对路径");
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new Error("目标路径包含非法段");
    }
    if (UNSAFE_SEGMENT_PATTERN.test(segment)) {
      throw new Error("目标路径包含不安全字符");
    }
  }
  return segments.join("/");
}

function joinPath(root: string, relative: string): string {
  return root === "/" ? `/${relative}` : `${root}/${relative}`;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return path.slice(0, index);
}

interface TargetFailure {
  readonly code: "WRITE_CONFLICT_REJECTED" | "WRITE_ACCESS_BLOCKED" | "WRITE_PATH_ESCAPE_BLOCKED";
  readonly reason: string;
}

const FAILURE_PRIORITY: readonly TargetFailure["code"][] = [
  "WRITE_CONFLICT_REJECTED",
  "WRITE_ACCESS_BLOCKED",
  "WRITE_PATH_ESCAPE_BLOCKED",
];

function evaluateTargets(
  candidate: CandidateChange,
  rootCanonical: string,
  probe: CandidateChangeProbe,
): readonly TargetFailure[] {
  const failures: TargetFailure[] = [];
  for (const target of candidate.targets) {
    let relative: string;
    try {
      relative = assertRelativeTargetPath(target.path);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "目标路径非法";
      failures.push({ code: "WRITE_PATH_ESCAPE_BLOCKED", reason: `目标路径非法：${target.path}（${reason}）` });
      continue;
    }

    const joined = joinPath(rootCanonical, relative);

    // 沿最深存在祖先做符号链接解析，解析结果必须仍在项目根内。
    let ancestor = joined;
    while (ancestor !== rootCanonical && !probe.exists(ancestor)) {
      ancestor = parentPath(ancestor);
    }
    let resolvedAncestor: string;
    try {
      resolvedAncestor = probe.realpath(ancestor);
    } catch {
      failures.push({ code: "WRITE_PATH_ESCAPE_BLOCKED", reason: `目标路径无法解析：${target.path}` });
      continue;
    }
    if (!isWithinPath(rootCanonical, resolvedAncestor)) {
      failures.push({
        code: "WRITE_PATH_ESCAPE_BLOCKED",
        reason: `目标路径解析后越出项目根：${target.path} -> ${resolvedAncestor}`,
      });
      continue;
    }

    if (target.kind === "create") {
      if (probe.exists(joined)) {
        failures.push({ code: "WRITE_CONFLICT_REJECTED", reason: `目标文件已存在（基线声明为新建）：${target.path}` });
      }
    } else if (!probe.exists(joined)) {
      failures.push({ code: "WRITE_CONFLICT_REJECTED", reason: `目标文件不存在（基线不匹配）：${target.path}` });
    } else {
      let content: string | null = null;
      try {
        content = probe.readFileUtf8(joined);
      } catch {
        failures.push({ code: "WRITE_ACCESS_BLOCKED", reason: `基线文件不可读：${target.path}` });
      }
      if (content !== null && digestFileContent(content) !== target.before_digest) {
        failures.push({
          code: "WRITE_CONFLICT_REJECTED",
          reason: `目标文件内容相对声明基线已变化（版本冲突，不得覆盖）：${target.path}`,
        });
      }
    }

    const parent = parentPath(joined);
    if (!probe.exists(parent) || !probe.isDirectory(parent) || !probe.isWritable(parent)) {
      failures.push({ code: "WRITE_ACCESS_BLOCKED", reason: `父目录缺失、不是目录或不可写：${target.path}` });
    } else if (target.kind !== "create" && probe.exists(joined) && !probe.isWritable(joined)) {
      failures.push({ code: "WRITE_ACCESS_BLOCKED", reason: `目标文件不可写：${target.path}` });
    }
  }
  return failures;
}

const EVALUATION_INPUT_FIELDS = new Set(["candidate", "project_context", "working_baseline", "now", "dry_run"]);

function buildDecision(
  candidate: CandidateChange,
  contextDigest: Sha256Digest,
  status: CandidateChangeDecision["status"],
  rejection: CandidateChangeRejection | null,
  evaluatedAt: string,
): CandidateChangeDecision {
  return Object.freeze({
    schema_version: "1.0" as const,
    record_type: "candidate-change-decision" as const,
    status,
    candidate_change_id: candidate.candidate_change_id,
    candidate_change_digest: digestJson(candidate),
    project_context_digest: contextDigest,
    dry_run: true as const,
    evaluated_at: evaluatedAt,
    rejection: rejection === null ? null : Object.freeze({ ...rejection, reasons: Object.freeze([...rejection.reasons]) }),
  });
}

function rejectDecision(
  candidate: CandidateChange,
  contextDigest: Sha256Digest,
  code: CandidateChangeRejectionCode,
  reasons: readonly string[],
  evaluatedAt: string,
): CandidateChangeDecision {
  return buildDecision(candidate, contextDigest, "rejected", { code, reasons }, evaluatedAt);
}

export function evaluateCandidateChange(
  input: CandidateChangeEvaluationInput,
  probe: CandidateChangeProbe,
): CandidateChangeDecision {
  let inputSnapshot: JsonValue;
  try {
    inputSnapshot = snapshotJsonValue(input);
  } catch {
    fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation input is not JSON data");
  }
  if (!isPlainRecord(inputSnapshot)) {
    fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation input must be a plain object");
  }
  for (const field of Object.keys(inputSnapshot)) {
    if (!EVALUATION_INPUT_FIELDS.has(field)) {
      fail("INVALID_CANDIDATE_CHANGE", `Unknown candidate evaluation input field: ${field}`);
    }
  }
  for (const field of EVALUATION_INPUT_FIELDS) {
    if (!Object.hasOwn(inputSnapshot, field)) {
      fail("INVALID_CANDIDATE_CHANGE", `Candidate evaluation input requires ${field}`);
    }
  }

  if (inputSnapshot.dry_run !== true) {
    fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation requires dry-run; refusing to evaluate without dry_run=true");
  }

  const now = inputSnapshot.now;
  if (typeof now !== "string" || !ISO_UTC_PATTERN.test(now) || Number.isNaN(Date.parse(now))) {
    fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation input requires ISO8601 UTC now");
  }

  const evidenceDigest = deriveWorkingBaselineDigest(inputSnapshot.working_baseline);
  const evidence = inputSnapshot.working_baseline as unknown as WorkingBaselineEvidence;

  let context: ProjectContext;
  try {
    context = parseProjectContext(inputSnapshot.project_context);
  } catch {
    fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation input carries an invalid project context");
  }
  const contextDigest = projectContextDigest(context);

  const candidate = parseCandidateChange(inputSnapshot.candidate);

  // 绑定检查：候选必须精确绑定当前项目上下文与工作基线证据。
  if (candidate.project_context_digest !== contextDigest) {
    return rejectDecision(
      candidate,
      contextDigest,
      "CANDIDATE_BINDING_MISMATCH",
      ["候选绑定的项目上下文摘要与当前解析不一致，禁止评估"],
      now,
    );
  }
  if (
    candidate.working_baseline.head_oid !== evidence.head_oid ||
    candidate.working_baseline.dirty !== evidence.dirty ||
    candidate.working_baseline.baseline_digest !== evidenceDigest
  ) {
    return rejectDecision(
      candidate,
      contextDigest,
      "CANDIDATE_BINDING_MISMATCH",
      ["候选声明的工作基线与当前工作基线证据不一致，禁止评估"],
      now,
    );
  }

  // 过期检查优先于目标级检查：恢复入口是重新生成候选。
  const expiresAt = Date.parse(candidate.expires_at);
  if (Number.isNaN(expiresAt) || Date.parse(now) >= expiresAt) {
    return rejectDecision(
      candidate,
      contextDigest,
      "CANDIDATE_EXPIRED_REJECTED",
      [`候选变更已过期：expires_at=${candidate.expires_at}，now=${now}`],
      now,
    );
  }

  // 项目根锚点复检：规范化路径必须与解析时一致且可访问。
  let rootCanonical: string;
  try {
    rootCanonical = probe.realpath(context.project_root);
  } catch {
    return rejectDecision(
      candidate,
      contextDigest,
      "WRITE_ACCESS_BLOCKED",
      [`项目根不可访问：${context.project_root}`],
      now,
    );
  }
  if (rootCanonical !== context.project_root) {
    return rejectDecision(
      candidate,
      contextDigest,
      "WRITE_PATH_ESCAPE_BLOCKED",
      [`项目根规范化路径发生变化：${context.project_root} -> ${rootCanonical}`],
      now,
    );
  }

  const failures = evaluateTargets(candidate, rootCanonical, probe);
  if (failures.length > 0) {
    const code = FAILURE_PRIORITY.find((candidateCode) =>
      failures.some((failure) => failure.code === candidateCode),
    );
    if (code === undefined) {
      fail("INVALID_CANDIDATE_CHANGE", "Candidate evaluation produced an unknown failure category");
    }
    const reasons = failures.filter((failure) => failure.code === code).map((failure) => failure.reason);
    return rejectDecision(candidate, contextDigest, code, reasons, now);
  }

  return buildDecision(candidate, contextDigest, "ready-for-confirmation", null, now);
}

const DECISION_FIELDS = new Set([
  "schema_version",
  "record_type",
  "status",
  "candidate_change_id",
  "candidate_change_digest",
  "project_context_digest",
  "dry_run",
  "evaluated_at",
  "rejection",
]);

const REJECTION_CODES = new Set<string>([
  "CANDIDATE_BINDING_MISMATCH",
  "CANDIDATE_EXPIRED_REJECTED",
  "WRITE_CONFLICT_REJECTED",
  "WRITE_PATH_ESCAPE_BLOCKED",
  "WRITE_ACCESS_BLOCKED",
]);

export function parseCandidateChangeDecision(value: unknown): CandidateChangeDecision {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: not JSON data");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Invalid candidate change decision: sensitive content detected");
  }
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: not a plain object");
  }
  for (const field of Object.keys(snapshot)) {
    if (!DECISION_FIELDS.has(field)) {
      fail("INVALID_CANDIDATE_CHANGE", `Invalid candidate change decision: unknown field ${field}`);
    }
  }
  for (const field of DECISION_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) {
      fail("INVALID_CANDIDATE_CHANGE", `Invalid candidate change decision: missing field ${field}`);
    }
  }
  if (snapshot.schema_version !== "1.0" || snapshot.record_type !== "candidate-change-decision") {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: version or record type is invalid");
  }
  if (snapshot.status !== "ready-for-confirmation" && snapshot.status !== "rejected") {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: status is invalid");
  }
  if (snapshot.dry_run !== true) {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: dry_run must be true");
  }
  if (
    typeof snapshot.candidate_change_id !== "string" ||
    !CANDIDATE_ID_PATTERN.test(snapshot.candidate_change_id)
  ) {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: candidate_change_id is invalid");
  }
  for (const field of ["candidate_change_digest", "project_context_digest"] as const) {
    const digestValue = snapshot[field];
    if (typeof digestValue !== "string" || !SHA256_PATTERN.test(digestValue)) {
      fail("INVALID_CANDIDATE_CHANGE", `Invalid candidate change decision: ${field} is invalid`);
    }
  }
  if (typeof snapshot.evaluated_at !== "string" || !ISO_UTC_PATTERN.test(snapshot.evaluated_at)) {
    fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: evaluated_at must be ISO8601 UTC");
  }

  if (snapshot.status === "ready-for-confirmation") {
    if (snapshot.rejection !== null) {
      fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: ready decision must not carry rejection");
    }
  } else {
    const rejection = snapshot.rejection;
    if (!isPlainRecord(rejection) || Object.keys(rejection).length !== 2) {
      fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: rejected decision requires rejection");
    }
    if (typeof rejection.code !== "string" || !REJECTION_CODES.has(rejection.code)) {
      fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: rejection.code is invalid");
    }
    if (
      !Array.isArray(rejection.reasons) ||
      rejection.reasons.length === 0 ||
      rejection.reasons.some((reason) => typeof reason !== "string" || reason.length === 0)
    ) {
      fail("INVALID_CANDIDATE_CHANGE", "Invalid candidate change decision: rejection.reasons must be non-empty strings");
    }
  }
  return snapshot as unknown as CandidateChangeDecision;
}
