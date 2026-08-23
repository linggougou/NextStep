import assert from "node:assert/strict";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  ARCHITECTURE_RISK_PROJECT_FIXTURES,
  ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS,
  ARCHITECTURE_RISK_ROLLBACK_CATALOG,
  ARCHITECTURE_RISK_SOURCE_BINDINGS,
  ARCHITECTURE_RISK_STAGE,
  ARCHITECTURE_RISK_CATALOG,
  ArchitectureRiskAssessmentError,
  S1_6_FORMAL_BASELINE,
  evaluateArchitectureRiskAssessment,
  parseArchitectureRiskAssessment,
  type ArchitectureRiskAssessment,
  type ArchitectureRiskAssessmentCandidate,
  type ArchitectureRiskProjectBinding,
} from "../../src/domain/architecture-risk.ts";

const REQUIRED_FIELD_KEYS = [
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

const RISK_IDS = [
  "project-root-resolution-correct",
  "worktree-start-exact",
  "read-only-verification-effective",
  "task-creation-idempotent",
  "control-ref-single-writer-fencing",
  "host-receiver-atomic-idempotence",
  "control-ledger-corruption",
  "control-generation-monotonicity",
  "multi-file-logical-atomicity",
  "final-verification-precision",
  "credential-and-proof-no-replace",
  "credential-crash-durability",
  "audit-anchor-allowlist",
  "cas-race-safety",
  "formal-history-continuity",
  "formal-ref-worktree-separation",
  "acceptance-profile-correctness",
  "recovery-independent-of-chat",
  "sensitive-information-not-persisted",
  "archive-failure",
] as const;

const ROLLBACK_IDS = [
  "stop-auto-write-and-enter-change-request",
  "manual-isolated-fallback",
  "blocked-await-external-proof",
  "awaiting-formal-promotion",
  "awaiting-archive",
] as const;

function buildCandidate(
  activeProject: ArchitectureRiskProjectBinding = ARCHITECTURE_RISK_PROJECT_FIXTURES[0],
): ArchitectureRiskAssessmentCandidate {
  return {
    schema_version: "1.0",
    record_type: "architecture-risk-assessment-candidate",
    project: { ...activeProject },
    stage: ARCHITECTURE_RISK_STAGE,
    formal_baseline: S1_6_FORMAL_BASELINE,
    evidence_scope: "manual-isolated consumer contract",
    project_fixture_bindings: ARCHITECTURE_RISK_PROJECT_FIXTURES.map((binding) => ({ ...binding })),
    upstream_source_bindings: ARCHITECTURE_RISK_SOURCE_BINDINGS.map((binding) => ({ ...binding })),
    required_field_bindings: ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS.map((bindingKey) => ({
      binding_key: bindingKey,
      source_ref: `${ARCHITECTURE_RISK_SOURCE_BINDINGS[0].source_ref} / ${bindingKey}`,
      source_raw_sha256: ARCHITECTURE_RISK_SOURCE_BINDINGS[0].source_raw_sha256,
      binding_status: "bound" as const,
    })),
    technical_stack: {
      recommended: "Codex Skill + TypeScript/Node 按需辅助工具 + JSON Schema",
      alternatives: ["纯 Codex Skill 人工隔离执行"],
      rejection_reasons: ["不引入 Web/UI、数据库、常驻服务或新技术栈"],
    },
    architecture_model: {
      data_models: ["Project", "Stage", "Deliverable", "Change Request", "Milestone"],
      phase_gate_states: ["通过", "退回", "需讨论", "阻塞"],
      state_machine_model: "只允许依据已会签状态与门禁推进",
      ai_interaction_boundary: "主对话仅编排，独立任务产出证据",
      permissions_and_data_safety: "只读评估，不改 formal/control/目标项目工作树",
    },
    risk_bindings: ARCHITECTURE_RISK_CATALOG.map((risk) => ({
      ...risk,
      validation_method: `验证 ${risk.risk_id}`,
      failure_standard: `${risk.risk_id} 绑定不完整或证据不一致`,
      failure_handling: `停止推进并执行 ${risk.rollback_entry_id}`,
    })),
    rollback_entries: ARCHITECTURE_RISK_ROLLBACK_CATALOG.map((entry) => ({ ...entry })),
    scope: {
      support_level: "manual-isolated",
      interaction_profile: "headless",
      web_ui: false,
      database: false,
      persistent_service: false,
      p4_api_schema_frozen: false,
    },
  };
}

function cloneCandidate(candidate = buildCandidate()): Record<string, unknown> {
  return structuredClone(candidate) as unknown as Record<string, unknown>;
}

function expectError(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ArchitectureRiskAssessmentError, `应为 ArchitectureRiskAssessmentError，实际 ${String(error)}`);
    assert.equal(error.code, code);
    assert.notEqual(error.message, "");
    return true;
  };
}

