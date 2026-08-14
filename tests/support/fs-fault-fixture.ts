/**
 * S1.5-W1 fixture/harness 切片：写入一致性 fixture 物化与故障注入 harness。
 *
 * 职责边界（与 Execution Packet `ep-p5-v1-m1.2-s1.5-g4-a1-20260814` 的 W1 写集一致）：
 * - 只构造、物化、自检三类目标项目（community-workshop / expense-reminder /
 *   project-delivery-tool）的写入场景 fixture 与权限/写入故障 fixture；
 * - 不提供任何领域裁决语义（回执码判定、确认链、写入事务决策归 W2/W3/W4）；
 * - 故障注入必须自证真实发生；无法可靠注入时 fail closed（抛出
 *   FaultNotActiveError），绝不返回“声称有故障但实际可写”的假 fixture。
 *
 * 下游消费方式：
 * - W2（project-context / candidate-change）使用物化后的 projectRoot、
 *   auxiliaryRoots、hasRouteLock、resolveWithinRoot、baselineManifestDigest；
 * - W3（confirmation-node / write-transaction / file-write）使用
 *   executeCandidateWrites（含写中故障）、driftBaselineFile、
 *   classifyRollbackSafety、rollbackOwnedWrites 与 fixture JSON 中的 expected；
 * - W4（CLI/Skill）使用 fixture 的 expected.outcome 做回执语义回归。
 *
 * 确定性约定：
 * - fixture 工作树是独立 Git 仓库；作者/提交者身份与日期在物化时固定，
 *   基线提交 OID 在重复物化间恒等（重放证据）；
 * - TreeManifest 采用 Git 语义归一化（普通文件 100644、符号链接 120000），
 *   与 umask 无关；chmod 类权限故障不体现在 manifest，而由探针自证；
 * - 布局场景的辅助根为 harness 约定：nested 位于主根内并计入基线提交，
 *   mirror 与 alias-root 位于 tempRoot 且不计入基线提交。
 */

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { digestJson, type Sha256Digest } from "../../src/domain/content-digest.ts";

const execFile = promisify(execFileCallback);

const FIXTURE_DIRECTORY = resolve(process.cwd(), "tests/fixtures/write-consistency");

const SCENARIO_NAME_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.json$/;
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SCENARIO_ID_PATTERN = /^wc-[a-z0-9-]+$/;
const CHANGE_ID_PATTERN = /^wc-change-[a-z0-9-]+$/;
const PROFILE_ID_PATTERN = /^ap-[a-f0-9]{64}$/;
const PRODUCT_DEFINITION_ID_PATTERN = /^pd-[a-f0-9]{64}$/;
const OBJECT_ID_PATTERN = /^[a-f0-9]{40}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BRANCH_PATTERN = /^[a-z][a-z0-9-]*$/;
const FIXTURE_TYPE_PATTERN = /^write-consistency-(positive|fault|layout)$/;

const PERMISSION_DENIED_CODES = ["EACCES", "EPERM", "EROFS"] as const;

const GIT_USER_NAME = "NextStep Write Fixture";
const GIT_USER_EMAIL = "nextstep-write-fixture@example.invalid";

/** 冻结的 S1.5 回执语义集合（计划冻结项；成功码不在 W1 冻结范围内）。 */
export const FROZEN_WRITE_OUTCOMES = [
  "accepted",
  "WRITE_CONFLICT_REJECTED",
  "WRITE_PARTIAL_BLOCKED",
  "WRITE_ACCESS_BLOCKED",
  "resolution-blocked",
] as const;

export type WriteScenarioOutcome = (typeof FROZEN_WRITE_OUTCOMES)[number];

export type RollbackExpectation = "none" | "owned-rollback-ok" | "unsafe-rollback-block";

export type FaultKind =
  | "readonly-directory"
  | "unwritable-file"
  | "mid-write-failure"
  | "symlink-escape"
  | "baseline-drift"
  | "unsafe-rollback";

export type LayoutKind =
  | "nested-project-root"
  | "same-name-projects"
  | "symlink-project-root"
  | "missing-route-lock";

export interface WriteConsistencyFileSpec {
  readonly path: string;
  readonly content: string;
}

export interface WriteConsistencyFaultSpec {
  readonly kind: FaultKind;
  readonly target_path?: string;
  readonly drift_content?: string;
  readonly fault_at_target_index?: number;
  readonly fault_after_bytes?: number;
  readonly outside_file?: {
    readonly path: string;
    readonly content: string;
  };
}

export interface WriteConsistencyLayoutSpec {
  readonly kind: LayoutKind;
}

export interface WriteConsistencyTargetProject {
  readonly project_id: string;
  readonly repository_id: Sha256Digest;
  readonly formal_baseline: string;
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly carrier_decision_digest: Sha256Digest;
  readonly acceptance_profile_id: string;
}

export interface WriteConsistencyOperatorIdentity {
  readonly repository_id: Sha256Digest;
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly carrier_decision_digest: Sha256Digest;
  readonly acceptance_profile_id: string;
}

export interface WriteConsistencyExpected {
  readonly outcome: WriteScenarioOutcome;
  readonly rollback: RollbackExpectation;
  readonly written_paths: readonly string[];
  readonly unwritten_paths: readonly string[];
  readonly notes: string;
}

export interface WriteConsistencyScenario {
  readonly schema_version: "1.0";
  readonly record_type: "write-consistency-scenario";
  readonly fixture_type: string;
  readonly evidence_scope: string;
  readonly scenario_id: string;
  readonly target_project: WriteConsistencyTargetProject;
  readonly operator_identity: WriteConsistencyOperatorIdentity;
  readonly baseline: {
    readonly branch: string;
    readonly commit_message: string;
    readonly committed_at: string;
    readonly files: readonly WriteConsistencyFileSpec[];
  };
  readonly candidate_change: {
    readonly change_id: string;
    readonly writes: readonly WriteConsistencyFileSpec[];
  };
  readonly fault: WriteConsistencyFaultSpec | null;
  readonly layout: WriteConsistencyLayoutSpec | null;
  readonly expected: WriteConsistencyExpected;
}

