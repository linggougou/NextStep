import { Ajv, type ValidateFunction } from "ajv";

import interactionPrototypeSchema from "../../schemas/v1/interaction-prototype.schema.json" with { type: "json" };
import type { JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import {
  parseProductDefinitionCandidate,
  ProductDefinitionError,
  type ProductDefinitionCandidate,
} from "./product-definition.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

// 载体无关原型 1.0（S1.4 / PC-04）：
// - 只描述输入、回应、确认节点、阶段转换、异常、恢复入口与不可偏离项，不绑定任何具体载体；
// - 整体内嵌已会签 Product Definition 2.0 记录，并以摘要、ID、仓库身份、正式基线四重绑定上游；
// - 全部语义 fail closed：缺确认节点、非法转换、无恢复入口、Web/UI 主线声明、
//   Codex 对话脚本窄化、未知字段/版本、摘要错配、敏感内容一律拒绝，不降级、不猜测。

export interface InteractionPrototypeProject {
  readonly repository_id: Sha256Digest;
  readonly formal_baseline: string;
}

// 封闭词表：仅 `carrier-agnostic` 可进入后续流程；其余两个值是可识别的禁止声明，
// 由内核给出专属拒绝码（载体裁决证据），未知值则由 Schema fail closed。
export type InteractionPrototypeCarrierScope = "carrier-agnostic" | "codex-dialogue-script" | "web-ui-mainline";

export interface InteractionPrototypeInput {
  readonly input_id: string;
  readonly summary: string;
  readonly bound_stage: string;
}

export interface InteractionPrototypeResponse {
  readonly response_id: string;
  readonly summary: string;
  readonly triggered_by: string;
  readonly bound_stage: string;
}

export interface InteractionPrototypeConfirmationNode {
  readonly confirmation_node_id: string;
  readonly stage: string;
  readonly summary: string;
  readonly confirmation_kind: "explicit-user-confirmation";
}

export type InteractionPrototypeStageKind = "initial" | "working" | "terminal";

export interface InteractionPrototypeStage {
  readonly stage_id: string;
  readonly name: string;
  readonly kind: InteractionPrototypeStageKind;
}

export type InteractionPrototypeTransitionTrigger =
  | "user-action"
  | "host-assembly"
  | "kernel-validation"
  | "explicit-confirmation";

export interface InteractionPrototypeStageTransition {
  readonly transition_id: string;
  readonly from: string;
  readonly to: string;
  readonly trigger: InteractionPrototypeTransitionTrigger;
}

export interface InteractionPrototypeRecoveryEntry {
  readonly recovery_id: string;
  readonly target_stage: string;
  readonly summary: string;
}

export interface InteractionPrototypeException {
  readonly exception_id: string;
  readonly stage: string;
  readonly summary: string;
  readonly recovery?: InteractionPrototypeRecoveryEntry;
}

export interface InteractionPrototypeInvariantSource {
  readonly pointer: string;
  readonly value_digest: Sha256Digest;
}

export interface InteractionPrototypeInvariant {
  readonly invariant_id: string;
  readonly statement: string;
  readonly source: InteractionPrototypeInvariantSource;
}

export interface InteractionPrototype {
  readonly schema_version: "1.0";
  readonly record_type: "interaction-prototype";
  readonly project: InteractionPrototypeProject;
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly product_definition: Omit<ProductDefinitionCandidate, "status">;
  readonly prototype_id: string;
  readonly carrier_scope: InteractionPrototypeCarrierScope;
  readonly inputs: readonly InteractionPrototypeInput[];
  readonly responses: readonly InteractionPrototypeResponse[];
  readonly confirmation_nodes: readonly InteractionPrototypeConfirmationNode[];
  readonly stages: readonly InteractionPrototypeStage[];
  readonly stage_transitions: readonly InteractionPrototypeStageTransition[];
  readonly exceptions: readonly InteractionPrototypeException[];
  readonly invariants: readonly InteractionPrototypeInvariant[];
  readonly status: "ready-for-signoff";
}

export type InteractionPrototypeErrorCode =
  | "INVALID_INTERACTION_PROTOTYPE"
  | "SENSITIVE_CONTENT_DETECTED"
  | "UPSTREAM_BINDING_MISMATCH"
  | "CONFIRMATION_NODE_MISSING"
  | "INVALID_STAGE_TRANSITION"
  | "RECOVERY_ENTRY_MISSING"
  | "WEB_UI_MAINLINE_REJECTED"
  | "CARRIER_NARROWING_REJECTED";

export class InteractionPrototypeError extends Error {
  readonly code: InteractionPrototypeErrorCode;

  constructor(code: InteractionPrototypeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(code: InteractionPrototypeErrorCode, message: string): never {
  throw new InteractionPrototypeError(code, message);
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validatePrototype = ajv.compile(interactionPrototypeSchema) as ValidateFunction;

export function parseInteractionPrototype(value: unknown): InteractionPrototype {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "载体无关原型候选包含敏感字段或敏感内容");
  }
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_INTERACTION_PROTOTYPE", "载体无关原型必须是纯 JSON 对象");
  }
  if (snapshot.schema_version !== "1.0") {
    fail("INVALID_INTERACTION_PROTOTYPE", `不支持的载体无关原型版本：${String(snapshot.schema_version)}（仅支持 1.0，不提供迁移或双读）`);
  }
  if (snapshot.carrier_scope === "web-ui-mainline") {
    fail("WEB_UI_MAINLINE_REJECTED", "载体无关原型不得声明 Web/UI 为当前主线；Web/UI 仅为候选分支");
  }
  if (snapshot.carrier_scope === "codex-dialogue-script") {
    fail("CARRIER_NARROWING_REJECTED", "载体无关原型不得窄化为 Codex 对话脚本");
  }
  if (!validatePrototype(snapshot)) {
    fail("INVALID_INTERACTION_PROTOTYPE", "载体无关原型结构不符合 1.0 Schema");
  }
  assertUpstreamBinding(snapshot);
  assertFlowIntegrity(snapshot);
  return snapshot as unknown as InteractionPrototype;
}

// 上游四重绑定：内嵌 Product Definition 2.0 记录必须本身有效，且
// 摘要、产品定义 ID、仓库身份、正式基线与原型声明完全一致。
function assertUpstreamBinding(snapshot: UnknownRecord): void {
  try {
    parseProductDefinitionCandidate(snapshot.product_definition);
  } catch (error) {
    if (error instanceof ProductDefinitionError && error.code === "SENSITIVE_CONTENT_DETECTED") {
      fail("SENSITIVE_CONTENT_DETECTED", "内嵌 Product Definition 包含敏感内容");
    }
    fail("UPSTREAM_BINDING_MISMATCH", "内嵌 Product Definition 不是有效的已会签 2.0 记录");
  }
  if (snapshot.product_definition_digest !== digestJson(snapshot.product_definition)) {
    fail("UPSTREAM_BINDING_MISMATCH", "Product Definition 摘要与内嵌记录不匹配");
  }
  const embedded = snapshot.product_definition as UnknownRecord;
  if (snapshot.product_definition_id !== embedded.product_definition_id) {
    fail("UPSTREAM_BINDING_MISMATCH", "Product Definition ID 与内嵌记录不匹配");
  }
  const project = snapshot.project as UnknownRecord;
  const upstreamProject = (embedded.frozen_requirement as UnknownRecord).project as UnknownRecord;
  if (project.repository_id !== upstreamProject.repository_id) {
    fail("UPSTREAM_BINDING_MISMATCH", "原型仓库身份与上游 Product Definition 不匹配");
  }
  if (project.formal_baseline !== upstreamProject.formal_baseline) {
    fail("UPSTREAM_BINDING_MISMATCH", "原型正式基线与上游 Product Definition 不匹配");
  }
}

// 不变量证据指针只允许解析到内嵌 Product Definition 记录内部的值，
// 并以 RFC8785 摘要绑定，确保证据可回放、不可篡改。
function resolvePointerInProductDefinition(record: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer.length === 0 || pointer[0] !== "/") {
    return undefined;
  }
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: JsonValue = record;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) {
        return undefined;
      }
      const index = Number(token);
      if (index >= current.length) {
        return undefined;
      }
      current = current[index]!;
      continue;
    }
    if (current !== null && typeof current === "object" && Object.hasOwn(current, token)) {
      current = (current as { readonly [key: string]: JsonValue })[token]!;
      continue;
    }
    return undefined;
  }
  return current;
}

