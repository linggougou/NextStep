import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { deriveProductDefinitionId, parseProductDefinitionCandidate } from "../../src/domain/product-definition.ts";
import {
  AcceptanceProfileError,
  CORE_ACCEPTANCE_TYPES,
  deriveAcceptanceProfileId,
  evaluateAcceptanceProfile,
  INDEPENDENT_EVIDENCE_TASK_KINDS,
  NEXTSTEP_KERNEL_REPOSITORY_ID,
  type AcceptanceProfileCandidate,
  type AcceptanceProfileDecision,
} from "../../src/domain/acceptance-profile.ts";

const DECISION_FIELDS = [
  "schema_version",
  "record_type",
  "status",
  "conclusion",
  "profile_id",
  "project",
  "route",
  "bindings",
  "candidate_digest",
  "enabled_acceptances",
  "ui_requirements",
  "rejection",
] as const;

interface ProfileFixture {
  readonly evidence_scope: string;
  readonly fixture_type: string;
  readonly expected: {
    readonly mode: "decision" | "error";
    readonly status?: "accepted" | "rejected";
    readonly conclusion?: string;
    readonly rejection_code?: string | null;
    readonly code?: string;
  };
  readonly upstream_references?: {
    readonly product_definition_fixture?: string;
    readonly note?: string;
    readonly carrier_decision_reference?: { readonly fixture?: string; readonly candidate?: Record<string, unknown> };
  };
  readonly candidate: Record<string, unknown>;
}

const headlessFixtures = [
  "headless-community-workshop",
  "headless-expense-reminder",
  "headless-project-delivery-tool",
] as const;

const decisionFixtures = [
  ...headlessFixtures,
  "ui-with-evidence",
  "self-profile-headless",
  "conflict-headless-requires-ui",
  "conflict-ui-route-skips-ui",
  "conflict-ui-route-disables-product",
  "ui-missing-evidence",
  "self-profile-ui-enabled",
  "evidence-duty-violation",
] as const;

async function loadFixture(name: string): Promise<ProfileFixture> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), `tests/fixtures/acceptance-profile/${name}.json`), "utf8"),
  ) as ProfileFixture;
}

function assertErrorWithCode(promise: () => unknown, code: string): void {
  assert.throws(promise, (error: unknown) => error instanceof AcceptanceProfileError && error.code === code);
}

function rebaseProfileId(candidate: Record<string, unknown>): Record<string, unknown> {
  candidate.profile_id = deriveAcceptanceProfileId(candidate);
  return candidate;
}

test("headless 三类目标项目 fixture 裁决为适用且禁用 UI 验收", async () => {
  for (const name of headlessFixtures) {
    const fixture = await loadFixture(name);
    assert.equal(fixture.evidence_scope, "manual-isolated consumer contract");
    const decision = evaluateAcceptanceProfile(fixture.candidate);
    assert.equal(decision.schema_version, "1.0");
    assert.equal(decision.record_type, "acceptance-profile-decision");
    assert.equal(decision.status, "accepted");
    assert.equal(decision.conclusion, "通过");
    assert.equal(decision.rejection, null);
    assert.equal(decision.profile_id, fixture.candidate.profile_id);
    assert.equal(decision.profile_id, deriveAcceptanceProfileId(fixture.candidate));
    assert.deepEqual(decision.project, fixture.candidate.project);
    assert.deepEqual(decision.route, fixture.candidate.route);
    assert.deepEqual(decision.bindings, fixture.candidate.bindings);
    assert.equal(decision.candidate_digest, digestJson(fixture.candidate));
    assert.deepEqual(decision.enabled_acceptances, [...CORE_ACCEPTANCE_TYPES]);
    assert.deepEqual(decision.ui_requirements, { status: "disabled" });
    assert.deepEqual(Object.keys(decision), [...DECISION_FIELDS]);
  }
});

test("含 UI 路线在具备 UI 设计真源与还原证据时追加 UI 验收并裁决适用", async () => {
  const fixture = await loadFixture("ui-with-evidence");
  const decision = evaluateAcceptanceProfile(fixture.candidate);
  assert.equal(decision.status, "accepted");
  assert.equal(decision.conclusion, "通过");
  assert.equal(decision.route.kind, "ui");
  assert.deepEqual(decision.enabled_acceptances, [...CORE_ACCEPTANCE_TYPES, "ui_restoration"]);
  const candidateUi = (fixture.candidate.acceptances as Record<string, unknown>).ui_restoration as Record<string, unknown>;
  assert.deepEqual(decision.ui_requirements, {
    status: "required",
    ui_design_source: candidateUi.ui_design_source,
    ui_restoration_evidence: candidateUi.ui_restoration_evidence,
  });
  assert.equal(decision.rejection, null);
});

test("NextStep 自身 headless Profile 适用（Skill-only 路线允许三类验收）", async () => {
  const fixture = await loadFixture("self-profile-headless");
  const decision = evaluateAcceptanceProfile(fixture.candidate);
  assert.equal(decision.status, "accepted");
  assert.equal(decision.project.repository_id, NEXTSTEP_KERNEL_REPOSITORY_ID);
  assert.deepEqual(decision.enabled_acceptances, [...CORE_ACCEPTANCE_TYPES]);
  assert.deepEqual(decision.ui_requirements, { status: "disabled" });
});