export interface TreeManifestEntry {
  readonly path: string;
  readonly type: "file" | "symlink";
  readonly mode: "100644" | "120000";
  readonly digest: Sha256Digest;
}

export type TreeManifest = readonly TreeManifestEntry[];

export interface WritePlanFault {
  readonly atTargetIndex: number;
  readonly afterBytes: number;
}

export interface WriteTargetReport {
  readonly path: string;
  readonly state: "written-full" | "written-partial" | "untouched";
  readonly bytesOnDisk: number;
  readonly digest: Sha256Digest | null;
  readonly existedBefore: boolean;
  readonly beforeDigest: Sha256Digest | null;
  readonly beforeContent: string | null;
}

export interface WriteExecutionReport {
  readonly scenarioId: string;
  readonly faultTriggered: boolean;
  readonly targets: readonly WriteTargetReport[];
}

export interface FaultSetupReport {
  readonly kind: FaultKind;
  readonly verified: true;
  readonly probes: readonly string[];
}

export interface PathResolution {
  readonly relativePath: string;
  readonly resolvedPath: string;
  readonly escaped: boolean;
  readonly reason: "symlink-escape" | "outside-root" | null;
}

export interface RollbackSafety {
  readonly safe: boolean;
  readonly reasons: readonly string[];
}

export interface AuxiliaryRoot {
  readonly name: string;
  readonly path: string;
}

export interface MaterializedWriteFixture {
  readonly scenarioId: string;
  readonly tempRoot: string;
  readonly projectRoot: string;
  readonly outsideArea: string;
  readonly auxiliaryRoots: readonly AuxiliaryRoot[];
  readonly baselineCommit: string;
  readonly baselineTreeOid: string;
  readonly baselineManifestDigest: Sha256Digest;
  applyFaultSetup(): Promise<FaultSetupReport>;
  executeCandidateWrites(options?: { readonly fault?: WritePlanFault }): Promise<WriteExecutionReport>;
  commitAfterWrites(message: string): Promise<string>;
  driftBaselineFile(path: string, content: string): Promise<{
    readonly beforeDigest: Sha256Digest;
    readonly afterDigest: Sha256Digest;
  }>;
  computeManifest(): Promise<TreeManifest>;
  manifestDigest(): Promise<Sha256Digest>;
  hasRouteLock(): Promise<boolean>;
  resolveWithinRoot(relativePath: string): Promise<PathResolution>;
  classifyRollbackSafety(report: WriteExecutionReport): Promise<RollbackSafety>;
  rollbackOwnedWrites(report: WriteExecutionReport): Promise<{
    readonly restoredManifestDigest: Sha256Digest;
  }>;
  cleanup(): Promise<void>;
}

/** fail-closed 校验/物化错误。 */
export class WriteFixtureError extends Error {}

/** 故障注入无法自证真实发生（例如以 root 运行时 chmod 拦截失效）。 */
export class FaultNotActiveError extends WriteFixtureError {}

/** 写中故障按计划触发；report 为磁盘自检后的真实部分写入状态。 */
export class InjectedWriteFailureError extends WriteFixtureError {
  readonly report: WriteExecutionReport;

  constructor(report: WriteExecutionReport) {
    super("Injected write failure (self-verified partial write state)");
    this.report = report;
  }
}

// ---------------------------------------------------------------------------
// 严格校验（fail closed）
// ---------------------------------------------------------------------------

function failFixture(message: string): never {
  throw new WriteFixtureError(message);
}

function asPlainRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failFixture(`${context} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  context: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    failFixture(`${context} 字段集必须恰好为 [${expected.join(", ")}]，实际为 [${actual.join(", ")}]`);
  }
}

function requireKnownKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      failFixture(`${context} 包含未知字段: ${key}`);
    }
  }
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    failFixture(`${context}.${key} 必须是非空字符串`);
  }
  return value;
}

function requirePatternString(
  record: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  context: string,
): string {
  const value = requireString(record, key, context);
  if (!pattern.test(value)) {
    failFixture(`${context}.${key} 格式非法: ${value}`);
  }
  return value;
}

function requireSha256(record: Record<string, unknown>, key: string, context: string): Sha256Digest {
  return requirePatternString(record, key, SHA256_DIGEST_PATTERN, context) as Sha256Digest;
}

function requireRelativePath(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    failFixture(`${context} 必须是非空字符串`);
  }
  if (value.includes("\0")) {
    failFixture(`${context} 不得包含 NUL 字符`);
  }
  if (isAbsolute(value)) {
    failFixture(`${context} 不得是绝对路径: ${value}`);
  }
  if (value.includes("\\")) {
    failFixture(`${context} 不得包含反斜杠: ${value}`);
  }
  if (value !== value.trim()) {
    failFixture(`${context} 不得包含首尾空白: ${value}`);
  }
  for (const segment of value.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      failFixture(`${context} 包含非法路径段: ${value}`);
    }
  }
  return value;
}

function requireFileContent(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    failFixture(`${context} 必须是非空字符串`);
  }
  if (value.includes("\r")) {
    failFixture(`${context} 不得包含 CR（canonical 数据只允许 LF）`);
  }
  if (value.includes("\0")) {
    failFixture(`${context} 不得包含 NUL 字符`);
  }
  if (!value.endsWith("\n")) {
    failFixture(`${context} 必须以换行结尾（canonical 文本约定）`);
  }
  return value;
}

function requireFileSpecArray(
  value: unknown,
  context: string,
): readonly WriteConsistencyFileSpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    failFixture(`${context} 必须是非空数组`);
  }
  const seen = new Set<string>();
  const specs: WriteConsistencyFileSpec[] = [];
  value.forEach((item, index) => {
    const record = asPlainRecord(item, `${context}[${index}]`);
    requireExactKeys(record, ["path", "content"], `${context}[${index}]`);
    const path = requireRelativePath(record.path, `${context}[${index}].path`);
    if (seen.has(path)) {
      failFixture(`${context} 路径重复: ${path}`);
    }
    seen.add(path);
    const content = requireFileContent(record.content, `${context}[${index}].content`);
    specs.push({ path, content });
  });
  return specs;
}

function requireInteger(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    failFixture(`${context}.${key} 必须是 >= 0 的整数`);
  }
  return value;
}

function validateFault(
  value: unknown,
  writes: readonly WriteConsistencyFileSpec[],
  context: string,
): WriteConsistencyFaultSpec {
  const record = asPlainRecord(value, context);
  requireKnownKeys(
    record,
    ["kind", "target_path", "drift_content", "fault_at_target_index", "fault_after_bytes", "outside_file"],
    context,
  );
  const kind = requireString(record, "kind", context);
  const kinds: readonly FaultKind[] = [
    "readonly-directory",
    "unwritable-file",
    "mid-write-failure",
    "symlink-escape",
    "baseline-drift",
    "unsafe-rollback",
  ];
  if (!kinds.includes(kind as FaultKind)) {
    failFixture(`${context}.kind 超出允许集合: ${kind}`);
  }

  const faultKind = kind as FaultKind;
  const spec: { -readonly [K in keyof WriteConsistencyFaultSpec]: WriteConsistencyFaultSpec[K] } = {
    kind: faultKind,
  };

  if (record.target_path !== undefined) {
    spec.target_path = requireRelativePath(record.target_path, `${context}.target_path`);
  }
  if (record.drift_content !== undefined) {
    spec.drift_content = requireFileContent(record.drift_content, `${context}.drift_content`);
  }
  if (record.fault_at_target_index !== undefined) {
    spec.fault_at_target_index = requireInteger(record, "fault_at_target_index", context);
  }
  if (record.fault_after_bytes !== undefined) {
    spec.fault_after_bytes = requireInteger(record, "fault_after_bytes", context);
  }
  if (record.outside_file !== undefined) {
    const outside = asPlainRecord(record.outside_file, `${context}.outside_file`);
    requireExactKeys(outside, ["path", "content"], `${context}.outside_file`);
    spec.outside_file = {
      path: requireRelativePath(outside.path, `${context}.outside_file.path`),
      content: requireFileContent(outside.content, `${context}.outside_file.content`),
    };
  }

  const requireTargetPath = (): string => {
    if (spec.target_path === undefined) {
      failFixture(`${context} 故障类型 ${faultKind} 必须声明 target_path`);
    }
    return spec.target_path;
  };

  switch (faultKind) {
    case "readonly-directory":
    case "unwritable-file": {
      requireTargetPath();
      break;
    }
    case "symlink-escape": {
      requireTargetPath();
      if (spec.outside_file === undefined) {
        failFixture(`${context} 故障类型 symlink-escape 必须声明 outside_file`);
      }
      break;
    }
    case "baseline-drift": {
      requireTargetPath();
      if (spec.drift_content === undefined) {
        failFixture(`${context} 故障类型 baseline-drift 必须声明 drift_content`);
      }
      break;
    }
    case "mid-write-failure":
    case "unsafe-rollback": {
      const atIndex = spec.fault_at_target_index;
      const afterBytes = spec.fault_after_bytes;
      if (atIndex === undefined || afterBytes === undefined) {
        failFixture(`${context} 故障类型 ${faultKind} 必须声明 fault_at_target_index 与 fault_after_bytes`);
      }
      if (atIndex >= writes.length) {
        failFixture(`${context} fault_at_target_index 超出写入目标数量`);
      }
      const targetWrite = writes[atIndex];
      if (!targetWrite) {
        failFixture(`${context} fault_at_target_index 指向不存在的写入目标`);
      }
      if (afterBytes >= Buffer.byteLength(targetWrite.content, "utf8")) {
        failFixture(`${context} fault_after_bytes 必须小于目标内容字节数（保证真实部分写入）`);
      }
      if (faultKind === "unsafe-rollback") {
        requireTargetPath();
        if (spec.drift_content === undefined) {
          failFixture(`${context} 故障类型 unsafe-rollback 必须声明 drift_content`);
        }
      }
      break;
    }
  }

  return spec;
}

export function validateWriteConsistencyScenario(value: unknown): WriteConsistencyScenario {
  const record = asPlainRecord(value, "write-consistency-scenario");
  requireExactKeys(
    record,
    [
      "schema_version",
      "record_type",
      "fixture_type",
      "evidence_scope",
      "scenario_id",
      "target_project",
      "operator_identity",
      "baseline",
      "candidate_change",
      "fault",
      "layout",
      "expected",
    ],
    "write-consistency-scenario",
  );

  if (record.schema_version !== "1.0") {
    failFixture("schema_version 必须为 \"1.0\"");
  }
  if (record.record_type !== "write-consistency-scenario") {
    failFixture("record_type 必须为 \"write-consistency-scenario\"");
  }
  const fixture_type = requirePatternString(record, "fixture_type", FIXTURE_TYPE_PATTERN, "scenario");
  const evidence_scope = requireString(record, "evidence_scope", "scenario");
  const scenario_id = requirePatternString(record, "scenario_id", SCENARIO_ID_PATTERN, "scenario");

  const targetRecord = asPlainRecord(record.target_project, "target_project");
  requireExactKeys(
    targetRecord,
    [
      "project_id",
      "repository_id",
      "formal_baseline",
      "product_definition_id",
      "product_definition_digest",
      "carrier_decision_digest",
      "acceptance_profile_id",
    ],
    "target_project",
  );
  const target_project: WriteConsistencyTargetProject = {
    project_id: requirePatternString(targetRecord, "project_id", /^[a-z][a-z0-9-]*$/, "target_project"),
    repository_id: requireSha256(targetRecord, "repository_id", "target_project"),
    formal_baseline: requirePatternString(targetRecord, "formal_baseline", OBJECT_ID_PATTERN, "target_project"),
    product_definition_id: requirePatternString(
      targetRecord,
      "product_definition_id",
      PRODUCT_DEFINITION_ID_PATTERN,
      "target_project",
    ),
    product_definition_digest: requireSha256(targetRecord, "product_definition_digest", "target_project"),
    carrier_decision_digest: requireSha256(targetRecord, "carrier_decision_digest", "target_project"),
    acceptance_profile_id: requirePatternString(
      targetRecord,
      "acceptance_profile_id",
      PROFILE_ID_PATTERN,
      "target_project",
    ),
  };

  const operatorRecord = asPlainRecord(record.operator_identity, "operator_identity");
  requireExactKeys(
    operatorRecord,
    [
      "repository_id",
      "product_definition_id",
      "product_definition_digest",
      "carrier_decision_digest",
      "acceptance_profile_id",
    ],
    "operator_identity",
  );
  const operator_identity: WriteConsistencyOperatorIdentity = {
    repository_id: requireSha256(operatorRecord, "repository_id", "operator_identity"),
    product_definition_id: requirePatternString(
      operatorRecord,
      "product_definition_id",
      PRODUCT_DEFINITION_ID_PATTERN,
      "operator_identity",
    ),
    product_definition_digest: requireSha256(operatorRecord, "product_definition_digest", "operator_identity"),
    carrier_decision_digest: requireSha256(operatorRecord, "carrier_decision_digest", "operator_identity"),
    acceptance_profile_id: requirePatternString(
      operatorRecord,
      "acceptance_profile_id",
      PROFILE_ID_PATTERN,
      "operator_identity",
    ),
  };

  const baselineRecord = asPlainRecord(record.baseline, "baseline");
  requireExactKeys(baselineRecord, ["branch", "commit_message", "committed_at", "files"], "baseline");
  const branch = requirePatternString(baselineRecord, "branch", BRANCH_PATTERN, "baseline");
  const commit_message = requireString(baselineRecord, "commit_message", "baseline");
  if (commit_message.includes("\r") || commit_message.includes("\0")) {
    failFixture("baseline.commit_message 不得包含 CR 或 NUL");
  }
  const committed_at = requirePatternString(baselineRecord, "committed_at", TIMESTAMP_PATTERN, "baseline");
  const files = requireFileSpecArray(baselineRecord.files, "baseline.files");

  const changeRecord = asPlainRecord(record.candidate_change, "candidate_change");
  requireExactKeys(changeRecord, ["change_id", "writes"], "candidate_change");
  const change_id = requirePatternString(changeRecord, "change_id", CHANGE_ID_PATTERN, "candidate_change");
  const writes = requireFileSpecArray(changeRecord.writes, "candidate_change.writes");

  const fault = record.fault === null ? null : validateFault(record.fault, writes, "fault");

  let layout: WriteConsistencyLayoutSpec | null = null;
  if (record.layout !== null) {
    const layoutRecord = asPlainRecord(record.layout, "layout");
    requireExactKeys(layoutRecord, ["kind"], "layout");
    const layoutKind = requireString(layoutRecord, "kind", "layout");
    const kinds: readonly LayoutKind[] = [
      "nested-project-root",
      "same-name-projects",
      "symlink-project-root",
      "missing-route-lock",
    ];
    if (!kinds.includes(layoutKind as LayoutKind)) {
      failFixture(`layout.kind 超出允许集合: ${layoutKind}`);
    }
    layout = { kind: layoutKind as LayoutKind };
  }

  const expectedRecord = asPlainRecord(record.expected, "expected");
  requireExactKeys(expectedRecord, ["outcome", "rollback", "written_paths", "unwritten_paths", "notes"], "expected");
  const outcome = requireString(expectedRecord, "outcome", "expected");
  if (!FROZEN_WRITE_OUTCOMES.includes(outcome as WriteScenarioOutcome)) {
    failFixture(`expected.outcome 超出冻结集合: ${outcome}`);
  }
  const rollback = requireString(expectedRecord, "rollback", "expected");
  const rollbacks: readonly RollbackExpectation[] = ["none", "owned-rollback-ok", "unsafe-rollback-block"];
  if (!rollbacks.includes(rollback as RollbackExpectation)) {
    failFixture(`expected.rollback 超出允许集合: ${rollback}`);
  }
  const collectPaths = (key: "written_paths" | "unwritten_paths"): readonly string[] => {
    const value = expectedRecord[key];
    if (!Array.isArray(value)) {
      failFixture(`expected.${key} 必须是数组`);
    }
    return value.map((item, index) => requireRelativePath(item, `expected.${key}[${index}]`));
  };
  const expected: WriteConsistencyExpected = {
    outcome: outcome as WriteScenarioOutcome,
    rollback: rollback as RollbackExpectation,
    written_paths: collectPaths("written_paths"),
    unwritten_paths: collectPaths("unwritten_paths"),
    notes: typeof expectedRecord.notes === "string" ? expectedRecord.notes : failFixture("expected.notes 必须是字符串"),
  };

  return {
    schema_version: "1.0",
    record_type: "write-consistency-scenario",
    fixture_type,
    evidence_scope,
    scenario_id,
    target_project,
    operator_identity,
    baseline: { branch, commit_message, committed_at, files },
    candidate_change: { change_id, writes },
    fault,
    layout,
    expected,
  };
}

// ---------------------------------------------------------------------------
// fixture 加载
// ---------------------------------------------------------------------------

async function walkFixtureDirectory(dir: string, prefix: string, out: string[]): Promise<void> {
  const entries = (await readdir(dir, { withFileTypes: true })).slice();
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkFixtureDirectory(join(dir, entry.name), rel, out);
    } else if (entry.isFile()) {
      if (!entry.name.endsWith(".json")) {
        failFixture(`fixture 目录包含非 JSON 文件: ${rel}`);
      }
      if (rel !== "index.json") {
        out.push(rel);
      }
    } else {
      failFixture(`fixture 目录包含非常规条目: ${rel}`);
    }
  }
}

export async function listWriteConsistencyScenarioNames(): Promise<string[]> {
  let statResult;
  try {
    statResult = await stat(FIXTURE_DIRECTORY);
  } catch {
    failFixture(`fixture 目录不存在: ${FIXTURE_DIRECTORY}`);
  }
  if (!statResult.isDirectory()) {
    failFixture(`fixture 路径不是目录: ${FIXTURE_DIRECTORY}`);
  }
  const names: string[] = [];
  await walkFixtureDirectory(FIXTURE_DIRECTORY, "", names);
  names.sort();
  return names;
}

export async function loadWriteConsistencyScenario(name: string): Promise<WriteConsistencyScenario> {
  if (!SCENARIO_NAME_PATTERN.test(name)) {
    failFixture(`非法场景名: ${name}`);
  }
  const fullPath = join(FIXTURE_DIRECTORY, name);
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf8");
  } catch {
    failFixture(`场景文件不存在: ${name}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    failFixture(`场景文件不是合法 JSON: ${name}`);
  }
  return validateWriteConsistencyScenario(parsed);
}

