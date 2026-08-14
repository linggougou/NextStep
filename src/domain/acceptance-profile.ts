import { Ajv, type ValidateFunction } from "ajv";

import acceptanceProfileSchema from "../../schemas/v1/acceptance-profile.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { assertSupportedContractVersion } from "./contract-version.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { GATE_CONCLUSIONS, parseGateConclusion, type GateConclusion } from "./gate-conclusion.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

// NextStep 内核仓库的内容身份（与运行时 checkpoint/dispatch packet 的 repository_id 一致）。
// 依据 006 载体裁决：NextStep 自身路线为 Skill/聊天主载体（Skill-only），不建设 Web/UI，
// 因此任何对内核仓库启用 UI 验收的 Profile 候选必须 fail closed。
export const NEXTSTEP_KERNEL_REPOSITORY_ID: Sha256Digest =
  "sha256:d11253328d36050bd559844c64b438e9b84e0c13125184e9b01e1e7cf23a8c56";

export const ACCEPTANCE_ROUTE_KINDS = ["headless", "ui"] as const;
export type AcceptanceRouteKind = (typeof ACCEPTANCE_ROUTE_KINDS)[number];

// integration/interaction/product 是任何路线都必须启用的三类验收；
// ui_restoration 仅在含 UI 路线上作为追加验收启用。
export const CORE_ACCEPTANCE_TYPES = ["integration", "interaction", "product"] as const;
export type CoreAcceptanceType = (typeof CORE_ACCEPTANCE_TYPES)[number];
export const UI_ACCEPTANCE_TYPE = "ui_restoration" as const;
export type AcceptanceType = CoreAcceptanceType | typeof UI_ACCEPTANCE_TYPE;

// 只有宿主编排（集成角色）组装的候选可以配置 Profile 适用性；
// 独立证据任务（008 §5.1 结论链）只提供证据，不得改变适用性。
export const PROFILE_ORIGIN_TASK_KIND = "host-orchestration" as const;
export const INDEPENDENT_EVIDENCE_TASK_KINDS = [
  "execution",
  "verification",
  "evaluation",
  "review",
  "final-verification",
  "anchor-verification",
] as const;
export type AcceptanceProfileOriginTaskKind =
  | typeof PROFILE_ORIGIN_TASK_KIND
  | (typeof INDEPENDENT_EVIDENCE_TASK_KINDS)[number];

export interface AcceptanceEvidenceRef {
  readonly pointer: string;
  readonly value_digest: Sha256Digest;
}

export interface AcceptanceProfileProject {
  readonly repository_id: Sha256Digest;
  readonly formal_baseline: string;
}

export interface AcceptanceProfileRoute {
  readonly route_id: string;
  readonly kind: AcceptanceRouteKind;
}

export interface AcceptanceProfileBindings {
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly carrier_decision_digest: Sha256Digest;
}

export interface AcceptanceProfileOrigin {
  readonly task_kind: AcceptanceProfileOriginTaskKind;
}

export interface CoreAcceptanceConfig {
  readonly enabled: boolean;
}

export interface UiRestorationAcceptanceConfig {
  readonly enabled: boolean;
  readonly ui_design_source?: AcceptanceEvidenceRef;
  readonly ui_restoration_evidence?: readonly AcceptanceEvidenceRef[];
}

export interface AcceptanceProfileCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "acceptance-profile-candidate";
  readonly profile_id: string;
  readonly project: AcceptanceProfileProject;
  readonly route: AcceptanceProfileRoute;
  readonly bindings: AcceptanceProfileBindings;
  readonly origin: AcceptanceProfileOrigin;
  readonly acceptances: {
    readonly integration: CoreAcceptanceConfig;
    readonly interaction: CoreAcceptanceConfig;
    readonly product: CoreAcceptanceConfig;
    readonly ui_restoration: UiRestorationAcceptanceConfig;
  };
}

// 契约级失败（结构、版本、敏感、身份）抛出 AcceptanceProfileError；
// 语义级裁决（冲突、缺证据、职责违规、适用）以 AcceptanceProfileDecision 返回。
export type AcceptanceProfileErrorCode =
  | "INVALID_ACCEPTANCE_PROFILE"
  | "SENSITIVE_CONTENT_DETECTED"
  | "IDENTITY_CONFLICT"
  | "PROFILE_CONFLICT"
  | "UI_EVIDENCE_MISSING"
  | "EVIDENCE_DUTY_VIOLATION"
  | "KERNEL_ROUTE_UI_FORBIDDEN";