test("上游绑定连续性：product_definition 绑定与 S1.3 fixture 身份一致", async () => {
  for (const name of headlessFixtures) {
    const fixture = await loadFixture(name);
    const upstream = fixture.upstream_references?.product_definition_fixture;
    assert.ok(upstream, `${name} 必须携带 product_definition 上游引用`);
    const pdFixture = JSON.parse(await readFile(resolve(process.cwd(), upstream as string), "utf8")) as {
      readonly frozen_requirement: Record<string, unknown>;
      readonly product_definition: Record<string, unknown>;
    };
    const parsed = parseProductDefinitionCandidate(pdFixture.product_definition);
    const bindings = fixture.candidate.bindings as Record<string, unknown>;
    assert.equal(bindings.product_definition_id, parsed.product_definition_id);
    assert.equal(parsed.product_definition_id, deriveProductDefinitionId(parsed.frozen_requirement));
    const record = { ...parsed } as Record<string, unknown>;
    delete record.status;
    assert.equal(bindings.product_definition_digest, digestJson(record));
    assert.equal(canonicalizeJson(fixture.candidate.project), canonicalizeJson(parsed.frozen_requirement.project));
    assert.equal(
      canonicalizeJson(fixture.candidate.project),
      canonicalizeJson((pdFixture.frozen_requirement as Record<string, unknown>).project),
    );
  }
});

test("carrier_decision_digest 与 W2 真实载体裁决记录摘要一致", async () => {
  for (const name of decisionFixtures) {
    const fixture = await loadFixture(name);
    const reference = fixture.upstream_references?.carrier_decision_reference?.candidate;
    if (reference === undefined) {
      continue;
    }
    const bindings = fixture.candidate.bindings as Record<string, unknown>;
    assert.equal(bindings.carrier_decision_digest, digestJson(reference), `${name} carrier 真实绑定摘要不一致`);
  }
});

test("路线/Profile 冲突一律阻塞且绝不降级为 headless", async () => {
  const expectedCodes: Record<string, string> = {
    "conflict-headless-requires-ui": "PROFILE_CONFLICT",
    "conflict-ui-route-skips-ui": "PROFILE_CONFLICT",
    "conflict-ui-route-disables-product": "PROFILE_CONFLICT",
    "ui-missing-evidence": "UI_EVIDENCE_MISSING",
    "self-profile-ui-enabled": "KERNEL_ROUTE_UI_FORBIDDEN",
    "evidence-duty-violation": "EVIDENCE_DUTY_VIOLATION",
  };
  for (const [name, code] of Object.entries(expectedCodes)) {
    const fixture = await loadFixture(name);
    assert.equal(fixture.expected.mode, "decision");
    assert.equal(fixture.expected.status, "rejected");
    assert.equal(fixture.expected.conclusion, "阻塞");
    const decision = evaluateAcceptanceProfile(fixture.candidate);
    assert.equal(decision.status, "rejected", `${name} 必须被拒绝`);
    assert.equal(decision.conclusion, "阻塞", `${name} 必须阻塞`);
    assert.deepEqual(decision.enabled_acceptances, []);
    assert.notEqual(decision.rejection, null);
    assert.equal(decision.rejection?.code, code);
    assert.ok((decision.rejection?.reasons.length ?? 0) > 0);
    assert.deepEqual(Object.keys(decision), [...DECISION_FIELDS]);
    // 绝不降级：被拒绝裁决不得携带任何“已按 headless 生效”的 Profile 载荷
    assert.notEqual(decision.status, "accepted");
    assert.deepEqual(decision.ui_requirements, { status: "disabled" });
  }
});

test("含 UI 路线缺 UI 设计真源或还原证据时阻塞（含空证据列表）", async () => {
  const base = await loadFixture("ui-with-evidence");
  const candidate = structuredClone(base.candidate) as Record<string, unknown>;
  const ui = (candidate.acceptances as Record<string, unknown>).ui_restoration as Record<string, unknown>;
  delete ui.ui_design_source;
  rebaseProfileId(candidate);
  const missingSource = evaluateAcceptanceProfile(candidate);
  assert.equal(missingSource.status, "rejected");
  assert.equal(missingSource.conclusion, "阻塞");
  assert.equal(missingSource.rejection?.code, "UI_EVIDENCE_MISSING");

  const emptyEvidence = structuredClone(base.candidate) as Record<string, unknown>;
  const emptyUi = (emptyEvidence.acceptances as Record<string, unknown>).ui_restoration as Record<string, unknown>;
  emptyUi.ui_restoration_evidence = [];
  rebaseProfileId(emptyEvidence);
  const emptyList = evaluateAcceptanceProfile(emptyEvidence);
  assert.equal(emptyList.status, "rejected");
  assert.equal(emptyList.conclusion, "阻塞");
  assert.equal(emptyList.rejection?.code, "UI_EVIDENCE_MISSING");
});