// ---------------------------------------------------------------------------
// Git / 文件系统基础设施
// ---------------------------------------------------------------------------

function createIsolatedGitEnvironment(
  inheritedEnvironment: NodeJS.ProcessEnv,
  templateDirectory: string,
  gitDate: string,
): NodeJS.ProcessEnv {
  const environment = { ...inheritedEnvironment };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) {
      delete environment[key];
    }
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TEMPLATE_DIR: templateDirectory,
    GIT_AUTHOR_DATE: gitDate,
    GIT_COMMITTER_DATE: gitDate,
  };
}

function toGitDate(isoTimestamp: string, offsetSeconds: number): string {
  const seconds = Math.floor(Date.parse(isoTimestamp) / 1000) + offsetSeconds;
  return `${seconds} +0000`;
}

async function runGit(
  directory: string,
  environment: NodeJS.ProcessEnv,
  ...args: string[]
): Promise<string> {
  const { stdout } = await execFile("git", ["-C", directory, ...args], { env: environment });
  return stdout.trim();
}

function sha256OfBytes(bytes: Buffer | string): Sha256Digest {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${digest}`;
}

async function computeManifestOf(root: string): Promise<TreeManifest> {
  const entries: TreeManifestEntry[] = [];
  await walkForManifest(root, root, entries);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

async function walkForManifest(root: string, dir: string, entries: TreeManifestEntry[]): Promise<void> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = join(dir, dirent.name);
    const relPath = relative(root, fullPath).split(sep).join("/");
    if (relPath === ".git" || relPath.startsWith(".git/")) {
      continue;
    }
    if (dirent.isSymbolicLink()) {
      const target = await readlink(fullPath);
      entries.push({ path: relPath, type: "symlink", mode: "120000", digest: sha256OfBytes(target) });
    } else if (dirent.isDirectory()) {
      await walkForManifest(root, fullPath, entries);
    } else if (dirent.isFile()) {
      const bytes = await readFile(fullPath);
      entries.push({ path: relPath, type: "file", mode: "100644", digest: sha256OfBytes(bytes) });
    } else {
      failFixture(`fixture 工作树包含非常规条目: ${relPath}`);
    }
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function renderRouteLock(projectId: string): string {
  return (
    "# PROJECT_ROUTE_LOCK\n\n" +
    `- project_id: ${projectId}\n` +
    "- stage: P5/V1/M1.2/S1.5\n" +
    "- purpose: 写入一致性 fixture 基线标记\n" +
    "- evidence_scope: manual-isolated consumer contract\n" +
    "- note: 仅用于 fixture 物化与解析测试，不是任何真实项目的路线锁真源\n"
  );
}

async function materializeLayout(
  scenario: WriteConsistencyScenario,
  tempRoot: string,
  projectRoot: string,
): Promise<readonly AuxiliaryRoot[]> {
  const layout = scenario.layout;
  if (layout === null) {
    return [];
  }

  switch (layout.kind) {
    case "nested-project-root": {
      const nestedRoot = join(projectRoot, "nested");
      await mkdir(nestedRoot, { recursive: true });
      await writeFile(
        join(nestedRoot, "PROJECT_ROUTE_LOCK.md"),
        renderRouteLock(`${scenario.target_project.project_id}-nested`),
        "utf8",
      );
      await writeFile(join(nestedRoot, "README.md"), "# 嵌套项目 fixture\n\n该根用于复现项目嵌套阻塞。\n", "utf8");
      return [{ name: "nested", path: nestedRoot }];
    }
    case "same-name-projects": {
      const mirrorRoot = join(tempRoot, "mirror");
      for (const file of scenario.baseline.files) {
        const fullPath = join(mirrorRoot, file.path);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file.content, "utf8");
      }
      return [{ name: "mirror", path: mirrorRoot }];
    }
    case "symlink-project-root": {
      const aliasPath = join(tempRoot, "alias-root");
      await symlink(relative(tempRoot, projectRoot), aliasPath);
      return [{ name: "alias", path: aliasPath }];
    }
    case "missing-route-lock":
      return [];
  }
}

// ---------------------------------------------------------------------------
// 物化
// ---------------------------------------------------------------------------

export async function materializeWriteConsistencyScenario(
  scenario: WriteConsistencyScenario,
  options?: { readonly environment?: NodeJS.ProcessEnv },
): Promise<MaterializedWriteFixture> {
  const tempRoot = await mkdtemp(join(tmpdir(), "nextstep-wc-fixture-"));
  const projectRoot = join(tempRoot, "project");
  const outsideArea = join(tempRoot, "outside");
  const templateDirectory = join(tempRoot, "git-template");
  const baselineEnv = createIsolatedGitEnvironment(
    options?.environment ?? process.env,
    templateDirectory,
    toGitDate(scenario.baseline.committed_at, 0),
  );
  const writeCommitEnv = createIsolatedGitEnvironment(
    options?.environment ?? process.env,
    templateDirectory,
    toGitDate(scenario.baseline.committed_at, 60),
  );
  const permissionRestorations: { path: string; mode: number }[] = [];
  let cleaned = false;

  try {
    await Promise.all([
      mkdir(projectRoot, { recursive: true }),
      mkdir(outsideArea, { recursive: true }),
      mkdir(templateDirectory, { recursive: true }),
    ]);

    for (const file of scenario.baseline.files) {
      const fullPath = join(projectRoot, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf8");
    }

    const auxiliaryRoots = await materializeLayout(scenario, tempRoot, projectRoot);

    await runGit(projectRoot, baselineEnv, "init", `--initial-branch=${scenario.baseline.branch}`, `--template=${templateDirectory}`);
    await runGit(projectRoot, baselineEnv, "config", "user.name", GIT_USER_NAME);
    await runGit(projectRoot, baselineEnv, "config", "user.email", GIT_USER_EMAIL);
    await runGit(projectRoot, baselineEnv, "add", "-A");
    await runGit(projectRoot, baselineEnv, "commit", "--quiet", "-m", scenario.baseline.commit_message);

    const baselineCommit = await runGit(projectRoot, baselineEnv, "rev-parse", "HEAD");
    const baselineTreeOid = await runGit(projectRoot, baselineEnv, "rev-parse", "HEAD^{tree}");
    const baselineManifest = await computeManifestOf(projectRoot);
    const baselineManifestDigest = digestJson(baselineManifest);

    const computeManifest = async (): Promise<TreeManifest> => computeManifestOf(projectRoot);
    const manifestDigest = async (): Promise<Sha256Digest> => digestJson(await computeManifestOf(projectRoot));

    const assertFaultDenied = (error: unknown, probeDescription: string): NodeJS.ErrnoException => {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!PERMISSION_DENIED_CODES.includes(code as (typeof PERMISSION_DENIED_CODES)[number])) {
        throw new FaultNotActiveError(`探针未被权限拒绝（fail closed）: ${probeDescription}`);
      }
      return error as NodeJS.ErrnoException;
    };

    const applyFaultSetup = async (): Promise<FaultSetupReport> => {
      const fault = scenario.fault;
      if (fault === null) {
        failFixture(`场景 ${scenario.scenario_id} 未声明故障`);
      }

      switch (fault.kind) {
        case "readonly-directory": {
          const targetPath = fault.target_path;
          if (targetPath === undefined) failFixture("readonly-directory 缺少 target_path");
          const dirPath = join(projectRoot, dirname(targetPath));
          const dirStat = await stat(dirPath);
          const originalMode = dirStat.mode & 0o7777;
          permissionRestorations.push({ path: dirPath, mode: originalMode });
          await chmod(dirPath, 0o555);

          const probePath = join(dirPath, ".fault-probe");
          let probeError: NodeJS.ErrnoException | null = null;
          try {
            const handle = await open(probePath, "wx");
            await handle.close();
            await unlink(probePath).catch(() => undefined);
          } catch (error) {
            probeError = error as NodeJS.ErrnoException;
          }
          if (probeError === null) {
            await chmod(dirPath, originalMode);
            throw new FaultNotActiveError(
              `只读目录故障注入无法自证：探针文件在 ${dirname(targetPath)} 内创建成功（如以 root 运行）`,
            );
          }
          const denied = assertFaultDenied(probeError, `open(${dirname(targetPath)}/.fault-probe, wx)`);
          return {
            kind: fault.kind,
            verified: true,
            probes: [
              `chmod 0555 ${dirname(targetPath)}`,
              `open(${dirname(targetPath)}/.fault-probe, wx) 被拒绝: ${denied.code}`,
            ],
          };
        }

        case "unwritable-file": {
          const targetPath = fault.target_path;
          if (targetPath === undefined) failFixture("unwritable-file 缺少 target_path");
          const filePath = join(projectRoot, targetPath);
          const fileStat = await stat(filePath);
          const originalMode = fileStat.mode & 0o7777;
          permissionRestorations.push({ path: filePath, mode: originalMode });
          await chmod(filePath, 0o444);

          let probeError: NodeJS.ErrnoException | null = null;
          try {
            const handle = await open(filePath, "w");
            await handle.close();
            const baselineFile = scenario.baseline.files.find((file) => file.path === targetPath);
            if (baselineFile) {
              await writeFile(filePath, baselineFile.content, "utf8");
            }
          } catch (error) {
            probeError = error as NodeJS.ErrnoException;
          }
          if (probeError === null) {
            await chmod(filePath, originalMode);
            throw new FaultNotActiveError(
              `不可写文件故障注入无法自证：open(${targetPath}, w) 成功（如以 root 运行）`,
            );
          }
          const denied = assertFaultDenied(probeError, `open(${targetPath}, w)`);
          return {
            kind: fault.kind,
            verified: true,
            probes: [`chmod 0444 ${targetPath}`, `open(${targetPath}, w) 被拒绝: ${denied.code}`],
          };
        }

        case "symlink-escape": {
          const targetPath = fault.target_path;
          const outsideFile = fault.outside_file;
          if (targetPath === undefined || outsideFile === undefined) {
            failFixture("symlink-escape 缺少 target_path 或 outside_file");
          }
          const outsidePath = join(outsideArea, outsideFile.path);
          await mkdir(dirname(outsidePath), { recursive: true });
          await writeFile(outsidePath, outsideFile.content, "utf8");

          const linkPath = join(projectRoot, targetPath);
          await mkdir(dirname(linkPath), { recursive: true });
          await symlink(relative(dirname(linkPath), outsidePath), linkPath);

          const linkStat = await lstat(linkPath);
          if (!linkStat.isSymbolicLink()) {
            throw new FaultNotActiveError(`符号链接创建失败: ${targetPath}`);
          }
          const resolved = await realpath(linkPath);
          const outsideReal = await realpath(outsidePath);
          if (resolved !== outsideReal) {
            throw new FaultNotActiveError(`符号链接未指向项目外文件: ${targetPath}`);
          }
          if (isWithinRoot(await realpath(projectRoot), resolved)) {
            throw new FaultNotActiveError(`符号链接未逃逸项目根: ${targetPath}`);
          }
          return {
            kind: fault.kind,
            verified: true,
            probes: [
              `symlink ${targetPath} -> ${relative(dirname(linkPath), outsidePath)}`,
              `realpath(${targetPath}) = ${resolved}（位于项目根之外）`,
            ],
          };
        }

        case "baseline-drift":
        case "unsafe-rollback": {
          const targetPath = fault.target_path;
          const driftContent = fault.drift_content;
          if (targetPath === undefined || driftContent === undefined) {
            failFixture(`${fault.kind} 缺少 target_path 或 drift_content`);
          }
          if (fault.kind === "unsafe-rollback") {
            const inTargets = scenario.candidate_change.writes.some((write) => write.path === targetPath);
            if (inTargets) {
              failFixture("unsafe-rollback 的漂移文件必须位于写入目标之外（归属外）");
            }
          }
          const beforeDigest = await manifestDigest();
          const fullPath = join(projectRoot, targetPath);
          const beforeContent = await readFile(fullPath, "utf8");
          if (beforeContent === driftContent) {
            failFixture(`${fault.kind} 的 drift_content 必须与基线内容不同`);
          }
          await writeFile(fullPath, driftContent, "utf8");

          const afterDigest = await manifestDigest();
          if (beforeDigest === afterDigest) {
            throw new FaultNotActiveError(`漂移未改变 manifest 摘要: ${targetPath}`);
          }
          const gitStatus = await runGit(projectRoot, baselineEnv, "status", "--porcelain");
          if (gitStatus.length === 0) {
            throw new FaultNotActiveError(`漂移未产生 Git 脏状态: ${targetPath}`);
          }
          return {
            kind: fault.kind,
            verified: true,
            probes: [
              `漂移落盘 ${targetPath}（内容 ${sha256OfBytes(beforeContent)} -> ${sha256OfBytes(driftContent)}）`,
              `manifest 摘要变化 ${beforeDigest} -> ${afterDigest}`,
              "git status --porcelain 非空",
            ],
          };
        }

        case "mid-write-failure": {
          const atIndex = fault.fault_at_target_index;
          const afterBytes = fault.fault_after_bytes;
          if (atIndex === undefined || afterBytes === undefined) {
            failFixture("mid-write-failure 缺少注入参数");
          }
          const targetWrite = scenario.candidate_change.writes[atIndex];
          if (!targetWrite) {
            failFixture("mid-write-failure 注入点超出写入目标数量");
          }
          return {
            kind: fault.kind,
            verified: true,
            probes: [
              `注入点参数校验通过：第 ${atIndex} 个目标 ${targetWrite.path}，写入 ${afterBytes} 字节后失败`,
            ],
          };
        }
      }
    };

    const buildReport = async (
      writes: readonly WriteConsistencyFileSpec[],
      beforeStates: ReadonlyMap<string, { existed: boolean; content: string | null; digest: Sha256Digest | null }>,
      fault: WritePlanFault | null,
      faultTriggered: boolean,
    ): Promise<WriteExecutionReport> => {
      const targets: WriteTargetReport[] = [];
      for (const [index, write] of writes.entries()) {
        const fullPath = join(projectRoot, write.path);
        const before = beforeStates.get(write.path);
        if (!before) {
          failFixture(`写入报告缺少前置状态: ${write.path}`);
        }

        let onDisk: Buffer | null = null;
        try {
          onDisk = await readFile(fullPath);
        } catch {
          onDisk = null;
        }

        const fullBytes = Buffer.from(write.content, "utf8");
        const expectedState: WriteTargetReport["state"] =
          fault === null
            ? "written-full"
            : index < fault.atTargetIndex
              ? "written-full"
              : index === fault.atTargetIndex
                ? "written-partial"
                : "untouched";

        let state: WriteTargetReport["state"];
        if (onDisk !== null && sha256OfBytes(onDisk) === sha256OfBytes(fullBytes)) {
          state = "written-full";
        } else if (
          onDisk !== null &&
          onDisk.length < fullBytes.length &&
          fullBytes.subarray(0, onDisk.length).equals(onDisk)
        ) {
          state = "written-partial";
        } else if (onDisk === null && !before.existed) {
          state = "untouched";
        } else if (
          onDisk !== null &&
          before.existed &&
          before.digest !== null &&
          sha256OfBytes(onDisk) === before.digest
        ) {
          state = "untouched";
        } else {
          failFixture(`磁盘自检失败：${write.path} 状态与写入计划不一致`);
        }

        if (state !== expectedState) {
          failFixture(`磁盘自检失败：${write.path} 期望 ${expectedState}，实际 ${state}`);
        }
        if (state === "written-partial" && fault !== null && index === fault.atTargetIndex) {
          if (onDisk === null || onDisk.length !== fault.afterBytes) {
            failFixture(`磁盘自检失败：${write.path} 部分写入字节数与注入点不一致`);
          }
        }

        targets.push({
          path: write.path,
          state,
          bytesOnDisk: onDisk === null ? 0 : onDisk.length,
          digest: onDisk === null ? null : sha256OfBytes(onDisk),
          existedBefore: before.existed,
          beforeDigest: before.digest,
          beforeContent: before.content,
        });
      }
      return { scenarioId: scenario.scenario_id, faultTriggered, targets };
    };

    const executeCandidateWrites = async (
      executeOptions?: { readonly fault?: WritePlanFault },
    ): Promise<WriteExecutionReport> => {
      const writes = scenario.candidate_change.writes;
      const fault = executeOptions?.fault ?? null;
      if (fault !== null) {
        if (!Number.isInteger(fault.atTargetIndex) || fault.atTargetIndex < 0 || fault.atTargetIndex >= writes.length) {
          failFixture("fault.atTargetIndex 超出写入目标范围");
        }
        if (!Number.isInteger(fault.afterBytes) || fault.afterBytes < 0) {
          failFixture("fault.afterBytes 必须是 >= 0 的整数");
        }
        const targetWrite = writes[fault.atTargetIndex];
        if (!targetWrite || fault.afterBytes >= Buffer.byteLength(targetWrite.content, "utf8")) {
          failFixture("fault.afterBytes 必须小于目标内容字节数（保证真实部分写入）");
        }
      }

      const beforeStates = new Map<string, { existed: boolean; content: string | null; digest: Sha256Digest | null }>();
      for (const write of writes) {
        const fullPath = join(projectRoot, write.path);
        try {
          const content = await readFile(fullPath, "utf8");
          beforeStates.set(write.path, { existed: true, content, digest: sha256OfBytes(content) });
        } catch {
          beforeStates.set(write.path, { existed: false, content: null, digest: null });
        }
      }

      for (const [index, write] of writes.entries()) {
        const fullPath = join(projectRoot, write.path);
        await mkdir(dirname(fullPath), { recursive: true });

        if (fault !== null && index === fault.atTargetIndex) {
          const prefix = Buffer.from(write.content, "utf8").subarray(0, fault.afterBytes);
          const handle = await open(fullPath, "w");
          await handle.writeFile(prefix);
          await handle.sync();
          await handle.close();
          const report = await buildReport(writes, beforeStates, fault, true);
          throw new InjectedWriteFailureError(report);
        }

        const tmpPath = `${fullPath}.tmp-wc-${index}`;
        const handle = await open(tmpPath, "w");
        await handle.writeFile(write.content, "utf8");
        await handle.sync();
        await handle.close();
        await rename(tmpPath, fullPath);
      }

      return await buildReport(writes, beforeStates, fault, false);
    };

    const commitAfterWrites = async (message: string): Promise<string> => {
      if (message.length === 0 || message.includes("\r") || message.includes("\0")) {
        failFixture("提交信息不得为空且不得包含 CR/NUL");
      }
      await runGit(projectRoot, writeCommitEnv, "add", "-A");
      await runGit(projectRoot, writeCommitEnv, "commit", "--quiet", "-m", message);
      return await runGit(projectRoot, writeCommitEnv, "rev-parse", "HEAD");
    };

    const driftBaselineFile = async (
      path: string,
      content: string,
    ): Promise<{ beforeDigest: Sha256Digest; afterDigest: Sha256Digest }> => {
      const relativePath = requireRelativePath(path, "driftBaselineFile.path");
      const driftContent = requireFileContent(content, "driftBaselineFile.content");
      const fullPath = join(projectRoot, relativePath);
      const beforeContent = await readFile(fullPath, "utf8");
      await writeFile(fullPath, driftContent, "utf8");
      return { beforeDigest: sha256OfBytes(beforeContent), afterDigest: sha256OfBytes(driftContent) };
    };

    const hasRouteLock = async (): Promise<boolean> => {
      try {
        await stat(join(projectRoot, "PROJECT_ROUTE_LOCK.md"));
        return true;
      } catch {
        return false;
      }
    };

    const resolveWithinRoot = async (relativePath: string): Promise<PathResolution> => {
      const validated = requireRelativePath(relativePath, "resolveWithinRoot.relativePath");
      const joined = resolve(projectRoot, validated);
      const realRoot = await realpath(projectRoot);

      let exists = true;
      try {
        await lstat(joined);
      } catch {
        exists = false;
      }

      if (exists) {
        const resolvedPath = await realpath(joined);
        if (isWithinRoot(realRoot, resolvedPath)) {
          return { relativePath: validated, resolvedPath, escaped: false, reason: null };
        }
        const linkStat = await lstat(joined);
        return {
          relativePath: validated,
          resolvedPath,
          escaped: true,
          reason: linkStat.isSymbolicLink() ? "symlink-escape" : "outside-root",
        };
      }

      let ancestor = joined;
      for (;;) {
        try {
          await lstat(ancestor);
          break;
        } catch {
          const parent = dirname(ancestor);
          if (parent === ancestor) {
            failFixture(`无法定位现存祖先路径: ${validated}`);
          }
          ancestor = parent;
        }
      }
      const resolvedAncestor = await realpath(ancestor);
      const resolvedPath = join(resolvedAncestor, relative(ancestor, joined));
      const escaped = !isWithinRoot(realRoot, resolvedPath);
      return {
        relativePath: validated,
        resolvedPath,
        escaped,
        reason: escaped ? "outside-root" : null,
      };
    };

    const classifyRollbackSafety = async (report: WriteExecutionReport): Promise<RollbackSafety> => {
      const current = await computeManifestOf(projectRoot);
      const targetPaths = new Set(report.targets.map((target) => target.path));
      const baselineByPath = new Map(baselineManifest.map((entry) => [entry.path, entry]));
      const currentByPath = new Map(current.map((entry) => [entry.path, entry]));
      const reasons: string[] = [];

      for (const entry of current) {
        if (targetPaths.has(entry.path)) {
          continue;
        }
        const base = baselineByPath.get(entry.path);
        if (!base) {
          reasons.push(`归属外新增路径: ${entry.path}`);
        } else if (base.digest !== entry.digest || base.type !== entry.type) {
          reasons.push(`归属外路径发生变化: ${entry.path}`);
        }
      }
      for (const entry of baselineManifest) {
        if (targetPaths.has(entry.path)) {
          continue;
        }
        if (!currentByPath.has(entry.path)) {
          reasons.push(`归属外路径被删除: ${entry.path}`);
        }
      }

      return { safe: reasons.length === 0, reasons };
    };

    const rollbackOwnedWrites = async (
      report: WriteExecutionReport,
    ): Promise<{ restoredManifestDigest: Sha256Digest }> => {
      const safety = await classifyRollbackSafety(report);
      if (!safety.safe) {
        failFixture(`不可安全回退，已阻塞：${safety.reasons.join("；")}`);
      }

      for (const target of [...report.targets].reverse()) {
        if (target.state === "untouched") {
          continue;
        }
        const fullPath = join(projectRoot, target.path);
        if (target.existedBefore) {
          if (target.beforeContent === null) {
            failFixture(`归属记录缺失前置内容，无法安全回退: ${target.path}`);
          }
          const tmpPath = `${fullPath}.tmp-wc-rollback`;
          const handle = await open(tmpPath, "w");
          await handle.writeFile(target.beforeContent, "utf8");
          await handle.sync();
          await handle.close();
          await rename(tmpPath, fullPath);
        } else {
          await rm(fullPath, { force: true });
        }
      }

      const restoredManifestDigest = await manifestDigest();
      if (restoredManifestDigest !== baselineManifestDigest) {
        failFixture("回退后 manifest 与基线不一致（fail closed）");
      }
      return { restoredManifestDigest };
    };

    const cleanup = async (): Promise<void> => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      for (const restoration of [...permissionRestorations].reverse()) {
        await chmod(restoration.path, restoration.mode).catch(() => undefined);
      }
      await rm(tempRoot, { force: true, recursive: true });
    };

    return {
      scenarioId: scenario.scenario_id,
      tempRoot,
      projectRoot,
      outsideArea,
      auxiliaryRoots,
      baselineCommit,
      baselineTreeOid,
      baselineManifestDigest,
      applyFaultSetup,
      executeCandidateWrites,
      commitAfterWrites,
      driftBaselineFile,
      computeManifest,
      manifestDigest,
      hasRouteLock,
      resolveWithinRoot,
      classifyRollbackSafety,
      rollbackOwnedWrites,
      cleanup,
    };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    throw error;
  }
}
