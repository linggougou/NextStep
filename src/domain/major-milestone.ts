import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import majorMilestoneSchema from "../../schemas/v1/major-milestone.schema.json" with { type: "json" };
import {
  parseAcceptanceProfileDecision,
  type AcceptanceEvidenceRef,
  type AcceptanceProfileDecision,
  type AcceptanceType,
} from "./acceptance-profile.ts";
import { canonicalizeJson, snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";
import {
  REQUIRED_PC_IDS,
  parseVersionChainResult,
  type RequiredPcId,
  type VersionChainProject,
  type VersionChainResult,
} from "./version-chain.ts";

export const MAJOR_MILESTONE_DEFINITIONS = Object.freeze([
  { milestone_id: "M1.1", version_id: "V1", title: "需求与产品真源运行锁", objective: "在目标项目 fixture 中从模糊想法生成、校验、冻结和恢复需求/产品真源", pc_ids: ["PC-01", "PC-02", "PC-03"] },
  { milestone_id: "M1.2", version_id: "V1", title: "交互载体与技术上游运行锁", objective: "在目标项目 fixture 中裁决载体、建立 Skill 交互真源、校验写入一致性和技术上游", pc_ids: ["PC-04", "PC-05", "PC-06", "PC-07", "PC-08"] },
  { milestone_id: "M2.1", version_id: "V2", title: "版本与大里程碑生成运行链", objective: "在目标项目 fixture 中生成可校验的版本链和大里程碑，并证明 PC 唯一归属", pc_ids: ["PC-09", "PC-10"] },
  { milestone_id: "M2.2", version_id: "V2", title: "小里程碑与任务包边界运行链", objective: "在目标项目 fixture 中生成小里程碑闭环和任务包边界，并证明缺输入时拒绝派发", pc_ids: ["PC-11", "PC-12", "PC-13"] },
  { milestone_id: "M3.1", version_id: "V3", title: "宿主能力与职责隔离运行链", objective: "在目标项目 fixture 中证明主对话、集成、执行职责隔离，宿主能力可裁决", pc_ids: ["PC-14"] },
  { milestone_id: "M3.2", version_id: "V3", title: "候选验证与正式提升运行链", objective: "在目标项目 fixture 中证明不可变候选、五类结论、最终复验、审计锚和 CAS", pc_ids: ["PC-15", "PC-16"] },
  { milestone_id: "M3.3", version_id: "V3", title: "变更、失败退回与恢复运行链", objective: "在目标项目 fixture 中证明新需求、失败、技术风险和会话丢失能回到正确节点", pc_ids: ["PC-17", "PC-18"] },
  { milestone_id: "M4.1", version_id: "V4", title: "量化指标与验收矩阵运行链", objective: "在目标项目 fixture 中计算指标、反扫矩阵并证明全部风险有承接位置", pc_ids: ["PC-19"] },
  { milestone_id: "M4.2", version_id: "V4", title: "Final Acceptance 与关闭运行链", objective: "在目标项目 fixture 中分开判定完整项目完成、交付证据、宿主归档和用户关闭确认", pc_ids: ["PC-20"] },
] as const);

export type MajorMilestoneId = (typeof MAJOR_MILESTONE_DEFINITIONS)[number]["milestone_id"];
export type MajorMilestoneVersionId = (typeof MAJOR_MILESTONE_DEFINITIONS)[number]["version_id"];

export interface MajorMilestoneDeliverable {
  readonly deliverable_id: string;
  readonly description: string;
}

export type MajorMilestoneAcceptance =
  | { readonly acceptance_type: Exclude<AcceptanceType, "ui_restoration">; readonly applicability: "all-routes" }
  | {
      readonly acceptance_type: "ui_restoration";
      readonly applicability: "ui-only";
      readonly ui_design_source: AcceptanceEvidenceRef;
      readonly ui_restoration_evidence: readonly AcceptanceEvidenceRef[];
    };

export interface MajorMilestone {
  readonly milestone_id: MajorMilestoneId;
  readonly version_id: MajorMilestoneVersionId;
  readonly title: string;
  readonly objective: string;
  readonly pc_ids: readonly RequiredPcId[];
  readonly deliverables: readonly MajorMilestoneDeliverable[];
  readonly acceptances: readonly MajorMilestoneAcceptance[];
}

export interface MajorMilestoneCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "major-milestone-candidate";
  readonly project: VersionChainProject;
  readonly version_chain: VersionChainResult;
  readonly acceptance_profile: AcceptanceProfileDecision;
  readonly milestones: readonly MajorMilestone[];
  readonly summary: {
    readonly milestone_count: number;
    readonly scope_pc_count: number;
    readonly duplicate_scope_pc_count: number;
    readonly deliverable_count: number;
  };
}

