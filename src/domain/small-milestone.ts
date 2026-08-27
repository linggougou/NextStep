import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import smallMilestoneSchema from "../../schemas/v1/small-milestone.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import {
  MAJOR_MILESTONE_DEFINITIONS,
  parseMajorMilestonePlan,
  type MajorMilestoneId,
  type MajorMilestonePlan,
} from "./major-milestone.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";
import type { VersionChainProject } from "./version-chain.ts";

export const SMALL_MILESTONE_DEFINITIONS = Object.freeze([
  { milestone_id: "S1.1", major_milestone_id: "M1.1", title: "需求入口运行", inputs: "目标项目 fixture、用户想法、002/003/004 作为期望样例", outputs: "可运行入口输出的原始需求、意图、缺口和阻断证据", definition_of_done: "目标、场景、约束、输出、非目标缺口可追溯；不得直接生成开发任务", tests: "目标项目正例/缺字段负例回放", non_goals: "不生成开发任务", depends_on: [], failure_return: "需求入口" },
  { milestone_id: "S1.2", major_milestone_id: "M1.1", title: "需求补全冻结与恢复运行", inputs: "S1.1、用户确认 fixture", outputs: "需求清单、冻结记录、重开恢复行为证据", definition_of_done: "未冻结不得推进；重开后恢复同一冻结状态", tests: "冻结/未冻结/重开目标项目 fixture", non_goals: "不修改已冻结需求", depends_on: ["S1.1"], failure_return: "需求补全或 PC-17" },
  { milestone_id: "S1.3", major_milestone_id: "M1.1", title: "产品定义会签运行", inputs: "冻结需求 fixture、002/003 作为期望样例", outputs: "可运行生成/校验的 PRD、用户旅程、能力映射和会签阻断证据", definition_of_done: "目标用户、范围、非目标、成功指标齐全；缺项阻塞", tests: "PRD 正负例 fixture、005 字段校验", non_goals: "不选技术栈", depends_on: ["S1.2"], failure_return: "产品定义" },
  { milestone_id: "S1.4", major_milestone_id: "M1.2", title: "载体无关原型与 Profile 裁决运行", inputs: "S1.3、006/007/008、三类 Profile fixture", outputs: "原型流程、载体裁决、Profile 适用性校验和冲突拒绝证据", definition_of_done: "目标项目路线决定 Profile；独立任务只提供证据；Web/UI 候选不误入主线", tests: "headless、含 UI、冲突三类 fixture", non_goals: "不建设 NextStep Web/UI", depends_on: ["S1.3"], failure_return: "S3/P2.2" },
  { milestone_id: "S1.5", major_milestone_id: "M1.2", title: "Skill 交互与写入一致性运行", inputs: "S1.4、S3、009、目标项目写入 fixture", outputs: "入口、确认节点、回写、一致性行为证据", definition_of_done: "主对话不读写项目，写入失败不提升状态", tests: "权限和写入故障 fixture", non_goals: "不实现无关适配器", depends_on: ["S1.4"], failure_return: "S3 或 S4" },
  { milestone_id: "S1.6", major_milestone_id: "M1.2", title: "技术架构风险承接运行", inputs: "S1.5、S4 风险 fixture", outputs: "技术架构读取、风险探针绑定和回滚入口行为证据", definition_of_done: "S4 §18 风险均有验证方式和失败处理", tests: "S4 风险映射与失败 fixture", non_goals: "不冻结 P4 API/Schema", depends_on: ["S1.5"], failure_return: "S4" },
  { milestone_id: "S2.1", major_milestone_id: "M2.1", title: "版本链唯一归属运行", inputs: "V1 产物、PC 表、005、P1 示例", outputs: "可运行生成的 V1..V4/FA 归属矩阵和冲突拒绝证据", definition_of_done: "每个 PC 唯一主版本，Backlog 无 PC", tests: "PC 计数、重复、遗漏、Backlog 负例 fixture", non_goals: "不按 MVP 裁剪范围", depends_on: ["S1.6"], failure_return: "P3 版本拆解" },
  { milestone_id: "S2.2", major_milestone_id: "M2.1", title: "大里程碑互斥边界运行", inputs: "S2.1、004/005/008", outputs: "可运行生成的 M1.1..M4.2 和范围冲突证据", definition_of_done: "大里程碑范围互斥，可集成验收", tests: "范围交叉、Profile 冲突和验收类型 fixture", non_goals: "不拆真实任务", depends_on: ["S2.1"], failure_return: "大里程碑拆解" },
  { milestone_id: "S2.3", major_milestone_id: "M2.2", title: "小里程碑闭环与依赖运行", inputs: "S2.2、005", outputs: "可运行生成的小里程碑、依赖图和退回入口", definition_of_done: "每项有输入、输出、DoD、测试、非目标、依赖；依赖无环", tests: "字段完整性、依赖无环/有环 fixture", non_goals: "不执行小里程碑", depends_on: ["S2.2"], failure_return: "小里程碑拆解" },
  { milestone_id: "S2.4", major_milestone_id: "M2.2", title: "任务包生成边界运行", inputs: "S2.3、S4", outputs: "任务包字段、拒绝生成规则和正负例行为证据", definition_of_done: "无小里程碑、缺依赖或缺验收标准时拒绝派发", tests: "任务包正负例 fixture", non_goals: "不生成真实执行任务", depends_on: ["S2.3"], failure_return: "任务包契约" },
  { milestone_id: "S3.1", major_milestone_id: "M3.1", title: "宿主能力预检运行", inputs: "S4、S2.4、宿主 fixture", outputs: "host-bootstrap / project-probe 裁决行为证据", definition_of_done: "full/manual-isolated/blocked 三态可复核", tests: "S4 §18 预检探针 fixture", non_goals: "不声明未验证宿主支持", depends_on: ["S2.4"], failure_return: "宿主预检" },
  { milestone_id: "S3.2", major_milestone_id: "M3.1", title: "职责隔离与幂等分派运行", inputs: "S3.1、S3/S4、分派 fixture", outputs: "主对话/集成/执行职责边界和幂等行为证据", definition_of_done: "主对话最小权限，重复信封不产生重复任务", tests: "权限、ack 丢失、重复信封 fixture", non_goals: "不引入多 Agent 平台", depends_on: ["S3.1"], failure_return: "职责隔离" },
  { milestone_id: "S3.3", major_milestone_id: "M3.2", title: "不可变候选与只读验证运行", inputs: "S3.2、S4、候选 fixture", outputs: "候选摘要、只读验证、树摘要行为证据", definition_of_done: "验证不污染候选，失败不得集成", tests: "dirty、只读、隔离环境 fixture", non_goals: "不批准最终提升", depends_on: ["S3.2"], failure_return: "候选验证" },
  { milestone_id: "S3.4", major_milestone_id: "M3.2", title: "五类结论与正式提升运行", inputs: "S3.3、008/009/S4", outputs: "五类结论、最终快照、凭证、锚、CAS 行为证据", definition_of_done: "自批被拒，旧凭证失效，CAS 竞争保持待提升", tests: "凭证、锚白名单、非快进和并发 fixture", non_goals: "不归档宿主任务为成功", depends_on: ["S3.3"], failure_return: "最终复验/提升" },
  { milestone_id: "S3.5", major_milestone_id: "M3.3", title: "变更分流与恢复运行", inputs: "S3.4、Change Request 入口", outputs: "变更分流、失败退回、恢复检查点行为证据", definition_of_done: "新需求不污染当前闭环；删除聊天仍可恢复", tests: "stale-result、墓碑、缓存删除 fixture", non_goals: "不改历史验收结论", depends_on: ["S3.4"], failure_return: "变更分流/恢复" },
  { milestone_id: "S4.1", major_milestone_id: "M4.1", title: "指标阈值与证据源运行", inputs: "全部 PC/TG、002/003、目标项目证据包", outputs: "指标计算输出、阈值、样例、证据源", definition_of_done: "每项指标可复核且有失败判定", tests: "指标正负例 fixture", non_goals: "不写无证据通过结论", depends_on: ["S3.5"], failure_return: "指标定义" },
  { milestone_id: "S4.2", major_milestone_id: "M4.1", title: "全链路验收矩阵运行", inputs: "S4.1、版本/里程碑运行证据", outputs: "版本/大/小里程碑/验收类型矩阵和反扫报告", definition_of_done: "PC、TG、S4 风险、退回入口双向可追踪", tests: "覆盖矩阵断链 fixture", non_goals: "不替代独立审查", depends_on: ["S4.1"], failure_return: "验收矩阵" },
  { milestone_id: "S4.3", major_milestone_id: "M4.2", title: "Final Acceptance 与关闭运行", inputs: "S4.2、全部版本行为证据", outputs: "FA 报告、交付清单、PC-20.AR、用户关闭确认行为证据", definition_of_done: "全部 PC/TG/风险通过；关闭条件分开判定", tests: "全量反扫、归档失败注入和用户确认 fixture", non_goals: "不把 FA 失败包装完成", depends_on: ["S4.2"], failure_return: "对应版本或 PC-20.AR" },
] as const);