test("冻结常量逐字匹配 packet 的 F15、10/20/5 契约", () => {
  assert.equal(S1_6_FORMAL_BASELINE, "7169e9b019fe2213ca76babb4122a84760bdf112");
  assert.equal(ARCHITECTURE_RISK_STAGE, "S5/P5/V1/M1.2/S1.6/PC-08");
  assert.deepEqual(ARCHITECTURE_RISK_REQUIRED_FIELD_KEYS, REQUIRED_FIELD_KEYS);
  assert.deepEqual(ARCHITECTURE_RISK_CATALOG.map(({ risk_id }) => risk_id), RISK_IDS);
  assert.deepEqual(ARCHITECTURE_RISK_ROLLBACK_CATALOG.map(({ rollback_id }) => rollback_id), ROLLBACK_IDS);
  assert.deepEqual(
    ARCHITECTURE_RISK_SOURCE_BINDINGS.map(({ source_id, source_raw_sha256 }) => [source_id, source_raw_sha256]),
    [
      ["005", "sha256:d406d2817647b7ddf9286bb285a4b2796736b24b705d57fdd9d2619fd249f586"],
      ["009", "sha256:51f129d29285bc068674e3b5ade511b5df199a682f0e0ba35464198252730886"],
      ["S4", "sha256:60a354a73c1f1df22c9cf26f81a68c44dab593682302d219588aa8ae62a2ea4c"],
      ["P3", "sha256:4e8f658d6bd3151211df4b9c5c1112502e836cd97e0a9ca914cf38424901fc4c"],
      ["P4", "sha256:edd41dc218f14ba2ae5b0766b6572b528f15e4cf86aafde77e0c2a8789521c75"],
    ],
  );
  assert.deepEqual(
    ARCHITECTURE_RISK_SOURCE_BINDINGS.map(({ source_ref }) => source_ref),
    [
      "docs/product-specs/005-stage-document-contracts.md §4.2",
      "docs/architecture/009-s4-technical-input-supplement.md §7",
      "docs/architecture/s4-technical-architecture.md §18",
      "docs/exec-plans/completed/p3-version-and-milestone-breakdown.md S1.6",
      "docs/design-docs/p4-execution-mechanism-design.md",
    ],
  );
  assert.equal(
    ARCHITECTURE_RISK_CATALOG[0]!.source_ref,
    "docs/architecture/s4-technical-architecture.md §18 行：项目根解析正确",
  );
  assert.equal(
    ARCHITECTURE_RISK_CATALOG[19]!.source_ref,
    "docs/architecture/009-s4-technical-input-supplement.md §7 行：归档失败",
  );
  const rollbackByRisk = new Map(
    ARCHITECTURE_RISK_CATALOG.map(({ risk_id, rollback_entry_id }) => [risk_id, rollback_entry_id]),
  );
  assert.equal(rollbackByRisk.get("read-only-verification-effective"), "manual-isolated-fallback");
  assert.equal(rollbackByRisk.get("control-ref-single-writer-fencing"), "stop-auto-write-and-enter-change-request");
  assert.equal(rollbackByRisk.get("final-verification-precision"), "awaiting-formal-promotion");
  assert.equal(rollbackByRisk.get("credential-and-proof-no-replace"), "awaiting-formal-promotion");
  assert.equal(rollbackByRisk.get("credential-crash-durability"), "awaiting-formal-promotion");
});

test("三类内存候选均得到 ACCEPTED，Q3=10/10=100%、Q11=20/20", () => {
  for (const project of ARCHITECTURE_RISK_PROJECT_FIXTURES) {
    const candidate = buildCandidate(project);
    const assessment = evaluateArchitectureRiskAssessment(candidate);
    assert.equal(assessment.status, "ACCEPTED");
    assert.equal(assessment.conclusion, "通过");
    assert.equal(assessment.project.project_id, project.project_id);
    assert.equal(assessment.formal_baseline, S1_6_FORMAL_BASELINE);
    assert.deepEqual(assessment.metrics.required_fields, { bound: 10, total: 10, percentage: 100 });
    assert.deepEqual(assessment.metrics.risks, { bound: 20, total: 20, percentage: 100 });
    assert.deepEqual(assessment.metrics.rollback_entries, { bound: 5, total: 5 });
    assert.equal(assessment.candidate_digest, digestJson(candidate));
    assert.deepEqual(parseArchitectureRiskAssessment(assessment), assessment);
  }
});

