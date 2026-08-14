import { Ajv, type ValidateFunction } from "ajv";

import carrierDecisionSchema from "../../schemas/v1/carrier-decision.schema.json" with { type: "json" };
import { assertDigestMatches, digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export type CarrierDecisionErrorCode =
  | "INVALID_CARRIER_DECISION"
  | "SENSITIVE_CONTENT_DETECTED"
  | "MAINLINE_IMPERSONATION"
  | "TRUTH_SOURCE_REJECTED"
  | "CANDIDATE_BRANCH_INVALID"
  | "UNAUTHORIZED_OVERRIDE"
  | "SOURCE_ADJUDICATION_MISMATCH"
  | "BINDING_DIGEST_MISMATCH";

export class CarrierDecisionError extends Error {
  readonly code: CarrierDecisionErrorCode;

  constructor(code: CarrierDecisionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// 006 裁决允许进入结构化记录的载体词汇表。kernel 只接受其中唯一一组正式值：
// 主载体 `skill-chat`、真源承载 `project-documents-git`；其余取值仅用于表达负例并一律拒绝。
export type CarrierPrimaryCarrier = "skill-chat" | "web-cockpit" | "app-only" | "mcp-only" | "headless-only";
export type CarrierTruthSourceCarrier = "project-documents-git" | "chat-history" | "none";
export type CarrierAuxiliaryEntryPolicy = "no-new-mainline-entry" | "new-mainline-entry";
export type CarrierIntegrationSurfacePolicy = "future-integration-surface-only" | "mainline";
export type CarrierWebUiPolicy = "candidate-not-mainline" | "mainline";
export type CarrierCandidateBranchStatus = "candidate-not-mainline" | "mainline";
export type CarrierIntegrationSurfaceStatus = "future-integration-surface" | "mainline";
export type CarrierCandidateMaterialRole = "candidate-branch-input" | "candidate-branch-draft";
export type CarrierCandidateKind = "web-ui" | "app" | "mcp-service" | "api" | "headless";
export type CarrierIntegrationSurfaceKind = "mcp-service" | "api";

export interface CarrierDecisionProject {
  readonly repository_id: Sha256Digest;
  readonly formal_baseline: string;
}

// 已会签 006 裁决的结构化结论摘要；任何偏离该结论的记录都不得通过。
export interface CarrierSourceConclusions {
  readonly primary_carrier: CarrierPrimaryCarrier;
  readonly truth_source_carrier: CarrierTruthSourceCarrier;
  readonly auxiliary_entry_policy: CarrierAuxiliaryEntryPolicy;
  readonly integration_surface_policy: CarrierIntegrationSurfacePolicy;
  readonly web_ui_policy: CarrierWebUiPolicy;
}

export interface CarrierSourceAdjudication {
  readonly adjudication_id: string;
  readonly document: string;
  readonly signed_at: string;
  readonly conclusions: CarrierSourceConclusions;
  readonly conclusions_digest: Sha256Digest;
}

// 身份绑定：正式基线、S1.3 产品定义身份与 006 裁决来源摘要。
export interface CarrierDecisionBinding {
  readonly product_definition_id: string;
  readonly product_definition_digest: Sha256Digest;
  readonly source_adjudication: CarrierSourceAdjudication;
}

export interface CarrierIntegrationSurface {
  readonly surface: CarrierIntegrationSurfaceKind;
  readonly status: CarrierIntegrationSurfaceStatus;
}

export interface CarrierCandidateMaterial {
  readonly document: string;
  readonly role: CarrierCandidateMaterialRole;
}

// Web/UI 候选分支恢复条件：必须经 Change Request 与重新裁决才可恢复，缺一即拒绝。
export interface CarrierCandidateRecoveryConditions {
  readonly requires_change_request: boolean;
  readonly requires_re_adjudication: boolean;
  readonly trigger_summary: string;
}

export interface CarrierCandidateBranch {
  readonly branch_id: string;
  readonly carrier_kind: CarrierCandidateKind;
  readonly status: CarrierCandidateBranchStatus;
  readonly materials: readonly CarrierCandidateMaterial[];
  readonly recovery_conditions: CarrierCandidateRecoveryConditions;
}

export interface CarrierDecisionRecord {
  readonly primary_carrier: CarrierPrimaryCarrier;
  readonly truth_source_carrier: CarrierTruthSourceCarrier;
  readonly auxiliary_entry_policy: CarrierAuxiliaryEntryPolicy;
  readonly integration_surfaces: readonly CarrierIntegrationSurface[];
  readonly candidate_branches: readonly CarrierCandidateBranch[];
}

export interface CarrierSupersedesRef {
  readonly carrier_decision_id: string;
  readonly carrier_decision_digest: Sha256Digest;
}

export interface CarrierChangeRequestRef {
  readonly change_request_id: string;
  readonly change_request_digest: Sha256Digest;
}

export interface CarrierDecision {
  readonly schema_version: "1.0";
  readonly record_type: "carrier-decision";
  readonly carrier_decision_id: string;
  readonly status: "adjudicated";
  readonly project: CarrierDecisionProject;
  readonly binding: CarrierDecisionBinding;
  readonly binding_digest: Sha256Digest;
  readonly decision: CarrierDecisionRecord;
  readonly supersedes?: CarrierSupersedesRef;
  readonly change_request?: CarrierChangeRequestRef;
  readonly decided_at: string;
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateCarrierDecision: ValidateFunction = ajv.compile(carrierDecisionSchema);

function fail(code: CarrierDecisionErrorCode, message: string): never {
  throw new CarrierDecisionError(code, message);
}

function formatSchemaErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: "; " });
}

function assertSafeContent(value: unknown): void {
  try {
    assertNoSensitiveContent(value);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Sensitive content detected in carrier decision");
  }
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    fail("INVALID_CARRIER_DECISION", `Invalid ${label}`);
  }
  return timestamp;
}