export type SmallMilestoneId = (typeof SMALL_MILESTONE_DEFINITIONS)[number]["milestone_id"];

export interface SmallMilestone {
  readonly milestone_id: SmallMilestoneId;
  readonly major_milestone_id: MajorMilestoneId;
  readonly title: string;
  readonly inputs: string;
  readonly outputs: string;
  readonly definition_of_done: string;
  readonly tests: string;
  readonly non_goals: string;
  readonly depends_on: readonly SmallMilestoneId[];
  readonly failure_return: string;
}

export interface SmallMilestoneDependencyEdge {
  readonly dependency_id: SmallMilestoneId;
  readonly dependent_id: SmallMilestoneId;
}

export interface SmallMilestoneCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "small-milestone-candidate";
  readonly project: VersionChainProject;
  readonly major_milestone_plan: MajorMilestonePlan;
  readonly milestones: readonly SmallMilestone[];
  readonly dependency_edges: readonly SmallMilestoneDependencyEdge[];
  readonly summary: {
    readonly milestone_count: number;
    readonly major_milestone_count: number;
    readonly dependency_edge_count: number;
    readonly root_milestone_id: SmallMilestoneId;
    readonly terminal_milestone_id: SmallMilestoneId;
    readonly cycle_count: number;
  };
}

export interface SmallMilestonePlan {
  readonly schema_version: "1.0";
  readonly record_type: "small-milestone-plan";
  readonly status: "ACCEPTED";
  readonly project: VersionChainProject;
  readonly major_milestone_plan: MajorMilestonePlan;
  readonly milestones: readonly SmallMilestone[];
  readonly ownership_matrix: readonly { readonly milestone_id: SmallMilestoneId; readonly major_milestone_id: MajorMilestoneId }[];
  readonly dependency_graph: { readonly edges: readonly SmallMilestoneDependencyEdge[]; readonly roots: readonly SmallMilestoneId[]; readonly terminals: readonly SmallMilestoneId[] };
  readonly candidate_digest: Sha256Digest;
  readonly metrics: {
    readonly milestones: { readonly actual: number; readonly required: 18 };
    readonly major_milestones: { readonly covered: number; readonly required: 9 };
    readonly dependencies: { readonly actual: number; readonly required: 17; readonly cycles: number };
    readonly roots: { readonly actual: number; readonly required: 1 };
    readonly terminals: { readonly actual: number; readonly required: 1 };
  };
}

