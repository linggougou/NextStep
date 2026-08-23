import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import architectureRiskAssessmentSchema from "../../schemas/v1/architecture-risk-assessment.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { assertSupportedContractVersion } from "./contract-version.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { GATE_CONCLUSIONS, type GateConclusion } from "./gate-conclusion.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

// S1.6 只消费 F15 的已会签技术真源；不会探测宿主、修改项目、移动 formal/control，
// 也不会把 manual-isolated 合同包装为 full 支持。
export const S1_6_FORMAL_BASELINE = "7169e9b019fe2213ca76babb4122a84760bdf112" as const;
export const ARCHITECTURE_RISK_STAGE = "S5/P5/V1/M1.2/S1.6/PC-08" as const;
export const ARCHITECTURE_RISK_EVIDENCE_SCOPE = "manual-isolated consumer contract" as const;

export const ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS = [
  "technical_goal",
  "candidate_technology_stacks",
  "rejection_reasons",
  "data_model_draft",
  "phase_gate_model",
  "state_machine_model",
  "ai_interaction_boundary",
  "permissions_and_data_safety",
  "risk_validation_plan",
  "rollback_plan",
] as const;
export type ArchitectureRiskRequiredFieldKey = (typeof ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS)[number];

export const ARCHITECTURE_RISK_PROJECT_FIXTURES = [
  {
    project_id: "community-workshop",
    scenario_id: "wc-community-workshop-positive-001",
    record_digest: "sha256:439968591d6272e6ebfe97dc5343ecb3cfdb52e34aa87c6e5c31c6f1668cd96f",
  },
  {
    project_id: "expense-reminder",
    scenario_id: "wc-expense-reminder-positive-002",
    record_digest: "sha256:ad53d318bc91123c236600ddf9353ee87eaca4688435ca85674f61192676b750",
  },
  {
    project_id: "project-delivery-tool",
    scenario_id: "wc-project-delivery-tool-positive-003",
    record_digest: "sha256:93a5624300700739f5b047da887b29bf2672d2acda86534f287c11ef3a5e1b2a",
  },
] as const;
export type ArchitectureRiskProjectBinding = (typeof ARCHITECTURE_RISK_PROJECT_FIXTURES)[number];

export const ARCHITECTURE_RISK_SOURCE_BINDINGS = [
  {
    source_id: "005",
    source_ref: "docs/product-specs/005-stage-document-contracts.md §4.2",
    source_raw_sha256: "sha256:d406d2817647b7ddf9286bb285a4b2796736b24b705d57fdd9d2619fd249f586",
    signed_off: true,
  },
  {
    source_id: "009",
    source_ref: "docs/architecture/009-s4-technical-input-supplement.md §7",
    source_raw_sha256: "sha256:51f129d29285bc068674e3b5ade511b5df199a682f0e0ba35464198252730886",
    signed_off: true,
  },
  {
    source_id: "S4",
    source_ref: "docs/architecture/s4-technical-architecture.md §18",
    source_raw_sha256: "sha256:60a354a73c1f1df22c9cf26f81a68c44dab593682302d219588aa8ae62a2ea4c",
    signed_off: true,
  },
  {
    source_id: "P3",
    source_ref: "docs/exec-plans/completed/p3-version-and-milestone-breakdown.md S1.6",
    source_raw_sha256: "sha256:4e8f658d6bd3151211df4b9c5c1112502e836cd97e0a9ca914cf38424901fc4c",
    signed_off: true,
  },
  {
    source_id: "P4",
    source_ref: "docs/design-docs/p4-execution-mechanism-design.md",
    source_raw_sha256: "sha256:edd41dc218f14ba2ae5b0766b6572b528f15e4cf86aafde77e0c2a8789521c75",
    signed_off: true,
  },
] as const;
export type ArchitectureRiskSourceBinding = (typeof ARCHITECTURE_RISK_SOURCE_BINDINGS)[number];