test("输入禁止 candidate_digest，输出只增加完整候选摘要与裁决字段", () => {
  const candidate = cloneCandidate();
  candidate.candidate_digest = `sha256:${"a".repeat(64)}`;
  assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("INVALID_ARCHITECTURE_RISK_ASSESSMENT"));

  const clean = buildCandidate();
  const assessment = evaluateArchitectureRiskAssessment(clean);
  assert.equal(assessment.candidate_digest, digestJson(clean));
  assert.equal(assessment.record_type, "architecture-risk-assessment");
});

test("十类 required field 缺失、额外、别名均 fail closed", () => {
  for (let index = 0; index < REQUIRED_FIELD_KEYS.length; index += 1) {
    const candidate = cloneCandidate();
    (candidate.required_field_bindings as unknown[]).splice(index, 1);
    assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("REQUIRED_FIELD_SET_MISMATCH"));
  }

  const extra = cloneCandidate();
  (extra.required_field_bindings as unknown[]).push({
    binding_key: "api_contract",
    source_ref: ARCHITECTURE_RISK_SOURCE_BINDINGS[0].source_ref,
    source_raw_sha256: ARCHITECTURE_RISK_SOURCE_BINDINGS[0].source_raw_sha256,
    binding_status: "bound",
  });
  assert.throws(() => evaluateArchitectureRiskAssessment(extra), expectError("REQUIRED_FIELD_SET_MISMATCH"));

  const alias = cloneCandidate();
  ((alias.required_field_bindings as Record<string, unknown>[])[0] as Record<string, unknown>).binding_key = "technical_targets";
  assert.throws(() => evaluateArchitectureRiskAssessment(alias), expectError("REQUIRED_FIELD_SET_MISMATCH"));
});

test("推荐技术栈、备选与不选原因缺一即拒绝", () => {
  for (const field of ["recommended", "alternatives", "rejection_reasons"] as const) {
    const candidate = cloneCandidate();
    delete (candidate.technical_stack as Record<string, unknown>)[field];
    assert.throws(
      () => evaluateArchitectureRiskAssessment(candidate),
      expectError("INVALID_ARCHITECTURE_RISK_ASSESSMENT"),
    );
  }
});

test("数据模型五类与门禁四态必须完整、顺序固定", () => {
  const missingModel = cloneCandidate();
  ((missingModel.architecture_model as Record<string, unknown>).data_models as unknown[]).pop();
  assert.throws(
    () => evaluateArchitectureRiskAssessment(missingModel),
    expectError("REQUIRED_FIELD_SET_MISMATCH"),
  );

  const wrongGate = cloneCandidate();
  ((wrongGate.architecture_model as Record<string, unknown>).phase_gate_states as unknown[])[1] = "已退回";
  assert.throws(
    () => evaluateArchitectureRiskAssessment(wrongGate),
    expectError("REQUIRED_FIELD_SET_MISMATCH"),
  );
});

test("risk 集合缺失、重复与未知 id 均 fail closed", () => {
  const missing = cloneCandidate();
  (missing.risk_bindings as unknown[]).pop();
  assert.throws(() => evaluateArchitectureRiskAssessment(missing), expectError("RISK_SET_MISMATCH"));

  const duplicate = cloneCandidate();
  const risks = duplicate.risk_bindings as Record<string, unknown>[];
  risks[1] = structuredClone(risks[0] as Record<string, unknown>);
  assert.throws(() => evaluateArchitectureRiskAssessment(duplicate), expectError("RISK_SET_MISMATCH"));

  const unknown = cloneCandidate();
  ((unknown.risk_bindings as Record<string, unknown>[])[0] as Record<string, unknown>).risk_id = "unknown-risk";
  assert.throws(() => evaluateArchitectureRiskAssessment(unknown), expectError("RISK_SET_MISMATCH"));
});