export type SmallMilestoneReasonCode =
  | "INVALID_SMALL_MILESTONE" | "SENSITIVE_INPUT" | "UPSTREAM_MAJOR_MILESTONE_INVALID"
  | "PROJECT_BINDING_MISMATCH" | "DUPLICATE_MILESTONE" | "MISSING_MILESTONE"
  | "UNKNOWN_MILESTONE" | "MILESTONE_ORDER_MISMATCH" | "MILESTONE_MAJOR_MISMATCH"
  | "MILESTONE_DEFINITION_MISMATCH" | "UNKNOWN_DEPENDENCY" | "MISSING_DEPENDENCY"
  | "DUPLICATE_DEPENDENCY" | "SELF_DEPENDENCY" | "DEPENDENCY_CYCLE"
  | "DEPENDENCY_GRAPH_MISMATCH" | "SUMMARY_MISMATCH" | "RESULT_INTEGRITY_MISMATCH";

export interface SmallMilestoneReason { readonly code: SmallMilestoneReasonCode; readonly path: string; readonly message: string }

function sortReasons(reasons: readonly SmallMilestoneReason[]): readonly SmallMilestoneReason[] {
  return Object.freeze([...reasons].sort((left, right) => {
    const leftKey = `${left.code}\u0000${left.path}\u0000${left.message}`;
    const rightKey = `${right.code}\u0000${right.path}\u0000${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }).map((reason) => Object.freeze({ ...reason })));
}

export class SmallMilestoneError extends Error {
  readonly reasons: readonly SmallMilestoneReason[];
  constructor(reasons: readonly SmallMilestoneReason[]) { super("Small milestone plan rejected"); this.reasons = sortReasons(reasons); }
}

function reject(code: SmallMilestoneReasonCode, path: string, message: string): never { throw new SmallMilestoneError([{ code, path, message }]); }

const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: false, coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true });
const validateCandidate: ValidateFunction<SmallMilestoneCandidate> = ajv.compile<SmallMilestoneCandidate>(smallMilestoneSchema);
const milestoneIds = new Set<string>(SMALL_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id));
const expectedEdges: readonly SmallMilestoneDependencyEdge[] = Object.freeze(SMALL_MILESTONE_DEFINITIONS.slice(1).map((milestone, index) => Object.freeze({ dependency_id: SMALL_MILESTONE_DEFINITIONS[index]!.milestone_id, dependent_id: milestone.milestone_id })));

function safeValue(value: unknown): JsonValue {
  let snapshot: JsonValue;
  try { snapshot = snapshotJsonValue(value); } catch { reject("INVALID_SMALL_MILESTONE", "$", "Candidate must be safe JSON"); }
  try { assertNoSensitiveFields(snapshot); assertNoSensitiveContent(snapshot); } catch { reject("SENSITIVE_INPUT", "$", "Candidate contains sensitive input"); }
  return snapshot;
}

function schemaReasons(errors: readonly ErrorObject[]): readonly SmallMilestoneReason[] {
  return errors.map((error) => ({ code: "INVALID_SMALL_MILESTONE", path: error.instancePath || "$", message: `Schema keyword rejected: ${error.keyword}` }));
}

function countCycles(edges: readonly SmallMilestoneDependencyEdge[]): number {
  const adjacency = new Map<string, string[]>();
  for (const id of milestoneIds) adjacency.set(id, []);
  for (const edge of edges) if (milestoneIds.has(edge.dependency_id) && milestoneIds.has(edge.dependent_id)) adjacency.get(edge.dependency_id)!.push(edge.dependent_id);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycles = 0;
  const visit = (id: string): void => {
    if (visiting.has(id)) { cycles += 1; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of milestoneIds) visit(id);
  return cycles;
}

function graphFacts(edges: readonly SmallMilestoneDependencyEdge[]): { roots: string[]; terminals: string[]; cycles: number } {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const id of milestoneIds) { incoming.set(id, 0); outgoing.set(id, 0); }
  for (const edge of edges) {
    if (!milestoneIds.has(edge.dependency_id) || !milestoneIds.has(edge.dependent_id)) continue;
    incoming.set(edge.dependent_id, (incoming.get(edge.dependent_id) ?? 0) + 1);
    outgoing.set(edge.dependency_id, (outgoing.get(edge.dependency_id) ?? 0) + 1);
  }
  return {
    roots: SMALL_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id).filter((id) => incoming.get(id) === 0),
    terminals: SMALL_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id).filter((id) => outgoing.get(id) === 0),
    cycles: countCycles(edges),
  };
}

function semanticReasons(candidate: SmallMilestoneCandidate, upstream: MajorMilestonePlan): readonly SmallMilestoneReason[] {
  const reasons: SmallMilestoneReason[] = [];
  const counts = new Map<string, number>();
  candidate.milestones.forEach((milestone, index) => {
    counts.set(milestone.milestone_id, (counts.get(milestone.milestone_id) ?? 0) + 1);
    const expectedAtIndex = SMALL_MILESTONE_DEFINITIONS[index];
    const expectedById = SMALL_MILESTONE_DEFINITIONS.find(({ milestone_id }) => milestone_id === milestone.milestone_id);
    if (expectedById === undefined) reasons.push({ code: "UNKNOWN_MILESTONE", path: `/milestones/${index}/milestone_id`, message: `Unknown small milestone: ${milestone.milestone_id}` });
    if (expectedAtIndex === undefined || milestone.milestone_id !== expectedAtIndex.milestone_id) reasons.push({ code: "MILESTONE_ORDER_MISMATCH", path: `/milestones/${index}/milestone_id`, message: "Small milestone order differs from P3" });
    if (expectedById !== undefined && milestone.major_milestone_id !== expectedById.major_milestone_id) reasons.push({ code: "MILESTONE_MAJOR_MISMATCH", path: `/milestones/${index}/major_milestone_id`, message: "Small milestone major owner differs from P3" });
    if (expectedById !== undefined) {
      const actualDefinition = { title: milestone.title, inputs: milestone.inputs, outputs: milestone.outputs, definition_of_done: milestone.definition_of_done, tests: milestone.tests, non_goals: milestone.non_goals, failure_return: milestone.failure_return };
      const expectedDefinition = { title: expectedById.title, inputs: expectedById.inputs, outputs: expectedById.outputs, definition_of_done: expectedById.definition_of_done, tests: expectedById.tests, non_goals: expectedById.non_goals, failure_return: expectedById.failure_return };
      if (canonicalizeJson(actualDefinition) !== canonicalizeJson(expectedDefinition)) reasons.push({ code: "MILESTONE_DEFINITION_MISMATCH", path: `/milestones/${index}`, message: "Small milestone fields differ from P3" });
      if (canonicalizeJson(milestone.depends_on) !== canonicalizeJson(expectedById.depends_on)) reasons.push({ code: "DEPENDENCY_GRAPH_MISMATCH", path: `/milestones/${index}/depends_on`, message: "Milestone depends_on differs from the frozen predecessor" });
    }
  });
  for (const [id, count] of counts) if (count > 1) reasons.push({ code: "DUPLICATE_MILESTONE", path: "/milestones", message: `Small milestone occurs more than once: ${id}` });
  for (const { milestone_id } of SMALL_MILESTONE_DEFINITIONS) if (!counts.has(milestone_id)) reasons.push({ code: "MISSING_MILESTONE", path: "/milestones", message: `Small milestone is missing: ${milestone_id}` });

  const edgeCounts = new Map<string, number>();
  candidate.dependency_edges.forEach((edge, index) => {
    const key = `${edge.dependency_id}->${edge.dependent_id}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    if (!milestoneIds.has(edge.dependency_id) || !milestoneIds.has(edge.dependent_id)) reasons.push({ code: "UNKNOWN_DEPENDENCY", path: `/dependency_edges/${index}`, message: "Dependency edge contains an unknown milestone" });
    if (edge.dependency_id === edge.dependent_id) reasons.push({ code: "SELF_DEPENDENCY", path: `/dependency_edges/${index}`, message: "A milestone cannot depend on itself" });
  });
  for (const [edge, count] of edgeCounts) if (count > 1) reasons.push({ code: "DUPLICATE_DEPENDENCY", path: "/dependency_edges", message: `Dependency edge occurs more than once: ${edge}` });
  for (const edge of expectedEdges) if (!edgeCounts.has(`${edge.dependency_id}->${edge.dependent_id}`)) reasons.push({ code: "MISSING_DEPENDENCY", path: "/dependency_edges", message: `Frozen dependency is missing: ${edge.dependency_id}->${edge.dependent_id}` });
  const facts = graphFacts(candidate.dependency_edges);
  if (facts.cycles > 0) reasons.push({ code: "DEPENDENCY_CYCLE", path: "/dependency_edges", message: "Dependency graph contains a cycle" });
  if (canonicalizeJson(candidate.dependency_edges) !== canonicalizeJson(expectedEdges)) reasons.push({ code: "DEPENDENCY_GRAPH_MISMATCH", path: "/dependency_edges", message: "Dependency graph must be the frozen 17-edge linear DAG" });

  const upstreamOwners = new Set(upstream.milestones.map(({ milestone_id }) => milestone_id));
  const frozenOwners = new Set(MAJOR_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id));
  const coveredOwners = new Set(candidate.milestones.map(({ major_milestone_id }) => major_milestone_id).filter((id) => upstreamOwners.has(id) && frozenOwners.has(id)));
  const expectedSummary = {
    milestone_count: candidate.milestones.length,
    major_milestone_count: coveredOwners.size,
    dependency_edge_count: candidate.dependency_edges.length,
    root_milestone_id: facts.roots.length === 1 ? facts.roots[0] : "",
    terminal_milestone_id: facts.terminals.length === 1 ? facts.terminals[0] : "",
    cycle_count: facts.cycles,
  };
  for (const field of Object.keys(expectedSummary) as Array<keyof typeof expectedSummary>) if (candidate.summary[field] !== expectedSummary[field]) reasons.push({ code: "SUMMARY_MISMATCH", path: `/summary/${field}`, message: `Summary differs from computed ${field}` });
  return reasons;
}