export interface MajorMilestonePlan {
  readonly schema_version: "1.0";
  readonly record_type: "major-milestone-plan";
  readonly status: "ACCEPTED";
  readonly project: VersionChainProject;
  readonly version_chain: VersionChainResult;
  readonly acceptance_profile: AcceptanceProfileDecision;
  readonly milestones: readonly MajorMilestone[];
  readonly scope_matrix: readonly {
    readonly pc_id: RequiredPcId;
    readonly milestone_id: MajorMilestoneId;
    readonly primary_version: MajorMilestoneVersionId;
  }[];
  readonly candidate_digest: Sha256Digest;
  readonly metrics: {
    readonly milestones: { readonly actual: number; readonly required: 9 };
    readonly scope_pc: { readonly assigned: number; readonly required: 20; readonly duplicates: number; readonly missing: number };
    readonly deliverables: { readonly total: number; readonly unique: number };
    readonly acceptances_per_milestone: number;
  };
}

export type MajorMilestoneReasonCode =
  | "INVALID_MAJOR_MILESTONE" | "SENSITIVE_INPUT" | "UPSTREAM_VERSION_CHAIN_INVALID"
  | "UPSTREAM_PROFILE_INVALID" | "PROJECT_BINDING_MISMATCH" | "DUPLICATE_MILESTONE"
  | "MILESTONE_ORDER_MISMATCH" | "MILESTONE_VERSION_MISMATCH" | "UNKNOWN_PC"
  | "MISSING_SCOPE_PC" | "DUPLICATE_SCOPE_PC" | "PC_MILESTONE_MISMATCH"
  | "DUPLICATE_DELIVERABLE" | "PROFILE_CONFLICT" | "SUMMARY_MISMATCH"
  | "RESULT_INTEGRITY_MISMATCH";

export interface MajorMilestoneReason {
  readonly code: MajorMilestoneReasonCode;
  readonly path: string;
  readonly message: string;
}