function assertFlowIntegrity(snapshot: UnknownRecord): void {
  const stages = snapshot.stages as readonly InteractionPrototypeStage[];
  const stageById = new Map<string, InteractionPrototypeStage>();
  for (const stage of stages) {
    if (stageById.has(stage.stage_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `阶段重复声明：${stage.stage_id}`);
    }
    stageById.set(stage.stage_id, stage);
  }
  const initialStages = stages.filter((stage) => stage.kind === "initial");
  const terminalStages = stages.filter((stage) => stage.kind === "terminal");
  if (initialStages.length !== 1) {
    fail("INVALID_INTERACTION_PROTOTYPE", "原型必须恰好声明一个初始阶段");
  }
  if (terminalStages.length < 1) {
    fail("INVALID_INTERACTION_PROTOTYPE", "原型必须声明至少一个终态阶段");
  }

  const transitions = snapshot.stage_transitions as readonly InteractionPrototypeStageTransition[];
  const transitionIds = new Set<string>();
  const transitionPairs = new Set<string>();
  for (const transition of transitions) {
    const fromStage = stageById.get(transition.from);
    const toStage = stageById.get(transition.to);
    if (fromStage === undefined || toStage === undefined) {
      fail("INVALID_STAGE_TRANSITION", `转换 ${transition.transition_id} 引用未声明的阶段`);
    }
    if (transition.from === transition.to) {
      fail("INVALID_STAGE_TRANSITION", `转换 ${transition.transition_id} 为自环转换`);
    }
    if (fromStage.kind === "terminal") {
      fail("INVALID_STAGE_TRANSITION", `转换 ${transition.transition_id} 从终态阶段离开`);
    }
    if (transitionIds.has(transition.transition_id)) {
      fail("INVALID_STAGE_TRANSITION", `转换 ID 重复声明：${transition.transition_id}`);
    }
    transitionIds.add(transition.transition_id);
    const pair = `${transition.from} -> ${transition.to}`;
    if (transitionPairs.has(pair)) {
      fail("INVALID_STAGE_TRANSITION", `转换方向重复声明：${pair}`);
    }
    transitionPairs.add(pair);
  }
  for (const stage of stages) {
    if (stage.kind !== "terminal" && !transitions.some((transition) => transition.from === stage.stage_id)) {
      fail("INVALID_STAGE_TRANSITION", `非终态阶段 ${stage.stage_id} 没有出口转换`);
    }
  }
  const reachable = new Set<string>([initialStages[0]!.stage_id]);
  const queue = [initialStages[0]!.stage_id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const transition of transitions) {
      if (transition.from === current && !reachable.has(transition.to)) {
        reachable.add(transition.to);
        queue.push(transition.to);
      }
    }
  }
  for (const stage of stages) {
    if (!reachable.has(stage.stage_id)) {
      fail("INVALID_STAGE_TRANSITION", `阶段 ${stage.stage_id} 从初始阶段不可达`);
    }
  }

  const inputs = snapshot.inputs as readonly InteractionPrototypeInput[];
  const inputIds = new Set<string>();
  for (const input of inputs) {
    if (inputIds.has(input.input_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `输入重复声明：${input.input_id}`);
    }
    inputIds.add(input.input_id);
    if (!stageById.has(input.bound_stage)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `输入 ${input.input_id} 绑定未声明的阶段`);
    }
  }
  const responses = snapshot.responses as readonly InteractionPrototypeResponse[];
  const responseIds = new Set<string>();
  for (const response of responses) {
    if (responseIds.has(response.response_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `回应重复声明：${response.response_id}`);
    }
    responseIds.add(response.response_id);
    if (!inputIds.has(response.triggered_by)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `回应 ${response.response_id} 由未声明的输入触发`);
    }
    if (!stageById.has(response.bound_stage)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `回应 ${response.response_id} 绑定未声明的阶段`);
    }
  }

  // 确认节点：原型必须声明显式确认节点；进入终态的转换必须从
  // 携带确认节点的阶段出发（对应 006/S3 的显式用户确认不可偏离项）。
  const confirmations = snapshot.confirmation_nodes as readonly InteractionPrototypeConfirmationNode[];
  if (confirmations.length === 0) {
    fail("CONFIRMATION_NODE_MISSING", "原型必须声明至少一个显式确认节点");
  }
  const confirmationIds = new Set<string>();
  const confirmedStages = new Set<string>();
  for (const node of confirmations) {
    if (confirmationIds.has(node.confirmation_node_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `确认节点重复声明：${node.confirmation_node_id}`);
    }
    confirmationIds.add(node.confirmation_node_id);
    if (!stageById.has(node.stage)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `确认节点 ${node.confirmation_node_id} 绑定未声明的阶段`);
    }
    if (confirmedStages.has(node.stage)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `阶段 ${node.stage} 重复声明确认节点`);
    }
    confirmedStages.add(node.stage);
  }
  for (const transition of transitions) {
    if (stageById.get(transition.to)!.kind === "terminal" && !confirmedStages.has(transition.from)) {
      fail("CONFIRMATION_NODE_MISSING", `进入终态阶段的转换必须从携带显式确认节点的阶段出发：${transition.from}`);
    }
  }

  // 异常与恢复入口：每个异常必须携带恢复入口，恢复目标必须是已声明阶段；
  // Schema 层 recovery 可选、领域层强制，保证拒绝码专属。
  const exceptions = snapshot.exceptions as readonly InteractionPrototypeException[];
  if (exceptions.length === 0) {
    fail("RECOVERY_ENTRY_MISSING", "原型必须声明至少一个携带恢复入口的异常");
  }
  const exceptionIds = new Set<string>();
  const recoveryIds = new Set<string>();
  for (const exception of exceptions) {
    if (exceptionIds.has(exception.exception_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `异常重复声明：${exception.exception_id}`);
    }
    exceptionIds.add(exception.exception_id);
    if (!stageById.has(exception.stage)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `异常 ${exception.exception_id} 绑定未声明的阶段`);
    }
    if (exception.recovery === undefined) {
      fail("RECOVERY_ENTRY_MISSING", `异常 ${exception.exception_id} 缺少恢复入口`);
    }
    if (!stageById.has(exception.recovery.target_stage)) {
      fail("RECOVERY_ENTRY_MISSING", `异常 ${exception.exception_id} 的恢复入口指向未声明的阶段`);
    }
    if (recoveryIds.has(exception.recovery.recovery_id)) {
      fail("RECOVERY_ENTRY_MISSING", `恢复入口重复声明：${exception.recovery.recovery_id}`);
    }
    recoveryIds.add(exception.recovery.recovery_id);
  }

  // 不可偏离项：每条不变量必须绑定内嵌 Product Definition 中可解析的证据值，
  // 且摘要一致；证据缺失或错配一律按上游绑定失败拒绝。
  const invariants = snapshot.invariants as readonly InteractionPrototypeInvariant[];
  const invariantIds = new Set<string>();
  const productDefinition = snapshot.product_definition as JsonValue;
  for (const invariant of invariants) {
    if (invariantIds.has(invariant.invariant_id)) {
      fail("INVALID_INTERACTION_PROTOTYPE", `不变量重复声明：${invariant.invariant_id}`);
    }
    invariantIds.add(invariant.invariant_id);
    const resolved = resolvePointerInProductDefinition(productDefinition, invariant.source.pointer);
    if (resolved === undefined) {
      fail("UPSTREAM_BINDING_MISMATCH", `不变量 ${invariant.invariant_id} 的证据指针无法在内嵌 Product Definition 中解析`);
    }
    if (digestJson(resolved) !== invariant.source.value_digest) {
      fail("UPSTREAM_BINDING_MISMATCH", `不变量 ${invariant.invariant_id} 的证据摘要不匹配`);
    }
  }
}