export class AcceptanceProfileError extends Error {
  readonly code: AcceptanceProfileErrorCode;

  constructor(code: AcceptanceProfileErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// 裁决级拒绝码：被拒绝的裁决绝不降级输出更弱的 Profile。
export type AcceptanceProfileRejectionCode = Extract<
  AcceptanceProfileErrorCode,
  "PROFILE_CONFLICT" | "UI_EVIDENCE_MISSING" | "EVIDENCE_DUTY_VIOLATION" | "KERNEL_ROUTE_UI_FORBIDDEN"
>;

export interface AcceptanceProfileRejection {
  readonly code: AcceptanceProfileRejectionCode;
  readonly reasons: readonly string[];
}

export type AcceptanceProfileUiRequirements =
  | { readonly status: "disabled" }
  | {
      readonly status: "required";
      readonly ui_design_source: AcceptanceEvidenceRef;
      readonly ui_restoration_evidence: readonly AcceptanceEvidenceRef[];
    };

export interface AcceptanceProfileDecision {
  readonly schema_version: "1.0";
  readonly record_type: "acceptance-profile-decision";
  readonly status: "accepted" | "rejected";
  readonly conclusion: GateConclusion;
  readonly profile_id: string;
  readonly project: AcceptanceProfileProject;
  readonly route: AcceptanceProfileRoute;
  readonly bindings: AcceptanceProfileBindings;
  readonly candidate_digest: Sha256Digest;
  readonly enabled_acceptances: readonly AcceptanceType[];
  readonly ui_requirements: AcceptanceProfileUiRequirements;
  readonly rejection: AcceptanceProfileRejection | null;
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCandidate: ValidateFunction = ajv.compile(acceptanceProfileSchema);

function fail(code: AcceptanceProfileErrorCode, message: string): never {
  throw new AcceptanceProfileError(code, message);
}

const IDENTITY_PROJECTION_FIELDS = ["project", "route", "bindings", "origin", "acceptances"] as const;

// Profile ID 由候选的全部语义字段（不含 profile_id 自身）的 RFC8785 摘要派生，
// 候选声明的 profile_id 与派生值不一致即视为身份冲突（fail closed）。
export function deriveAcceptanceProfileId(value: unknown): string {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile candidate is not a JSON value");
  }
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile identity source must be a plain object");
  }
  const projection = Object.create(null) as Record<string, JsonValue>;
  for (const field of IDENTITY_PROJECTION_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) {
      fail("INVALID_ACCEPTANCE_PROFILE", `Acceptance profile identity field is missing: ${field}`);
    }
    projection[field] = (snapshot as Record<string, JsonValue>)[field] as JsonValue;
  }
  return `ap-${digestJson(projection).slice("sha256:".length)}`;
}


const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OID_PATTERN = /^[a-f0-9]{40}$/;
const PROFILE_ID_PATTERN = /^ap-[a-f0-9]{64}$/;

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail("INVALID_ACCEPTANCE_PROFILE", `${label} fields do not match the decision contract`);
  }
}

function requireString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || (pattern !== undefined && !pattern.test(value))) {
    fail("INVALID_ACCEPTANCE_PROFILE", `${label} is invalid`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    fail("INVALID_ACCEPTANCE_PROFILE", `${label} must be a plain object`);
  }
  return value;
}

function requireEvidenceRef(value: unknown, label: string): void {
  const ref = requireRecord(value, label);
  assertExactKeys(ref, ["pointer", "value_digest"], label);
  requireString(ref.pointer, `${label}.pointer`);
  requireString(ref.value_digest, `${label}.value_digest`, SHA256_PATTERN);
}