function sortReasons(reasons: readonly MajorMilestoneReason[]): readonly MajorMilestoneReason[] {
  return Object.freeze([...reasons].sort((left, right) => {
    const leftKey = `${left.code}\u0000${left.path}\u0000${left.message}`;
    const rightKey = `${right.code}\u0000${right.path}\u0000${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }).map((reason) => Object.freeze({ ...reason })));
}

export class MajorMilestoneError extends Error {
  readonly reasons: readonly MajorMilestoneReason[];
  constructor(reasons: readonly MajorMilestoneReason[]) {
    super("Major milestone plan rejected");
    this.reasons = sortReasons(reasons);
  }
}

function reject(code: MajorMilestoneReasonCode, path: string, message: string): never {
  throw new MajorMilestoneError([{ code, path, message }]);
}

const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: false, coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true });
const validateCandidate: ValidateFunction<MajorMilestoneCandidate> = ajv.compile<MajorMilestoneCandidate>(majorMilestoneSchema);

function safeValue(value: unknown): JsonValue {
  let snapshot: JsonValue;
  try { snapshot = snapshotJsonValue(value); }
  catch { reject("INVALID_MAJOR_MILESTONE", "$", "Candidate must be safe JSON"); }
  try { assertNoSensitiveFields(snapshot); assertNoSensitiveContent(snapshot); }
  catch { reject("SENSITIVE_INPUT", "$", "Candidate contains sensitive input"); }
  return snapshot;
}

function schemaReasons(errors: readonly ErrorObject[]): readonly MajorMilestoneReason[] {
  return errors.map((error) => ({ code: "INVALID_MAJOR_MILESTONE", path: error.instancePath || "$", message: `Schema keyword rejected: ${error.keyword}` }));
}

function expectedAcceptances(profile: AcceptanceProfileDecision): readonly MajorMilestoneAcceptance[] {
  const result: MajorMilestoneAcceptance[] = profile.enabled_acceptances
    .filter((type): type is Exclude<AcceptanceType, "ui_restoration"> => type !== "ui_restoration")
    .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" }));
  if (profile.route.kind === "ui" && profile.ui_requirements.status === "required") {
    result.push({
      acceptance_type: "ui_restoration",
      applicability: "ui-only",
      ui_design_source: profile.ui_requirements.ui_design_source,
      ui_restoration_evidence: profile.ui_requirements.ui_restoration_evidence,
    });
  }
  return result;
}

function semanticReasons(candidate: MajorMilestoneCandidate, chain: VersionChainResult, profile: AcceptanceProfileDecision): readonly MajorMilestoneReason[] {
  const reasons: MajorMilestoneReason[] = [];
  const milestoneCounts = new Map<string, number>();
  const scopeOwners = new Map<string, string[]>();
  const deliverableCounts = new Map<string, number>();
  const expectedAcceptanceJson = canonicalizeJson(expectedAcceptances(profile));
  candidate.milestones.forEach((milestone, index) => {
    milestoneCounts.set(milestone.milestone_id, (milestoneCounts.get(milestone.milestone_id) ?? 0) + 1);
    const expected = MAJOR_MILESTONE_DEFINITIONS[index];
    if (expected === undefined || milestone.milestone_id !== expected.milestone_id) {
      reasons.push({ code: "MILESTONE_ORDER_MISMATCH", path: `/milestones/${index}/milestone_id`, message: "Milestone order must be M1.1 through M4.2" });
    }
    if (expected !== undefined && milestone.version_id !== expected.version_id) {
      reasons.push({ code: "MILESTONE_VERSION_MISMATCH", path: `/milestones/${index}/version_id`, message: "Milestone version differs from P3" });
    }
    if (expected !== undefined && (milestone.title !== expected.title || milestone.objective !== expected.objective)) {
      reasons.push({ code: "PC_MILESTONE_MISMATCH", path: `/milestones/${index}`, message: "Milestone identity fields differ from P3" });
    }
    if (expected !== undefined && canonicalizeJson(milestone.pc_ids) !== canonicalizeJson(expected.pc_ids)) {
      reasons.push({ code: "PC_MILESTONE_MISMATCH", path: `/milestones/${index}/pc_ids`, message: "Milestone PC scope differs from P3" });
    }
    milestone.pc_ids.forEach((pcId) => {
      const owners = scopeOwners.get(pcId) ?? [];
      owners.push(milestone.milestone_id);
      scopeOwners.set(pcId, owners);
    });
    milestone.deliverables.forEach(({ deliverable_id }) => deliverableCounts.set(deliverable_id, (deliverableCounts.get(deliverable_id) ?? 0) + 1));
    if (canonicalizeJson(milestone.acceptances) !== expectedAcceptanceJson) {
      reasons.push({ code: "PROFILE_CONFLICT", path: `/milestones/${index}/acceptances`, message: "Milestone acceptances differ from accepted Profile" });
    }
  });
  for (const [milestoneId, count] of milestoneCounts) {
    if (count > 1) reasons.push({ code: "DUPLICATE_MILESTONE", path: "/milestones", message: `Milestone occurs more than once: ${milestoneId}` });
  }
  const knownPc = new Set<string>(REQUIRED_PC_IDS);
  for (const [pcId, owners] of scopeOwners) {
    if (!knownPc.has(pcId)) reasons.push({ code: "UNKNOWN_PC", path: "/milestones", message: `Unknown scope PC: ${pcId}` });
    if (owners.length > 1) reasons.push({ code: "DUPLICATE_SCOPE_PC", path: "/milestones", message: `PC occurs in multiple milestones: ${pcId}` });
  }
  for (const pcId of REQUIRED_PC_IDS) {
    if (!scopeOwners.has(pcId)) reasons.push({ code: "MISSING_SCOPE_PC", path: "/milestones", message: `PC is missing from milestone scope: ${pcId}` });
  }
  for (const [deliverableId, count] of deliverableCounts) {
    if (count > 1) reasons.push({ code: "DUPLICATE_DELIVERABLE", path: "/milestones", message: `Deliverable ID is not globally unique: ${deliverableId}` });
  }
  const ownerByPc = new Map(chain.ownership_matrix.map(({ pc_id, primary_version }) => [pc_id, primary_version]));
  candidate.milestones.forEach((milestone, index) => milestone.pc_ids.forEach((pcId) => {
    if (knownPc.has(pcId) && ownerByPc.get(pcId as RequiredPcId) !== milestone.version_id) {
      reasons.push({ code: "MILESTONE_VERSION_MISMATCH", path: `/milestones/${index}/pc_ids`, message: `PC primary version conflicts with S2.1: ${pcId}` });
    }
  }));
  const scopeCount = candidate.milestones.reduce((total, item) => total + item.pc_ids.length, 0);
  const duplicateCount = [...scopeOwners.values()].reduce((total, owners) => total + Math.max(0, owners.length - 1), 0);
  const deliverableCount = candidate.milestones.reduce((total, item) => total + item.deliverables.length, 0);
  const expectedSummary = { milestone_count: candidate.milestones.length, scope_pc_count: scopeCount, duplicate_scope_pc_count: duplicateCount, deliverable_count: deliverableCount };
  for (const field of Object.keys(expectedSummary) as Array<keyof typeof expectedSummary>) {
    if (candidate.summary[field] !== expectedSummary[field]) reasons.push({ code: "SUMMARY_MISMATCH", path: `/summary/${field}`, message: `Summary differs from computed ${field}` });
  }
  return reasons;
}

function parseUpstreams(candidate: MajorMilestoneCandidate): { chain: VersionChainResult; profile: AcceptanceProfileDecision } {
  let chain: VersionChainResult;
  let profile: AcceptanceProfileDecision;
  try { chain = parseVersionChainResult(candidate.version_chain); }
  catch { reject("UPSTREAM_VERSION_CHAIN_INVALID", "/version_chain", "Version chain failed authoritative validation"); }
  try { profile = parseAcceptanceProfileDecision(candidate.acceptance_profile); }
  catch { reject("UPSTREAM_PROFILE_INVALID", "/acceptance_profile", "Acceptance Profile failed authoritative validation"); }
  if (profile.status !== "accepted") reject("PROFILE_CONFLICT", "/acceptance_profile/status", "Rejected Profile cannot produce milestones");
  const projectJson = canonicalizeJson(candidate.project);
  if (projectJson !== canonicalizeJson(chain.project) || projectJson !== canonicalizeJson(profile.project)) {
    reject("PROJECT_BINDING_MISMATCH", "/project", "Project identity differs across S2.2 inputs");
  }
  return { chain, profile };
}

export function evaluateMajorMilestonePlan(value: unknown): MajorMilestonePlan {
  const snapshot = safeValue(value);
  if (!isPlainRecord(snapshot)) reject("INVALID_MAJOR_MILESTONE", "$", "Candidate must be an object");
  if (!validateCandidate(snapshot)) throw new MajorMilestoneError(schemaReasons(validateCandidate.errors ?? []));
  const candidate = snapshot as unknown as MajorMilestoneCandidate;
  const { chain, profile } = parseUpstreams(candidate);
  const reasons = semanticReasons(candidate, chain, profile);
  if (reasons.length > 0) throw new MajorMilestoneError(reasons);
  const owner = new Map<string, (typeof MAJOR_MILESTONE_DEFINITIONS)[number]>(
    MAJOR_MILESTONE_DEFINITIONS.flatMap((definition) => definition.pc_ids.map((pcId) => [pcId, definition] as const)),
  );
  const deliverableIds = candidate.milestones.flatMap(({ deliverables }) => deliverables.map(({ deliverable_id }) => deliverable_id));
  return snapshotJsonValue({
    schema_version: "1.0",
    record_type: "major-milestone-plan",
    status: "ACCEPTED",
    project: candidate.project,
    version_chain: chain,
    acceptance_profile: profile,
    milestones: candidate.milestones,
    scope_matrix: REQUIRED_PC_IDS.map((pcId) => ({ pc_id: pcId, milestone_id: owner.get(pcId)!.milestone_id, primary_version: owner.get(pcId)!.version_id })),
    candidate_digest: digestJson(candidate),
    metrics: {
      milestones: { actual: 9, required: 9 },
      scope_pc: { assigned: 20, required: 20, duplicates: 0, missing: 0 },
      deliverables: { total: deliverableIds.length, unique: new Set(deliverableIds).size },
      acceptances_per_milestone: expectedAcceptances(profile).length,
    },
  }) as unknown as MajorMilestonePlan;
}

const RESULT_FIELDS = ["schema_version", "record_type", "status", "project", "version_chain", "acceptance_profile", "milestones", "scope_matrix", "candidate_digest", "metrics"] as const;

export function parseMajorMilestonePlan(value: unknown): MajorMilestonePlan {
  let snapshot: JsonValue;
  try { snapshot = safeValue(value); }
  catch { reject("RESULT_INTEGRITY_MISMATCH", "$", "Result is not safe JSON"); }
  if (!isPlainRecord(snapshot)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result must be an object");
  const actual = Object.keys(snapshot).sort();
  const expected = [...RESULT_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index]) || snapshot.record_type !== "major-milestone-plan" || snapshot.status !== "ACCEPTED") {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Result fields or status differ");
  }
  const metrics = snapshot.metrics;
  if (!isPlainRecord(metrics) || !isPlainRecord(metrics.milestones) || !isPlainRecord(metrics.scope_pc) || !isPlainRecord(metrics.deliverables)) {
    reject("RESULT_INTEGRITY_MISMATCH", "/metrics", "Result metrics are invalid");
  }
  const candidate = {
    schema_version: snapshot.schema_version,
    record_type: "major-milestone-candidate",
    project: snapshot.project,
    version_chain: snapshot.version_chain,
    acceptance_profile: snapshot.acceptance_profile,
    milestones: snapshot.milestones,
    summary: {
      milestone_count: metrics.milestones.actual,
      scope_pc_count: metrics.scope_pc.assigned,
      duplicate_scope_pc_count: metrics.scope_pc.duplicates,
      deliverable_count: metrics.deliverables.total,
    },
  };
  let restored: MajorMilestonePlan;
  try { restored = evaluateMajorMilestonePlan(candidate); }
  catch { reject("RESULT_INTEGRITY_MISMATCH", "$", "Result cannot restore a valid candidate"); }
  if (canonicalizeJson(snapshot) !== canonicalizeJson(restored)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result digest, matrix or metrics differ");
  return restored;
}