function parseUpstream(candidate: SmallMilestoneCandidate): MajorMilestonePlan {
  let upstream: MajorMilestonePlan;
  try { upstream = parseMajorMilestonePlan(candidate.major_milestone_plan); } catch { reject("UPSTREAM_MAJOR_MILESTONE_INVALID", "/major_milestone_plan", "Major milestone plan failed authoritative S2.2 validation"); }
  if (canonicalizeJson(candidate.project) !== canonicalizeJson(upstream.project)) reject("PROJECT_BINDING_MISMATCH", "/project", "Project identity differs from the accepted S2.2 plan");
  return upstream;
}

export function evaluateSmallMilestonePlan(value: unknown): SmallMilestonePlan {
  const snapshot = safeValue(value);
  if (!isPlainRecord(snapshot)) reject("INVALID_SMALL_MILESTONE", "$", "Candidate must be an object");
  if (!validateCandidate(snapshot)) throw new SmallMilestoneError(schemaReasons(validateCandidate.errors ?? []));
  const candidate = snapshot as unknown as SmallMilestoneCandidate;
  const upstream = parseUpstream(candidate);
  const reasons = semanticReasons(candidate, upstream);
  if (reasons.length > 0) throw new SmallMilestoneError(reasons);
  return snapshotJsonValue({
    schema_version: "1.0",
    record_type: "small-milestone-plan",
    status: "ACCEPTED",
    project: candidate.project,
    major_milestone_plan: upstream,
    milestones: candidate.milestones,
    ownership_matrix: SMALL_MILESTONE_DEFINITIONS.map(({ milestone_id, major_milestone_id }) => ({ milestone_id, major_milestone_id })),
    dependency_graph: { edges: candidate.dependency_edges, roots: ["S1.1"], terminals: ["S4.3"] },
    candidate_digest: digestJson(candidate),
    metrics: {
      milestones: { actual: 18, required: 18 },
      major_milestones: { covered: 9, required: 9 },
      dependencies: { actual: 17, required: 17, cycles: 0 },
      roots: { actual: 1, required: 1 },
      terminals: { actual: 1, required: 1 },
    },
  }) as unknown as SmallMilestonePlan;
}