test("独立证据任务不得改变 Profile 适用性", async () => {
  const fixture = await loadFixture("evidence-duty-violation");
  const decision = evaluateAcceptanceProfile(fixture.candidate);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.rejection?.code, "EVIDENCE_DUTY_VIOLATION");
  assert.equal(decision.conclusion, "阻塞");

  const base = await loadFixture("headless-community-workshop");
  for (const taskKind of INDEPENDENT_EVIDENCE_TASK_KINDS) {
    const candidate = structuredClone(base.candidate) as Record<string, unknown>;
    (candidate.origin as Record<string, unknown>).task_kind = taskKind;
    rebaseProfileId(candidate);
    const rejected = evaluateAcceptanceProfile(candidate);
    assert.equal(rejected.status, "rejected", `${taskKind} 不得配置 Profile`);
    assert.equal(rejected.rejection?.code, "EVIDENCE_DUTY_VIOLATION");
  }
});

test("契约 fail closed：未知版本、未知字段、缺必填字段、敏感字段与敏感内容", async () => {
  const unknownVersion = await loadFixture("unknown-version");
  const unknownField = await loadFixture("unknown-field");
  const missingField = await loadFixture("missing-required-field");
  const sensitiveField = await loadFixture("sensitive-field");
  const sensitiveContent = await loadFixture("sensitive-content");
  assertErrorWithCode(() => evaluateAcceptanceProfile(unknownVersion.candidate), "INVALID_ACCEPTANCE_PROFILE");
  assertErrorWithCode(() => evaluateAcceptanceProfile(unknownField.candidate), "INVALID_ACCEPTANCE_PROFILE");
  assertErrorWithCode(() => evaluateAcceptanceProfile(missingField.candidate), "INVALID_ACCEPTANCE_PROFILE");
  assertErrorWithCode(() => evaluateAcceptanceProfile(sensitiveField.candidate), "SENSITIVE_CONTENT_DETECTED");
  assertErrorWithCode(() => evaluateAcceptanceProfile(sensitiveContent.candidate), "SENSITIVE_CONTENT_DETECTED");
});

test("Profile ID 派生摘要不匹配时按身份冲突拒绝", async () => {
  const mismatch = await loadFixture("profile-id-mismatch");
  assertErrorWithCode(() => evaluateAcceptanceProfile(mismatch.candidate), "IDENTITY_CONFLICT");
});

test("非对象与非 JSON 输入 fail closed", async () => {
  for (const input of [null, undefined, "acceptance-profile", 42, true, []]) {
    assertErrorWithCode(() => evaluateAcceptanceProfile(input), "INVALID_ACCEPTANCE_PROFILE");
  }
  assertErrorWithCode(() => deriveAcceptanceProfileId(null), "INVALID_ACCEPTANCE_PROFILE");
  assertErrorWithCode(() => deriveAcceptanceProfileId({ project: {} }), "INVALID_ACCEPTANCE_PROFILE");
});

test("三类核心验收缺任一即冲突（headless 与 ui 路线一致）", async () => {
  const base = await loadFixture("headless-community-workshop");
  for (const field of CORE_ACCEPTANCE_TYPES) {
    const candidate = structuredClone(base.candidate) as Record<string, unknown>;
    ((candidate.acceptances as Record<string, unknown>)[field] as Record<string, unknown>).enabled = false;
    rebaseProfileId(candidate);
    const decision = evaluateAcceptanceProfile(candidate);
    assert.equal(decision.status, "rejected");
    assert.equal(decision.rejection?.code, "PROFILE_CONFLICT");
    assert.equal(decision.conclusion, "阻塞");
  }
});

test("headless 路线携带 UI 证据字段即冲突", async () => {
  const base = await loadFixture("headless-community-workshop");
  const candidate = structuredClone(base.candidate) as Record<string, unknown>;
  const ui = (candidate.acceptances as Record<string, unknown>).ui_restoration as Record<string, unknown>;
  ui.ui_design_source = { pointer: "docs/design-docs/ui-design-source.md", value_digest: `sha256:${"ab".repeat(32)}` };
  rebaseProfileId(candidate);
  const decision = evaluateAcceptanceProfile(candidate);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.rejection?.code, "PROFILE_CONFLICT");
});

test("裁决确定性：同一候选两次评估结果完全一致", async () => {
  const fixture = await loadFixture("headless-expense-reminder");
  const first = evaluateAcceptanceProfile(fixture.candidate);
  const second = evaluateAcceptanceProfile(JSON.parse(JSON.stringify(fixture.candidate)));
  assert.deepEqual(second, first);
  assert.equal(canonicalizeJson(second), canonicalizeJson(first));
  assert.equal(second.candidate_digest, first.candidate_digest);
});

test("kernel 仓库身份常量与运行时检查点身份一致", () => {
  assert.equal(
    NEXTSTEP_KERNEL_REPOSITORY_ID,
    "sha256:d11253328d36050bd559844c64b438e9b84e0c13125184e9b01e1e7cf23a8c56",
  );
});