test("每项 risk 的 source/TG/owner/rollback 与失败三元组必须精确", () => {
  const mutations: ReadonlyArray<(risk: Record<string, unknown>) => void> = [
    (risk) => { risk.source_id = "009"; },
    (risk) => { risk.source_ref = "docs/architecture/other.md#section=18"; },
    (risk) => { risk.source_raw_sha256 = `sha256:${"0".repeat(64)}`; },
    (risk) => { risk.tg_bindings = ["TG-99"]; },
    (risk) => { risk.owner_milestone = "S9.9"; },
    (risk) => { risk.rollback_entry_id = "awaiting-archive"; },
    (risk) => { risk.validation_method = ""; },
    (risk) => { risk.failure_standard = ""; },
    (risk) => { risk.failure_handling = ""; },
  ];
  for (const mutate of mutations) {
    const candidate = cloneCandidate();
    mutate((candidate.risk_bindings as Record<string, unknown>[])[0] as Record<string, unknown>);
    assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("RISK_BINDING_MISMATCH"));
  }
});

test("五类 rollback 的 trigger/terminal/action/proof 任一漂移均 fail closed", () => {
  for (let index = 0; index < ARCHITECTURE_RISK_ROLLBACK_CATALOG.length; index += 1) {
    for (const field of ["trigger", "terminal_state", "next_action", "proof_expectation"] as const) {
      const candidate = cloneCandidate();
      const entry = (candidate.rollback_entries as Record<string, unknown>[])[index] as Record<string, unknown>;
      entry[field] = `${String(entry[field])}-漂移`;
      assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("ROLLBACK_SET_MISMATCH"));
    }
  }
});

test("F15、阶段、会签、跨项目与五份 source raw SHA 漂移均拒绝", () => {
  const nonF15 = cloneCandidate();
  nonF15.formal_baseline = "0".repeat(40);
  assert.throws(() => evaluateArchitectureRiskAssessment(nonF15), expectError("FORMAL_BASELINE_MISMATCH"));

  const wrongStage = cloneCandidate();
  wrongStage.stage = "S5/P5/V1/M1.2/S1.7/PC-08";
  assert.throws(() => evaluateArchitectureRiskAssessment(wrongStage), expectError("STAGE_MISMATCH"));

  const wrongEvidenceScope = cloneCandidate();
  wrongEvidenceScope.evidence_scope = "full consumer contract";
  assert.throws(() => evaluateArchitectureRiskAssessment(wrongEvidenceScope), expectError("OUT_OF_SCOPE_CAPABILITY"));

  const unsigned = cloneCandidate();
  ((unsigned.upstream_source_bindings as Record<string, unknown>[])[0] as Record<string, unknown>).signed_off = false;
  assert.throws(() => evaluateArchitectureRiskAssessment(unsigned), expectError("SOURCE_BINDING_MISMATCH"));

  const crossProject = cloneCandidate();
  (crossProject.project as Record<string, unknown>).record_digest = ARCHITECTURE_RISK_PROJECT_FIXTURES[1].record_digest;
  assert.throws(() => evaluateArchitectureRiskAssessment(crossProject), expectError("PROJECT_BINDING_MISMATCH"));

  const unknownProject = cloneCandidate();
  (unknownProject.project as Record<string, unknown>).project_id = "foreign-project";
  assert.throws(() => evaluateArchitectureRiskAssessment(unknownProject), expectError("PROJECT_BINDING_MISMATCH"));

  for (let index = 0; index < ARCHITECTURE_RISK_SOURCE_BINDINGS.length; index += 1) {
    const drift = cloneCandidate();
    ((drift.upstream_source_bindings as Record<string, unknown>[])[index] as Record<string, unknown>).source_raw_sha256 =
      `sha256:${String(index).repeat(64)}`;
    assert.throws(() => evaluateArchitectureRiskAssessment(drift), expectError("SOURCE_BINDING_MISMATCH"));
  }
});

test("十类字段的 005 人读 ref、raw SHA 与 bound 状态逐项重验", () => {
  const mutations: ReadonlyArray<(binding: Record<string, unknown>) => void> = [
    (binding) => { binding.binding_status = "missing"; },
    (binding) => { binding.source_ref = ARCHITECTURE_RISK_SOURCE_BINDINGS[0].source_ref; },
    (binding) => { binding.source_raw_sha256 = `sha256:${"e".repeat(64)}`; },
  ];
  for (const mutate of mutations) {
    const candidate = cloneCandidate();
    mutate((candidate.required_field_bindings as Record<string, unknown>[])[0] as Record<string, unknown>);
    assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("REQUIRED_FIELD_SET_MISMATCH"));
  }
});