const RESULT_FIELDS = ["schema_version", "record_type", "status", "project", "major_milestone_plan", "milestones", "ownership_matrix", "dependency_graph", "candidate_digest", "metrics"] as const;

export function parseSmallMilestonePlan(value: unknown): SmallMilestonePlan {
  let snapshot: JsonValue;
  try { snapshot = safeValue(value); } catch { reject("RESULT_INTEGRITY_MISMATCH", "$", "Result is not safe JSON"); }
  if (!isPlainRecord(snapshot)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result must be an object");
  const actual = Object.keys(snapshot).sort();
  const expected = [...RESULT_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index]) || snapshot.record_type !== "small-milestone-plan" || snapshot.status !== "ACCEPTED") reject("RESULT_INTEGRITY_MISMATCH", "$", "Result fields or status differ");
  const graph = snapshot.dependency_graph;
  const metrics = snapshot.metrics;
  if (!isPlainRecord(graph) || !Array.isArray(graph.edges) || !Array.isArray(graph.roots) || !Array.isArray(graph.terminals) || !isPlainRecord(metrics) || !isPlainRecord(metrics.milestones) || !isPlainRecord(metrics.major_milestones) || !isPlainRecord(metrics.dependencies)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result graph or metrics are invalid");
  const candidate = {
    schema_version: snapshot.schema_version,
    record_type: "small-milestone-candidate",
    project: snapshot.project,
    major_milestone_plan: snapshot.major_milestone_plan,
    milestones: snapshot.milestones,
    dependency_edges: graph.edges,
    summary: {
      milestone_count: metrics.milestones.actual,
      major_milestone_count: metrics.major_milestones.covered,
      dependency_edge_count: metrics.dependencies.actual,
      root_milestone_id: graph.roots[0],
      terminal_milestone_id: graph.terminals[0],
      cycle_count: metrics.dependencies.cycles,
    },
  };
  let restored: SmallMilestonePlan;
  try { restored = evaluateSmallMilestonePlan(candidate); } catch { reject("RESULT_INTEGRITY_MISMATCH", "$", "Result cannot restore a valid candidate"); }
  if (canonicalizeJson(snapshot) !== canonicalizeJson(restored)) reject("RESULT_INTEGRITY_MISMATCH", "$", "Result digest, graph, ownership or metrics differ");
  return restored;
}