export function parseAcceptanceProfileDecision(value: unknown): AcceptanceProfileDecision {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile decision is not safe canonical JSON data");
  }
  const decision = requireRecord(snapshot, "Acceptance profile decision");
  assertExactKeys(decision, [
    "schema_version", "record_type", "status", "conclusion", "profile_id", "project", "route",
    "bindings", "candidate_digest", "enabled_acceptances", "ui_requirements", "rejection",
  ], "Acceptance profile decision");
  if (decision.schema_version !== "1.0" || decision.record_type !== "acceptance-profile-decision") {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile decision version or record type is invalid");
  }
  if (decision.status !== "accepted" && decision.status !== "rejected") {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile decision status is invalid");
  }
  let conclusion: GateConclusion;
  try { conclusion = parseGateConclusion(decision.conclusion); }
  catch { fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile decision conclusion is invalid"); }
  requireString(decision.profile_id, "profile_id", PROFILE_ID_PATTERN);
  requireString(decision.candidate_digest, "candidate_digest", SHA256_PATTERN);

  const project = requireRecord(decision.project, "project");
  assertExactKeys(project, ["repository_id", "formal_baseline"], "project");
  requireString(project.repository_id, "project.repository_id", SHA256_PATTERN);
  requireString(project.formal_baseline, "project.formal_baseline", OID_PATTERN);

  const route = requireRecord(decision.route, "route");
  assertExactKeys(route, ["route_id", "kind"], "route");
  requireString(route.route_id, "route.route_id");
  if (route.kind !== "headless" && route.kind !== "ui") fail("INVALID_ACCEPTANCE_PROFILE", "route.kind is invalid");

  const bindings = requireRecord(decision.bindings, "bindings");
  assertExactKeys(bindings, ["product_definition_id", "product_definition_digest", "carrier_decision_digest"], "bindings");
  requireString(bindings.product_definition_id, "bindings.product_definition_id", /^pd-[a-f0-9]{64}$/);
  requireString(bindings.product_definition_digest, "bindings.product_definition_digest", SHA256_PATTERN);
  requireString(bindings.carrier_decision_digest, "bindings.carrier_decision_digest", SHA256_PATTERN);

  if (!Array.isArray(decision.enabled_acceptances)) fail("INVALID_ACCEPTANCE_PROFILE", "enabled_acceptances must be an array");
  const enabled = decision.enabled_acceptances;
  if (new Set(enabled).size !== enabled.length || enabled.some((item) => ![...CORE_ACCEPTANCE_TYPES, UI_ACCEPTANCE_TYPE].includes(item as AcceptanceType))) {
    fail("INVALID_ACCEPTANCE_PROFILE", "enabled_acceptances is invalid");
  }
  const uiRequirements = requireRecord(decision.ui_requirements, "ui_requirements");
  if (uiRequirements.status === "disabled") {
    assertExactKeys(uiRequirements, ["status"], "ui_requirements");
  } else if (uiRequirements.status === "required") {
    assertExactKeys(uiRequirements, ["status", "ui_design_source", "ui_restoration_evidence"], "ui_requirements");
    requireEvidenceRef(uiRequirements.ui_design_source, "ui_requirements.ui_design_source");
    if (!Array.isArray(uiRequirements.ui_restoration_evidence) || uiRequirements.ui_restoration_evidence.length === 0) {
      fail("INVALID_ACCEPTANCE_PROFILE", "ui restoration evidence is required");
    }
    uiRequirements.ui_restoration_evidence.forEach((item, index) => requireEvidenceRef(item, `ui_requirements.ui_restoration_evidence[${index}]`));
  } else {
    fail("INVALID_ACCEPTANCE_PROFILE", "ui_requirements.status is invalid");
  }

  const expectedCore = [...CORE_ACCEPTANCE_TYPES];
  if (decision.status === "accepted") {
    if (conclusion !== "通过" || decision.rejection !== null) fail("INVALID_ACCEPTANCE_PROFILE", "accepted decision semantics are inconsistent");
    const expected = route.kind === "ui" ? [...expectedCore, UI_ACCEPTANCE_TYPE] : expectedCore;
    if (enabled.length !== expected.length || enabled.some((item, index) => item !== expected[index])) fail("INVALID_ACCEPTANCE_PROFILE", "accepted decision acceptance set is inconsistent");
    if ((route.kind === "ui" && uiRequirements.status !== "required") || (route.kind === "headless" && uiRequirements.status !== "disabled")) {
      fail("INVALID_ACCEPTANCE_PROFILE", "accepted decision UI requirements conflict with the route");
    }
  } else {
    if (conclusion !== "阻塞" || enabled.length !== 0 || uiRequirements.status !== "disabled") fail("INVALID_ACCEPTANCE_PROFILE", "rejected decision semantics are inconsistent");
    const rejection = requireRecord(decision.rejection, "rejection");
    assertExactKeys(rejection, ["code", "reasons"], "rejection");
    if (!["PROFILE_CONFLICT", "UI_EVIDENCE_MISSING", "EVIDENCE_DUTY_VIOLATION", "KERNEL_ROUTE_UI_FORBIDDEN"].includes(String(rejection.code))) {
      fail("INVALID_ACCEPTANCE_PROFILE", "rejection.code is invalid");
    }
    if (!Array.isArray(rejection.reasons) || rejection.reasons.length === 0 || rejection.reasons.some((reason) => typeof reason !== "string" || reason.length === 0)) {
      fail("INVALID_ACCEPTANCE_PROFILE", "rejection reasons are invalid");
    }
  }
  return snapshot as unknown as AcceptanceProfileDecision;
}

