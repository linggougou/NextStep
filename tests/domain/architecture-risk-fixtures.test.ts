import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";

const FIXTURE_DIRECTORY = resolve(process.cwd(), "tests/fixtures/architecture-risk");
const S1_5_FIXTURE_DIRECTORY = resolve(process.cwd(), "tests/fixtures/write-consistency");
const FORMAL_BASELINE = "7169e9b019fe2213ca76babb4122a84760bdf112";
const EVIDENCE_SCOPE = "manual-isolated consumer contract";

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

const SOURCE_DIGESTS = {
  "005": "sha256:d406d2817647b7ddf9286bb285a4b2796736b24b705d57fdd9d2619fd249f586",
  "009": "sha256:51f129d29285bc068674e3b5ade511b5df199a682f0e0ba35464198252730886",
  S4: "sha256:60a354a73c1f1df22c9cf26f81a68c44dab593682302d219588aa8ae62a2ea4c",
  P3: "sha256:4e8f658d6bd3151211df4b9c5c1112502e836cd97e0a9ca914cf38424901fc4c",
  P4: "sha256:edd41dc218f14ba2ae5b0766b6572b528f15e4cf86aafde77e0c2a8789521c75",
} as const;

const RISK_ROWS = [
  ["project-root-resolution-correct", "S4", "项目根解析正确", ["TG-01", "TG-05", "TG-19"], "S3.1"],
  ["worktree-start-exact", "S4", "worktree 起点精确", ["TG-05", "TG-08", "TG-16", "TG-19"], "S3.3"],
  ["read-only-verification-effective", "S4", "只读验证有效", ["TG-08", "TG-13", "TG-19"], "S3.3"],
  ["task-creation-idempotent", "S4", "任务创建幂等", ["TG-05", "TG-09", "TG-19"], "S3.2"],
  ["control-ref-single-writer-fencing", "S4", "控制 ref 单写与 fencing", ["TG-09", "TG-10", "TG-19"], "S3.2"],
  ["host-receiver-atomic-idempotence", "S4", "宿主接收端原子幂等", ["TG-05", "TG-09", "TG-19"], "S3.2"],
  ["control-ledger-corruption", "S4", "控制台账损坏", ["TG-10", "TG-15", "TG-17", "TG-19"], "S3.5"],
  ["control-generation-monotonicity", "S4", "控制代际单调", ["TG-10", "TG-19"], "S3.5"],
  ["multi-file-logical-atomicity", "S4", "多文件逻辑原子", ["TG-11", "TG-17", "TG-19"], "S1.5"],
  ["final-verification-precision", "S4", "最终复验精确", ["TG-13", "TG-14", "TG-19"], "S3.4"],
  ["credential-and-proof-no-replace", "S4", "凭证与证明不可替换", ["TG-14", "TG-16", "TG-19"], "S3.4"],
  ["credential-crash-durability", "S4", "凭证崩溃持久性", ["TG-14", "TG-16", "TG-19"], "S3.4"],
  ["audit-anchor-allowlist", "S4", "审计锚白名单", ["TG-14", "TG-19"], "S3.4"],
  ["cas-race-safety", "S4", "CAS 竞争安全", ["TG-12", "TG-14", "TG-19"], "S3.4"],
  ["formal-history-continuity", "S4", "正式历史连续", ["TG-14", "TG-19"], "S3.4"],
  ["formal-ref-worktree-separation", "S4", "正式 ref 与工作树分离", ["TG-12", "TG-19"], "S3.4"],
  ["acceptance-profile-correctness", "S4", "验收配置正确", ["TG-04", "TG-19"], "S1.4"],
  ["recovery-independent-of-chat", "S4", "恢复不依赖聊天", ["TG-15", "TG-17", "TG-19"], "S3.5"],
  ["sensitive-information-not-persisted", "S4", "敏感信息不落盘", ["TG-16", "TG-19"], "S3.2"],
  ["archive-failure", "009", "归档失败", ["TG-18", "TG-19"], "S4.3"],
] as const;

const ROLLBACK_ROWS = [
  ["stop-auto-write-and-enter-change-request", "typescript-runtime-failure", "停止自动写入", "进入 Change Request", "固定失败回执且 formal/control/工作树不变"],
  ["manual-isolated-fallback", "adapter-failure", "manual-isolated", "切换人工计划隔离执行", "adapter 拒绝证据与降级模式回执"],
  ["blocked-await-external-proof", "ledger-undecidable", "blocked", "等待外部证据或人工裁决", "缺失或矛盾台账证据且无状态提升"],
  ["awaiting-formal-promotion", "promotion-unverifiable", "待正式提升", "保留候选并停止自动 CAS", "候选与锚证据保留且 formal 不变"],
  ["awaiting-archive", "archive-failure", "待归档", "重试或人工归档", "正式结论与 formal 不变且归档失败可追溯"],
] as const;