function assertConclusionsMatchSignedPolicy(conclusions: CarrierSourceConclusions): void {
  if (conclusions.primary_carrier !== "skill-chat") {
    fail("MAINLINE_IMPERSONATION", "Source adjudication must not claim a non skill-chat carrier as the mainline");
  }
  if (conclusions.truth_source_carrier !== "project-documents-git") {
    fail("TRUTH_SOURCE_REJECTED", "Source adjudication must not drop the project document truth source");
  }
  if (conclusions.auxiliary_entry_policy !== "no-new-mainline-entry") {
    fail("MAINLINE_IMPERSONATION", "Source adjudication must not admit a new auxiliary mainline entry");
  }
  if (conclusions.integration_surface_policy !== "future-integration-surface-only") {
    fail("MAINLINE_IMPERSONATION", "Integration surfaces must remain future-only in the source adjudication");
  }
  if (conclusions.web_ui_policy !== "candidate-not-mainline") {
    fail("MAINLINE_IMPERSONATION", "Web/UI may only stay a candidate branch outside the mainline");
  }
}

function assertDecisionRecord(decision: CarrierDecisionRecord): void {
  if (decision.primary_carrier !== "skill-chat") {
    fail("MAINLINE_IMPERSONATION", `Carrier ${decision.primary_carrier} must not impersonate the current mainline`);
  }
  if (decision.truth_source_carrier !== "project-documents-git") {
    fail("TRUTH_SOURCE_REJECTED", "Pure chat without project document truth source is not a formal carrier");
  }
  if (decision.auxiliary_entry_policy !== "no-new-mainline-entry") {
    fail("MAINLINE_IMPERSONATION", "No auxiliary entry may join the mainline in this adjudication");
  }
  const surfaces = new Set<string>();
  for (const surface of decision.integration_surfaces) {
    if (surfaces.has(surface.surface)) {
      fail("INVALID_CARRIER_DECISION", `Duplicate integration surface: ${surface.surface}`);
    }
    surfaces.add(surface.surface);
    if (surface.status !== "future-integration-surface") {
      fail("MAINLINE_IMPERSONATION", `Integration surface ${surface.surface} must not become the mainline`);
    }
  }
  const branches = new Set<string>();
  for (const branch of decision.candidate_branches) {
    if (branches.has(branch.branch_id)) {
      fail("INVALID_CARRIER_DECISION", `Duplicate candidate branch: ${branch.branch_id}`);
    }
    branches.add(branch.branch_id);
    if (branch.status !== "candidate-not-mainline") {
      fail("MAINLINE_IMPERSONATION", `Candidate branch ${branch.branch_id} must not claim the mainline`);
    }
    const recovery = branch.recovery_conditions;
    if (recovery.requires_change_request !== true || recovery.requires_re_adjudication !== true || recovery.trigger_summary.length === 0) {
      fail("CANDIDATE_BRANCH_INVALID", `Candidate branch ${branch.branch_id} recovery must require a Change Request and re-adjudication`);
    }
  }
}

function assertOverrideChain(record: CarrierDecision): void {
  const supersedes = record.supersedes;
  const changeRequest = record.change_request;
  if (supersedes === undefined) {
    if (changeRequest !== undefined) {
      fail("INVALID_CARRIER_DECISION", "Change request reference requires a superseded carrier decision");
    }
    return;
  }
  if (changeRequest === undefined) {
    fail("UNAUTHORIZED_OVERRIDE", "A signed carrier decision can only be superseded through a Change Request");
  }
  if (supersedes.carrier_decision_id === record.carrier_decision_id) {
    fail("UNAUTHORIZED_OVERRIDE", "A carrier decision cannot supersede itself");
  }
}

export function parseCarrierDecision(value: unknown): CarrierDecision {
  let snapshot: ReturnType<typeof assertNoSensitiveFields>;
  try {
    snapshot = assertNoSensitiveFields(value);
  } catch (error) {
    if (error instanceof Error && /sensitive/i.test(error.message)) {
      fail("SENSITIVE_CONTENT_DETECTED", "Sensitive field detected in carrier decision");
    }
    fail("INVALID_CARRIER_DECISION", "Carrier decision must contain only JSON values");
  }
  assertSafeContent(snapshot);
  if (!validateCarrierDecision(snapshot) || !isPlainRecord(snapshot) || snapshot.record_type !== "carrier-decision") {
    fail("INVALID_CARRIER_DECISION", `Invalid carrier decision schema: ${formatSchemaErrors(validateCarrierDecision)}`);
  }
  const record = snapshot as unknown as CarrierDecision;

  const decidedAt = parseTimestamp(record.decided_at, "carrier decision time");
  const signedAt = parseTimestamp(record.binding.source_adjudication.signed_at, "source adjudication signoff time");
  try {
    assertDigestMatches(record.binding.source_adjudication.conclusions, record.binding.source_adjudication.conclusions_digest);
  } catch {
    fail("SOURCE_ADJUDICATION_MISMATCH", "Source adjudication conclusions digest does not match");
  }
  try {
    assertDigestMatches(record.binding, record.binding_digest);
  } catch {
    fail("BINDING_DIGEST_MISMATCH", "Carrier decision binding digest does not match");
  }
  if (signedAt > decidedAt) {
    fail("SOURCE_ADJUDICATION_MISMATCH", "Source adjudication must be signed before the carrier decision");
  }

  assertConclusionsMatchSignedPolicy(record.binding.source_adjudication.conclusions);
  assertDecisionRecord(record.decision);
  assertOverrideChain(record);
  return record;
}