function freezeEvidenceRef(ref: AcceptanceEvidenceRef): AcceptanceEvidenceRef {
  return Object.freeze({ pointer: ref.pointer, value_digest: ref.value_digest });
}

// 决策字段序与契约声明一致：schema_version、record_type、status、conclusion、profile_id、
// project、route、bindings、candidate_digest、enabled_acceptances、ui_requirements、rejection。
function buildDecision(
  candidate: AcceptanceProfileCandidate,
  snapshot: JsonValue,
  status: "accepted" | "rejected",
  conclusion: GateConclusion,
  enabledAcceptances: readonly AcceptanceType[],
  uiRequirements: AcceptanceProfileUiRequirements,
  rejection: AcceptanceProfileRejection | null,
): AcceptanceProfileDecision {
  return Object.freeze({
    schema_version: "1.0" as const,
    record_type: "acceptance-profile-decision" as const,
    status,
    conclusion,
    profile_id: candidate.profile_id,
    project: Object.freeze({ ...candidate.project }),
    route: Object.freeze({ ...candidate.route }),
    bindings: Object.freeze({ ...candidate.bindings }),
    candidate_digest: digestJson(snapshot),
    enabled_acceptances: Object.freeze([...enabledAcceptances]) as readonly AcceptanceType[],
    ui_requirements: uiRequirements,
    rejection,
  });
}

function rejectDecision(
  candidate: AcceptanceProfileCandidate,
  snapshot: JsonValue,
  code: AcceptanceProfileRejectionCode,
  reasons: readonly string[],
): AcceptanceProfileDecision {
  return buildDecision(
    candidate,
    snapshot,
    "rejected",
    GATE_CONCLUSIONS[3],
    [],
    Object.freeze({ status: "disabled" as const }),
    Object.freeze({ code, reasons: Object.freeze([...reasons]) }),
  );
}

function acceptHeadlessDecision(
  candidate: AcceptanceProfileCandidate,
  snapshot: JsonValue,
): AcceptanceProfileDecision {
  return buildDecision(
    candidate,
    snapshot,
    "accepted",
    GATE_CONCLUSIONS[0],
    CORE_ACCEPTANCE_TYPES,
    Object.freeze({ status: "disabled" as const }),
    null,
  );
}

function acceptUiDecision(
  candidate: AcceptanceProfileCandidate,
  snapshot: JsonValue,
  uiDesignSource: AcceptanceEvidenceRef,
  uiRestorationEvidence: readonly AcceptanceEvidenceRef[],
): AcceptanceProfileDecision {
  return buildDecision(
    candidate,
    snapshot,
    "accepted",
    GATE_CONCLUSIONS[0],
    [...CORE_ACCEPTANCE_TYPES, UI_ACCEPTANCE_TYPE],
    Object.freeze({
      status: "required" as const,
      ui_design_source: freezeEvidenceRef(uiDesignSource),
      ui_restoration_evidence: Object.freeze(uiRestorationEvidence.map(freezeEvidenceRef)),
    }),
    null,
  );
}