const PROJECT_FIXTURE_BINDINGS = [
  ["community-workshop", "positive/community-workshop-write.json", "wc-community-workshop-positive-001", "sha256:439968591d6272e6ebfe97dc5343ecb3cfdb52e34aa87c6e5c31c6f1668cd96f"],
  ["expense-reminder", "positive/expense-reminder-write.json", "wc-expense-reminder-positive-002", "sha256:ad53d318bc91123c236600ddf9353ee87eaca4688435ca85674f61192676b750"],
  ["project-delivery-tool", "positive/project-delivery-tool-write.json", "wc-project-delivery-tool-positive-003", "sha256:93a5624300700739f5b047da887b29bf2672d2acda86534f287c11ef3a5e1b2a"],
] as const;

const REQUIRED_NEGATIVE_KINDS = [
  "unknown-schema",
  "extra-field",
  "sensitive-field",
  "wrong-stage",
  "non-f15",
  "source-digest-drift",
  "unsigned-source",
  "cross-project-binding",
  "missing-risk",
  "duplicate-risk",
  "unknown-risk",
] as const;

interface RiskCatalog {
  readonly schema_version: string;
  readonly record_type: string;
  readonly evidence_scope: string;
  readonly formal_baseline: string;
  readonly required_field_keys: readonly string[];
  readonly source_bindings: readonly {
    readonly source_id: keyof typeof SOURCE_DIGESTS;
    readonly source_ref: string;
    readonly source_raw_sha256: string;
  }[];
  readonly project_fixture_bindings: readonly {
    readonly project_id: string;
    readonly fixture_ref: string;
    readonly scenario_id: string;
    readonly record_digest: string;
  }[];
  readonly risk_catalog: readonly {
    readonly risk_id: string;
    readonly source_id: string;
    readonly source_ref: string;
    readonly source_raw_sha256: string;
    readonly section: string;
    readonly row_label: string;
    readonly validation_method: string;
    readonly failure_standard: string;
    readonly failure_handling: string;
    readonly tg_bindings: readonly string[];
    readonly owner_milestone: string;
    readonly rollback_entry_id: string;
  }[];
  readonly rollback_catalog: readonly {
    readonly rollback_id: string;
    readonly trigger: string;
    readonly terminal_state: string;
    readonly next_action: string;
    readonly proof_expectation: string;
  }[];
}

interface FixtureRecord {
  readonly schema_version: string;
  readonly record_type: string;
  readonly fixture_id: string;
  readonly fixture_class: "positive" | "negative";
  readonly evidence_scope: string;
  readonly source_fixture: {
    readonly project_id: string;
    readonly fixture_ref: string;
    readonly scenario_id: string;
    readonly record_digest: string;
  };
  readonly candidate?: Record<string, unknown>;
  readonly base_fixture_ref?: string;
  readonly negative_kind?: string;
  readonly mutation?: { readonly operation: string; readonly path: string; readonly value?: unknown };
  readonly expected: { readonly outcome: string; readonly error_code?: string };
}