export const ARCHITECTURE_RISK_ROLLBACK_CATALOG = [
  {
    rollback_id: "stop-auto-write-and-enter-change-request",
    trigger: "typescript-runtime-failure",
    terminal_state: "停止自动写入",
    next_action: "进入 Change Request",
    proof_expectation: "固定失败回执且 formal/control/工作树不变",
  },
  {
    rollback_id: "manual-isolated-fallback",
    trigger: "adapter-failure",
    terminal_state: "manual-isolated",
    next_action: "切换人工计划隔离执行",
    proof_expectation: "adapter 拒绝证据与降级模式回执",
  },
  {
    rollback_id: "blocked-await-external-proof",
    trigger: "ledger-undecidable",
    terminal_state: "blocked",
    next_action: "等待外部证据或人工裁决",
    proof_expectation: "缺失或矛盾台账证据且无状态提升",
  },
  {
    rollback_id: "awaiting-formal-promotion",
    trigger: "promotion-unverifiable",
    terminal_state: "待正式提升",
    next_action: "保留候选并停止自动 CAS",
    proof_expectation: "候选与锚证据保留且 formal 不变",
  },
  {
    rollback_id: "awaiting-archive",
    trigger: "archive-failure",
    terminal_state: "待归档",
    next_action: "重试或人工归档",
    proof_expectation: "正式结论与 formal 不变且归档失败可追溯",
  },
] as const;
export type ArchitectureRiskRollbackEntry = (typeof ARCHITECTURE_RISK_ROLLBACK_CATALOG)[number];
export type ArchitectureRiskRollbackId = ArchitectureRiskRollbackEntry["rollback_id"];

const S4_RAW_SHA = ARCHITECTURE_RISK_SOURCE_BINDINGS[2].source_raw_sha256;
const S009_RAW_SHA = ARCHITECTURE_RISK_SOURCE_BINDINGS[1].source_raw_sha256;
const S4_PATH = "docs/architecture/s4-technical-architecture.md";
const S009_PATH = "docs/architecture/009-s4-technical-input-supplement.md";

function riskSourceRef(path: string, section: string, rowLabel: string): string {
  return `${path} §${section} 行：${rowLabel}`;
}

function risk(
  riskId: string,
  sourceId: "S4" | "009",
  section: string,
  rowLabel: string,
  tgBindings: readonly string[],
  ownerMilestone: string,
  rollbackEntryId: ArchitectureRiskRollbackId,
) {
  const path = sourceId === "S4" ? S4_PATH : S009_PATH;
  return Object.freeze({
    risk_id: riskId,
    source_id: sourceId,
    section,
    row_label: rowLabel,
    source_ref: riskSourceRef(path, section, rowLabel),
    source_raw_sha256: sourceId === "S4" ? S4_RAW_SHA : S009_RAW_SHA,
    tg_bindings: Object.freeze([...tgBindings]),
    owner_milestone: ownerMilestone,
    rollback_entry_id: rollbackEntryId,
  });
}