// 确定性裁决：同一候选必然得到同一裁决。检查优先级（fail closed，绝不降级为 headless）：
// 1. 敏感字段/敏感内容扫描（TG-16，先于一切结构检查）；
// 2. 契约结构：JSON 值、普通对象、契约版本 1.0、AJV Schema（未知字段/未知版本/缺字段拒绝）；
// 3. 证据职责：独立证据任务不得配置或改变 Profile 适用性（裁决拒绝）；
// 4. 内核路线守卫：NextStep 自身仓库禁止启用 UI 验收（裁决拒绝）；
// 5. 身份一致性：profile_id 必须等于派生摘要（不一致抛出身份冲突）；
// 6. 路线语义：三类核心验收必须全部启用；headless 禁止 UI 要求；
//    含 UI 必须追加 UI 设计真源与还原证据，缺失即阻塞（不降级为 headless 通过）。
export function evaluateAcceptanceProfile(value: unknown): AcceptanceProfileDecision {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile candidate is not a JSON value");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in acceptance profile candidate");
  }
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_ACCEPTANCE_PROFILE", "Acceptance profile candidate must be a plain object");
  }
  try {
    assertSupportedContractVersion(snapshot.schema_version);
  } catch {
    fail("INVALID_ACCEPTANCE_PROFILE", "Unsupported acceptance profile contract version");
  }
  if (!validateCandidate(snapshot)) {
    fail("INVALID_ACCEPTANCE_PROFILE", `Acceptance profile candidate failed schema validation: ${ajv.errorsText(validateCandidate.errors, { separator: "; " })}`);
  }
  const candidate = snapshot as unknown as AcceptanceProfileCandidate;
  if (candidate.origin.task_kind !== PROFILE_ORIGIN_TASK_KIND) {
    return rejectDecision(candidate, snapshot, "EVIDENCE_DUTY_VIOLATION", [
      `Independent evidence task kind "${candidate.origin.task_kind}" only provides evidence and cannot change acceptance profile applicability`,
    ]);
  }
  if (candidate.project.repository_id === NEXTSTEP_KERNEL_REPOSITORY_ID && candidate.route.kind === "ui") {
    return rejectDecision(candidate, snapshot, "KERNEL_ROUTE_UI_FORBIDDEN", [
      "NextStep kernel route is Skill-only; UI acceptance cannot be enabled for the kernel repository",
    ]);
  }
  const derivedProfileId = deriveAcceptanceProfileId(snapshot);
  if (candidate.profile_id !== derivedProfileId) {
    fail("IDENTITY_CONFLICT", `Acceptance profile ID does not match derived identity: expected ${derivedProfileId}`);
  }
  const conflictReasons: string[] = [];
  for (const acceptanceType of CORE_ACCEPTANCE_TYPES) {
    if (!candidate.acceptances[acceptanceType].enabled) {
      conflictReasons.push(`Acceptance "${acceptanceType}" is required for every route and cannot be disabled`);
    }
  }
  const uiRestoration = candidate.acceptances.ui_restoration;
  if (candidate.route.kind === "headless") {
    if (uiRestoration.enabled) {
      conflictReasons.push("Headless route must not require UI restoration acceptance");
    }
    if (uiRestoration.ui_design_source !== undefined || uiRestoration.ui_restoration_evidence !== undefined) {
      conflictReasons.push("Headless route must not carry UI design source or restoration evidence requirements");
    }
  }
  if (conflictReasons.length > 0) {
    return rejectDecision(candidate, snapshot, "PROFILE_CONFLICT", conflictReasons);
  }
  if (candidate.route.kind === "ui") {
    if (!uiRestoration.enabled) {
      return rejectDecision(candidate, snapshot, "PROFILE_CONFLICT", [
        "UI route requires UI restoration acceptance; downgrading to a headless profile is forbidden",
      ]);
    }
    const uiDesignSource = uiRestoration.ui_design_source;
    if (uiDesignSource === undefined) {
      return rejectDecision(candidate, snapshot, "UI_EVIDENCE_MISSING", [
        "UI route requires a signed UI design source reference",
      ]);
    }
    const uiRestorationEvidence = uiRestoration.ui_restoration_evidence;
    if (uiRestorationEvidence === undefined || uiRestorationEvidence.length === 0) {
      return rejectDecision(candidate, snapshot, "UI_EVIDENCE_MISSING", [
        "UI route requires at least one UI restoration evidence reference",
      ]);
    }
    return acceptUiDecision(candidate, snapshot, uiDesignSource, uiRestorationEvidence);
  }
  return acceptHeadlessDecision(candidate, snapshot);
}