interface FixtureIndex {
  readonly schema_version: string;
  readonly record_type: string;
  readonly digest_contract: { readonly algorithm: string; readonly canonicalization: string; readonly excluded_fields: readonly string[] };
  readonly risk_catalog: { readonly name: string; readonly record_digest: string };
  readonly fixtures: readonly {
    readonly name: string;
    readonly fixture_id: string;
    readonly fixture_class: string;
    readonly record_digest: string;
  }[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

test("risk catalog 精确冻结 10/20/5、五份上游摘要与三类 S1.5 binding", async () => {
  const catalog = await readJson<RiskCatalog>(join(FIXTURE_DIRECTORY, "risk-catalog.json"));

  assert.equal(catalog.schema_version, "1.0");
  assert.equal(catalog.record_type, "architecture-risk-catalog");
  assert.equal(catalog.evidence_scope, EVIDENCE_SCOPE);
  assert.equal(catalog.formal_baseline, FORMAL_BASELINE);
  assert.deepEqual(catalog.required_field_keys, REQUIRED_FIELD_KEYS);
  assert.equal(catalog.source_bindings.length, 5);
  assert.deepEqual(
    Object.fromEntries(catalog.source_bindings.map((source) => [source.source_id, source.source_raw_sha256])),
    SOURCE_DIGESTS,
  );
  for (const source of catalog.source_bindings) assert.ok(source.source_ref.length > 0);

  assert.equal(catalog.risk_catalog.length, 20);
  assert.equal(new Set(catalog.risk_catalog.map((risk) => risk.risk_id)).size, 20);
  for (const [index, expected] of RISK_ROWS.entries()) {
    const risk = catalog.risk_catalog[index]!;
    const [riskId, sourceId, rowLabel, tgBindings, ownerMilestone] = expected;
    assert.equal(risk.risk_id, riskId);
    assert.equal(risk.source_id, sourceId);
    assert.equal(risk.section, sourceId === "S4" ? "18" : "7");
    assert.equal(risk.row_label, rowLabel);
    assert.deepEqual(risk.tg_bindings, tgBindings);
    assert.equal(risk.owner_milestone, ownerMilestone);
    assert.equal(risk.source_raw_sha256, SOURCE_DIGESTS[sourceId]);
    assert.ok(risk.source_ref.includes(rowLabel));
    assert.ok(risk.validation_method.length > 0);
    assert.ok(risk.failure_standard.length > 0);
    assert.ok(risk.failure_handling.length > 0);
    assert.ok(ROLLBACK_ROWS.some(([rollbackId]) => rollbackId === risk.rollback_entry_id));
  }

  assert.deepEqual(
    catalog.rollback_catalog.map((row) => [row.rollback_id, row.trigger, row.terminal_state, row.next_action, row.proof_expectation]),
    ROLLBACK_ROWS,
  );
  assert.deepEqual(
    catalog.project_fixture_bindings.map((row) => [row.project_id, row.fixture_ref, row.scenario_id, row.record_digest]),
    PROJECT_FIXTURE_BINDINGS,
  );
});

test("architecture-risk index 以 RFC8785 摘要覆盖三类正例与至少十一类负例", async () => {
  const index = await readJson<FixtureIndex>(join(FIXTURE_DIRECTORY, "index.json"));
  assert.equal(index.schema_version, "1.0");
  assert.equal(index.record_type, "architecture-risk-fixture-index");
  assert.equal(index.digest_contract.algorithm, "sha256");
  assert.equal(index.digest_contract.canonicalization, "RFC8785");
  assert.deepEqual(index.digest_contract.excluded_fields, []);
  assert.equal(index.risk_catalog.name, "risk-catalog.json");
  const catalog = await readJson<unknown>(join(FIXTURE_DIRECTORY, index.risk_catalog.name));
  assert.equal(index.risk_catalog.record_digest, digestJson(catalog));

  const names = index.fixtures.map((entry) => entry.name);
  assert.equal(names.length, new Set(names).size);
  assert.equal(index.fixtures.filter((entry) => entry.fixture_class === "positive").length, 3);
  assert.ok(index.fixtures.filter((entry) => entry.fixture_class === "negative").length >= 11);
  const diskNames = (await Promise.all(["positive", "negative"].map(async (directory) =>
    (await readdir(join(FIXTURE_DIRECTORY, directory))).filter((name) => name.endsWith(".json")).map((name) => `${directory}/${name}`),
  ))).flat().sort();
  assert.deepEqual([...names].sort(), diskNames);

  for (const entry of index.fixtures) {
    const fixture = await readJson<FixtureRecord>(join(FIXTURE_DIRECTORY, entry.name));
    assert.equal(fixture.fixture_id, entry.fixture_id);
    assert.equal(fixture.fixture_class, entry.fixture_class);
    assert.equal(fixture.evidence_scope, EVIDENCE_SCOPE);
    assert.equal(entry.record_digest, digestJson(fixture));
  }
});

test("三类正例回读 S1.5 scenario_id、digest 与项目身份且候选覆盖精确契约", async () => {
  const s1_5Index = await readJson<{ readonly scenarios: readonly { readonly name: string; readonly scenario_id: string; readonly record_digest: string }[] }>(
    join(S1_5_FIXTURE_DIRECTORY, "index.json"),
  );
  const catalog = await readJson<RiskCatalog>(join(FIXTURE_DIRECTORY, "risk-catalog.json"));

  for (const [projectId, fixtureRef, scenarioId, recordDigest] of PROJECT_FIXTURE_BINDINGS) {
    const sourceEntry = s1_5Index.scenarios.find((entry) => entry.name === fixtureRef);
    assert.deepEqual(sourceEntry, { name: fixtureRef, scenario_id: scenarioId, record_digest: recordDigest });
    const sourceFixture = await readJson<{ readonly scenario_id: string; readonly target_project: { readonly project_id: string } }>(
      join(S1_5_FIXTURE_DIRECTORY, fixtureRef),
    );
    assert.equal(sourceFixture.scenario_id, scenarioId);
    assert.equal(sourceFixture.target_project.project_id, projectId);
    assert.equal(digestJson(sourceFixture), recordDigest);

    const fixture = await readJson<FixtureRecord>(join(FIXTURE_DIRECTORY, `positive/${projectId}.json`));
    assert.equal(fixture.fixture_class, "positive");
    assert.deepEqual(fixture.source_fixture, { project_id: projectId, fixture_ref: fixtureRef, scenario_id: scenarioId, record_digest: recordDigest });
    assert.equal(fixture.expected.outcome, "ACCEPTED");
    assert.ok(fixture.candidate);
    assert.equal(fixture.candidate.schema_version, "1.0");
    assert.equal(fixture.candidate.record_type, "architecture-risk-assessment-candidate");
    assert.equal(fixture.candidate.stage, "S5/P5/V1/M1.2/S1.6/PC-08");
    assert.equal(fixture.candidate.formal_baseline, FORMAL_BASELINE);
    assert.equal(fixture.candidate.evidence_scope, EVIDENCE_SCOPE);
    assert.equal(Object.hasOwn(fixture.candidate, "candidate_digest"), false);
    assert.deepEqual(fixture.candidate.scope, {
      support_level: "manual-isolated",
      interaction_profile: "headless",
      web_ui: false,
      database: false,
      persistent_service: false,
      p4_api_schema_frozen: false,
    });
    assert.equal(Object.hasOwn(fixture.candidate, "support_level"), false);
    assert.deepEqual(fixture.candidate.project, {
      project_id: projectId,
      scenario_id: scenarioId,
      record_digest: recordDigest,
    });
    assert.deepEqual(
      fixture.candidate.project_fixture_bindings,
      PROJECT_FIXTURE_BINDINGS.map(([bindingProjectId, , bindingScenarioId, bindingDigest]) => ({
        project_id: bindingProjectId,
        scenario_id: bindingScenarioId,
        record_digest: bindingDigest,
      })),
    );
    assert.deepEqual(
      (fixture.candidate.upstream_source_bindings as readonly {
        readonly source_id: string;
        readonly source_raw_sha256: string;
        readonly signed_off: boolean;
      }[]).map(({ source_id, source_raw_sha256, signed_off }) => ({ source_id, source_raw_sha256, signed_off })),
      Object.entries(SOURCE_DIGESTS).map(([source_id, source_raw_sha256]) => ({ source_id, source_raw_sha256, signed_off: true })),
    );
    assert.deepEqual(
      (fixture.candidate.required_field_bindings as readonly { readonly binding_key: string }[]).map((binding) => binding.binding_key),
      REQUIRED_FIELD_KEYS,
    );
    for (const binding of fixture.candidate.required_field_bindings as readonly {
      readonly source_raw_sha256: string;
      readonly binding_status: string;
    }[]) {
      assert.equal(binding.source_raw_sha256, SOURCE_DIGESTS["005"]);
      assert.equal(binding.binding_status, "bound");
    }
    assert.deepEqual(fixture.candidate.architecture_model, {
      data_models: ["Project", "Stage", "Deliverable", "Change Request", "Milestone"],
      phase_gate_states: ["通过", "退回", "需讨论", "阻塞"],
      state_machine_model: "只允许依据已会签状态与门禁推进",
      ai_interaction_boundary: "主对话仅编排，独立任务产出证据",
      permissions_and_data_safety: "只读评估，不改 formal/control/目标项目工作树",
    });
    assert.deepEqual(fixture.candidate.risk_bindings, catalog.risk_catalog);
    assert.deepEqual(fixture.candidate.rollback_entries, catalog.rollback_catalog);
  }
});

test("负例 fixture 覆盖 packet 要求的十一类拒绝且每份声明单一 mutation", async () => {
  const index = await readJson<FixtureIndex>(join(FIXTURE_DIRECTORY, "index.json"));
  const negativeEntries = index.fixtures.filter((entry) => entry.fixture_class === "negative");
  const kinds = new Set<string>();

  for (const entry of negativeEntries) {
    const fixture = await readJson<FixtureRecord>(join(FIXTURE_DIRECTORY, entry.name));
    assert.equal(fixture.fixture_class, "negative");
    assert.equal(fixture.expected.outcome, "REJECTED");
    assert.match(fixture.expected.error_code ?? "", /^[A-Z][A-Z0-9_]+$/);
    assert.equal(fixture.base_fixture_ref, "positive/community-workshop.json");
    assert.ok(fixture.negative_kind);
    assert.ok(fixture.mutation);
    assert.ok(["add", "remove", "replace", "duplicate"].includes(fixture.mutation.operation));
    assert.ok(fixture.mutation.path.startsWith("/candidate/"));
    assert.equal(Object.hasOwn(fixture, "candidate"), false, "负例只声明相对正例的单一 mutation，禁止复制完整候选");
    kinds.add(fixture.negative_kind);
  }

  for (const requiredKind of REQUIRED_NEGATIVE_KINDS) {
    assert.ok(kinds.has(requiredKind), `缺少 packet 冻结负例 ${requiredKind}`);
  }
});