test("full/Web/UI/P4 API Schema/数据库/常驻服务均超出 manual-isolated 范围", () => {
  const mutations: ReadonlyArray<(scope: Record<string, unknown>) => void> = [
    (scope) => { scope.support_level = "full"; },
    (scope) => { scope.interaction_profile = "ui"; },
    (scope) => { scope.web_ui = true; },
    (scope) => { scope.p4_api_schema_frozen = true; },
    (scope) => { scope.database = true; },
    (scope) => { scope.persistent_service = true; },
  ];
  for (const mutate of mutations) {
    const candidate = cloneCandidate();
    mutate(candidate.scope as Record<string, unknown>);
    assert.throws(() => evaluateArchitectureRiskAssessment(candidate), expectError("OUT_OF_SCOPE_CAPABILITY"));
  }
});

test("未知版本、额外字段、敏感字段/内容和非对象输入 fail closed", () => {
  const unknownVersion = cloneCandidate();
  unknownVersion.schema_version = "2.0";
  assert.throws(() => evaluateArchitectureRiskAssessment(unknownVersion), expectError("INVALID_ARCHITECTURE_RISK_ASSESSMENT"));

  const extra = cloneCandidate();
  extra.unexpected = true;
  assert.throws(() => evaluateArchitectureRiskAssessment(extra), expectError("INVALID_ARCHITECTURE_RISK_ASSESSMENT"));

  const sensitiveField = cloneCandidate();
  sensitiveField.api_token = "redacted-value";
  assert.throws(() => evaluateArchitectureRiskAssessment(sensitiveField), expectError("SENSITIVE_CONTENT_DETECTED"));

  const sensitiveContent = cloneCandidate();
  (sensitiveContent.technical_stack as Record<string, unknown>).recommended = "authorization: bearer abcdefghijklmnop";
  assert.throws(() => evaluateArchitectureRiskAssessment(sensitiveContent), expectError("SENSITIVE_CONTENT_DETECTED"));

  for (const value of [null, undefined, [], "candidate", 42, true]) {
    assert.throws(() => evaluateArchitectureRiskAssessment(value), expectError("INVALID_ARCHITECTURE_RISK_ASSESSMENT"));
  }
});

test("输出 parser 独立重验 digest、metrics、结论与 10/20/5 集合", () => {
  const assessment = evaluateArchitectureRiskAssessment(buildCandidate());
  const mutations: ReadonlyArray<(value: Record<string, unknown>) => void> = [
    (value) => { value.candidate_digest = `sha256:${"f".repeat(64)}`; },
    (value) => {
      const metrics = value.metrics as Record<string, unknown>;
      metrics.required_fields = { bound: 9, total: 10, percentage: 90 };
    },
    (value) => { value.conclusion = "阻塞"; },
    (value) => { value.status = "REJECTED"; },
    (value) => { (value.risk_bindings as unknown[]).pop(); },
    (value) => { (value.rollback_entries as unknown[]).pop(); },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(assessment) as unknown as Record<string, unknown>;
    mutate(forged);
    assert.throws(() => parseArchitectureRiskAssessment(forged), expectError("ASSESSMENT_INTEGRITY_MISMATCH"));
  }
});

test("输出 parser 拒绝未知字段、敏感内容与候选 record_type", () => {
  const assessment = evaluateArchitectureRiskAssessment(buildCandidate());
  const extra = structuredClone(assessment) as unknown as Record<string, unknown>;
  extra.extra = true;
  assert.throws(() => parseArchitectureRiskAssessment(extra), expectError("ASSESSMENT_INTEGRITY_MISMATCH"));

  assert.throws(
    () => parseArchitectureRiskAssessment(buildCandidate() as unknown as ArchitectureRiskAssessment),
    expectError("ASSESSMENT_INTEGRITY_MISMATCH"),
  );

  const sensitive = structuredClone(assessment) as unknown as Record<string, unknown>;
  sensitive.api_token = "redacted-value";
  assert.throws(
    () => parseArchitectureRiskAssessment(sensitive),
    expectError("ASSESSMENT_INTEGRITY_MISMATCH"),
  );
  assert.throws(
    () => parseArchitectureRiskAssessment(null),
    expectError("ASSESSMENT_INTEGRITY_MISMATCH"),
  );
});