export const ARCHITECTURE_RISK_CATALOG = Object.freeze([
  risk("project-root-resolution-correct", "S4", "18", "项目根解析正确", ["TG-01", "TG-05", "TG-19"], "S3.1", "manual-isolated-fallback"),
  risk("worktree-start-exact", "S4", "18", "worktree 起点精确", ["TG-05", "TG-08", "TG-16", "TG-19"], "S3.3", "stop-auto-write-and-enter-change-request"),
  risk("read-only-verification-effective", "S4", "18", "只读验证有效", ["TG-08", "TG-13", "TG-19"], "S3.3", "manual-isolated-fallback"),
  risk("task-creation-idempotent", "S4", "18", "任务创建幂等", ["TG-05", "TG-09", "TG-19"], "S3.2", "blocked-await-external-proof"),
  risk("control-ref-single-writer-fencing", "S4", "18", "控制 ref 单写与 fencing", ["TG-09", "TG-10", "TG-19"], "S3.2", "stop-auto-write-and-enter-change-request"),
  risk("host-receiver-atomic-idempotence", "S4", "18", "宿主接收端原子幂等", ["TG-05", "TG-09", "TG-19"], "S3.2", "manual-isolated-fallback"),
  risk("control-ledger-corruption", "S4", "18", "控制台账损坏", ["TG-10", "TG-15", "TG-17", "TG-19"], "S3.5", "blocked-await-external-proof"),
  risk("control-generation-monotonicity", "S4", "18", "控制代际单调", ["TG-10", "TG-19"], "S3.5", "blocked-await-external-proof"),
  risk("multi-file-logical-atomicity", "S4", "18", "多文件逻辑原子", ["TG-11", "TG-17", "TG-19"], "S1.5", "stop-auto-write-and-enter-change-request"),
  risk("final-verification-precision", "S4", "18", "最终复验精确", ["TG-13", "TG-14", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("credential-and-proof-no-replace", "S4", "18", "凭证与证明不可替换", ["TG-14", "TG-16", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("credential-crash-durability", "S4", "18", "凭证崩溃持久性", ["TG-14", "TG-16", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("audit-anchor-allowlist", "S4", "18", "审计锚白名单", ["TG-14", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("cas-race-safety", "S4", "18", "CAS 竞争安全", ["TG-12", "TG-14", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("formal-history-continuity", "S4", "18", "正式历史连续", ["TG-14", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("formal-ref-worktree-separation", "S4", "18", "正式 ref 与工作树分离", ["TG-12", "TG-19"], "S3.4", "awaiting-formal-promotion"),
  risk("acceptance-profile-correctness", "S4", "18", "验收配置正确", ["TG-04", "TG-19"], "S1.4", "manual-isolated-fallback"),
  risk("recovery-independent-of-chat", "S4", "18", "恢复不依赖聊天", ["TG-15", "TG-17", "TG-19"], "S3.5", "blocked-await-external-proof"),
  risk("sensitive-information-not-persisted", "S4", "18", "敏感信息不落盘", ["TG-16", "TG-19"], "S3.2", "stop-auto-write-and-enter-change-request"),
  risk("archive-failure", "009", "7", "归档失败", ["TG-18", "TG-19"], "S4.3", "awaiting-archive"),
]);
export type ArchitectureRiskCatalogEntry = (typeof ARCHITECTURE_RISK_CATALOG)[number];

export interface ArchitectureRiskRequiredFieldBinding {
  readonly binding_key: ArchitectureRiskRequiredFieldKey;
  readonly source_ref: string;
  readonly source_raw_sha256: Sha256Digest;
  readonly binding_status: "bound";
}

export interface ArchitectureRiskTechnicalStack {
  readonly recommended: string;
  readonly alternatives: readonly string[];
  readonly rejection_reasons: readonly string[];
}

export interface ArchitectureRiskModel {
  readonly data_models: readonly string[];
  readonly phase_gate_states: readonly GateConclusion[];
  readonly state_machine_model: string;
  readonly ai_interaction_boundary: string;
  readonly permissions_and_data_safety: string;
}

export interface ArchitectureRiskBinding extends ArchitectureRiskCatalogEntry {
  readonly validation_method: string;
  readonly failure_standard: string;
  readonly failure_handling: string;
}

export interface ArchitectureRiskScope {
  readonly support_level: "manual-isolated" | "full";
  readonly interaction_profile: "headless" | "ui";
  readonly web_ui: boolean;
  readonly database: boolean;
  readonly persistent_service: boolean;
  readonly p4_api_schema_frozen: boolean;
}

export interface ArchitectureRiskAssessmentCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "architecture-risk-assessment-candidate";
  readonly project: ArchitectureRiskProjectBinding;
  readonly stage: typeof ARCHITECTURE_RISK_STAGE;
  readonly formal_baseline: typeof S1_6_FORMAL_BASELINE;
  readonly evidence_scope: typeof ARCHITECTURE_RISK_EVIDENCE_SCOPE;
  readonly project_fixture_bindings: readonly ArchitectureRiskProjectBinding[];
  readonly upstream_source_bindings: readonly ArchitectureRiskSourceBinding[];
  readonly required_field_bindings: readonly ArchitectureRiskRequiredFieldBinding[];
  readonly technical_stack: ArchitectureRiskTechnicalStack;
  readonly architecture_model: ArchitectureRiskModel;
  readonly risk_bindings: readonly ArchitectureRiskBinding[];
  readonly rollback_entries: readonly ArchitectureRiskRollbackEntry[];
  readonly scope: ArchitectureRiskScope;
}

export interface ArchitectureRiskAssessmentMetrics {
  readonly required_fields: { readonly bound: 10; readonly total: 10; readonly percentage: 100 };
  readonly risks: { readonly bound: 20; readonly total: 20; readonly percentage: 100 };
  readonly rollback_entries: { readonly bound: 5; readonly total: 5 };
}

export interface ArchitectureRiskAssessment
  extends Omit<ArchitectureRiskAssessmentCandidate, "record_type"> {
  readonly record_type: "architecture-risk-assessment";
  readonly status: "ACCEPTED";
  readonly conclusion: "通过";
  readonly candidate_digest: Sha256Digest;
  readonly metrics: ArchitectureRiskAssessmentMetrics;
}

export type ArchitectureRiskAssessmentErrorCode =
  | "INVALID_ARCHITECTURE_RISK_ASSESSMENT"
  | "SENSITIVE_CONTENT_DETECTED"
  | "FORMAL_BASELINE_MISMATCH"
  | "STAGE_MISMATCH"
  | "PROJECT_BINDING_MISMATCH"
  | "SOURCE_BINDING_MISMATCH"
  | "REQUIRED_FIELD_SET_MISMATCH"
  | "RISK_SET_MISMATCH"
  | "RISK_BINDING_MISMATCH"
  | "ROLLBACK_SET_MISMATCH"
  | "OUT_OF_SCOPE_CAPABILITY"
  | "ASSESSMENT_INTEGRITY_MISMATCH";

export class ArchitectureRiskAssessmentError extends Error {
  readonly code: ArchitectureRiskAssessmentErrorCode;

  constructor(code: ArchitectureRiskAssessmentErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCandidate: ValidateFunction = ajv.compile(architectureRiskAssessmentSchema);

const CANDIDATE_FIELDS = [
  "schema_version", "record_type", "project", "stage", "formal_baseline", "evidence_scope",
  "project_fixture_bindings", "upstream_source_bindings", "required_field_bindings",
  "technical_stack", "architecture_model", "risk_bindings", "rollback_entries", "scope",
] as const;
const ASSESSMENT_FIELDS = [
  ...CANDIDATE_FIELDS,
  "status", "conclusion", "candidate_digest", "metrics",
] as const;
const DATA_MODELS = ["Project", "Stage", "Deliverable", "Change Request", "Milestone"] as const;

function fail(code: ArchitectureRiskAssessmentErrorCode, message: string): never {
  throw new ArchitectureRiskAssessmentError(code, message);
}

function exact(value: unknown, expected: unknown): boolean {
  return canonicalizeJson(value) === canonicalizeJson(expected);
}

function schemaErrorCode(errors: ErrorObject[] | null | undefined): ArchitectureRiskAssessmentErrorCode {
  const paths = (errors ?? []).map((error) => error.instancePath);
  if (paths.some((path) => path.startsWith("/scope") || path === "/evidence_scope")) return "OUT_OF_SCOPE_CAPABILITY";
  if (paths.some((path) => path.startsWith("/risk_bindings"))) return "RISK_BINDING_MISMATCH";
  if (paths.some((path) => path.startsWith("/rollback_entries"))) return "ROLLBACK_SET_MISMATCH";
  if (paths.some((path) => path.startsWith("/required_field_bindings"))) return "REQUIRED_FIELD_SET_MISMATCH";
  return "INVALID_ARCHITECTURE_RISK_ASSESSMENT";
}

function scanCandidate(value: unknown): JsonValue {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_ARCHITECTURE_RISK_ASSESSMENT", "架构风险候选必须是安全的 JSON 值");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "架构风险候选包含敏感字段或内容");
  }
  return snapshot;
}

function assertExactOrderedSet(
  actual: readonly unknown[],
  expected: readonly unknown[],
  code: ArchitectureRiskAssessmentErrorCode,
  label: string,
): void {
  if (!exact(actual, expected)) fail(code, `${label} 与冻结契约不一致`);
}

function assertCandidateSemantics(candidate: ArchitectureRiskAssessmentCandidate): void {
  if (candidate.stage !== ARCHITECTURE_RISK_STAGE) {
    fail("STAGE_MISMATCH", "架构风险候选未绑定 S1.6/PC-08 阶段");
  }
  if (candidate.formal_baseline !== S1_6_FORMAL_BASELINE) {
    fail("FORMAL_BASELINE_MISMATCH", "架构风险候选未绑定 F15");
  }
  if (candidate.evidence_scope !== ARCHITECTURE_RISK_EVIDENCE_SCOPE) {
    fail("OUT_OF_SCOPE_CAPABILITY", "证据范围必须是 manual-isolated consumer contract");
  }
  if (
    candidate.scope.support_level !== "manual-isolated" ||
    candidate.scope.interaction_profile !== "headless" ||
    candidate.scope.web_ui ||
    candidate.scope.database ||
    candidate.scope.persistent_service ||
    candidate.scope.p4_api_schema_frozen
  ) {
    fail("OUT_OF_SCOPE_CAPABILITY", "候选包含 S1.6 非目标能力");
  }

  assertExactOrderedSet(
    candidate.project_fixture_bindings,
    ARCHITECTURE_RISK_PROJECT_FIXTURES,
    "PROJECT_BINDING_MISMATCH",
    "三类项目 fixture 绑定",
  );
  const activeProject = ARCHITECTURE_RISK_PROJECT_FIXTURES.find(
    ({ project_id }) => project_id === candidate.project.project_id,
  );
  if (activeProject === undefined || !exact(candidate.project, activeProject)) {
    fail("PROJECT_BINDING_MISMATCH", "活动项目与冻结 fixture 身份不一致");
  }

  assertExactOrderedSet(
    candidate.upstream_source_bindings,
    ARCHITECTURE_RISK_SOURCE_BINDINGS,
    "SOURCE_BINDING_MISMATCH",
    "五份已会签上游",
  );

  const requiredKeys = candidate.required_field_bindings.map(({ binding_key }) => binding_key);
  assertExactOrderedSet(
    requiredKeys,
    ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS,
    "REQUIRED_FIELD_SET_MISMATCH",
    "十类架构字段",
  );
  const fieldSource = ARCHITECTURE_RISK_SOURCE_BINDINGS[0];
  for (const binding of candidate.required_field_bindings) {
    if (
      binding.binding_status !== "bound" ||
      binding.source_ref !== `${fieldSource.source_ref} / ${binding.binding_key}` ||
      binding.source_raw_sha256 !== fieldSource.source_raw_sha256
    ) {
      fail("REQUIRED_FIELD_SET_MISMATCH", `字段 ${binding.binding_key} 未精确绑定 005`);
    }
  }

  assertExactOrderedSet(candidate.architecture_model.data_models, DATA_MODELS, "REQUIRED_FIELD_SET_MISMATCH", "数据模型");
  assertExactOrderedSet(candidate.architecture_model.phase_gate_states, GATE_CONCLUSIONS, "REQUIRED_FIELD_SET_MISMATCH", "四态门禁");

  assertExactOrderedSet(
    candidate.rollback_entries,
    ARCHITECTURE_RISK_ROLLBACK_CATALOG,
    "ROLLBACK_SET_MISMATCH",
    "五类回滚入口",
  );

  const riskIds = candidate.risk_bindings.map(({ risk_id }) => risk_id);
  assertExactOrderedSet(
    riskIds,
    ARCHITECTURE_RISK_CATALOG.map(({ risk_id }) => risk_id),
    "RISK_SET_MISMATCH",
    "二十项风险",
  );
  for (let index = 0; index < ARCHITECTURE_RISK_CATALOG.length; index += 1) {
    const expected = ARCHITECTURE_RISK_CATALOG[index]!;
    const actual = candidate.risk_bindings[index]!;
    const projection = {
      risk_id: actual.risk_id,
      source_id: actual.source_id,
      section: actual.section,
      row_label: actual.row_label,
      source_ref: actual.source_ref,
      source_raw_sha256: actual.source_raw_sha256,
      tg_bindings: actual.tg_bindings,
      owner_milestone: actual.owner_milestone,
      rollback_entry_id: actual.rollback_entry_id,
    };
    if (!exact(projection, expected)) {
      fail("RISK_BINDING_MISMATCH", `风险 ${actual.risk_id} 的 source/TG/owner/rollback 绑定漂移`);
    }
  }
}

function metrics(): ArchitectureRiskAssessmentMetrics {
  return Object.freeze({
    required_fields: Object.freeze({ bound: 10 as const, total: 10 as const, percentage: 100 as const }),
    risks: Object.freeze({ bound: 20 as const, total: 20 as const, percentage: 100 as const }),
    rollback_entries: Object.freeze({ bound: 5 as const, total: 5 as const }),
  });
}

export function evaluateArchitectureRiskAssessment(value: unknown): ArchitectureRiskAssessment {
  const snapshot = scanCandidate(value);
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_ARCHITECTURE_RISK_ASSESSMENT", "架构风险候选必须是普通对象");
  }
  try {
    assertSupportedContractVersion(snapshot.schema_version);
  } catch {
    fail("INVALID_ARCHITECTURE_RISK_ASSESSMENT", "架构风险候选版本不受支持");
  }
  if (!validateCandidate(snapshot)) {
    const code = schemaErrorCode(validateCandidate.errors);
    fail(code, `架构风险候选未通过 Schema：${ajv.errorsText(validateCandidate.errors, { separator: "; " })}`);
  }
  const candidate = snapshot as unknown as ArchitectureRiskAssessmentCandidate;
  assertCandidateSemantics(candidate);
  return Object.freeze({
    ...candidate,
    record_type: "architecture-risk-assessment" as const,
    status: "ACCEPTED" as const,
    conclusion: "通过" as const,
    candidate_digest: digestJson(snapshot),
    metrics: metrics(),
  });
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估输出字段与冻结契约不一致");
  }
}

export function parseArchitectureRiskAssessment(value: unknown): ArchitectureRiskAssessment {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估输出不是安全 JSON");
  }
  if (!isPlainRecord(snapshot)) {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估输出必须是普通对象");
  }
  assertExactKeys(snapshot, ASSESSMENT_FIELDS);
  if (
    snapshot.record_type !== "architecture-risk-assessment" ||
    snapshot.status !== "ACCEPTED" ||
    snapshot.conclusion !== "通过"
  ) {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估结论不一致");
  }

  const candidateRecord = Object.create(null) as Record<string, JsonValue>;
  for (const field of CANDIDATE_FIELDS) {
    candidateRecord[field] = field === "record_type"
      ? "architecture-risk-assessment-candidate"
      : (snapshot[field] as JsonValue);
  }

  let expected: ArchitectureRiskAssessment;
  try {
    expected = evaluateArchitectureRiskAssessment(candidateRecord);
  } catch {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估无法还原为有效候选");
  }
  if (!exact(snapshot, expected)) {
    fail("ASSESSMENT_INTEGRITY_MISMATCH", "架构风险评估摘要、metrics、结论或 10/20/5 集合不一致");
  }
  return expected;
}
