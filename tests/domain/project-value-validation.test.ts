import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  ProjectValueValidationError,
  evaluateProjectValueRuns,
} from "../../src/domain/project-value-validation.ts";

const sha = (character: string) => `sha256:${character.repeat(64)}`;

function valueRun(runId: string, overrides: any = {}): any {
  const { metrics: metricOverrides = {}, user_confirmation: confirmationOverrides = {}, ...topLevelOverrides } = overrides;
  const run = {
    schema_version: "1.0",
    run_id: runId,
    run_kind: "real",
    collection_mode: "prospective",
    project_origin: "external-user-project",
    project_identity: digestJson({ project: runId }),
    evidence_digest: digestJson({ evidence: runId }),
    evidence_binding_digest: "",
    user_authorization_ref: `authorization:${runId}`,
    started_at: "2026-08-26T01:00:00.000Z",
    ended_at: "2026-08-26T02:00:00.000Z",
    used_nextstep: true,
    metrics: {
      time_to_first_frozen_requirement_seconds: 10,
      user_intervention_count: 1,
      false_block_count: 0,
      false_block_evidence_refs: [`adjudication:${runId}`],
      recovery_seconds: [5],
      outcome: "completed",
      ...metricOverrides,
    },
    user_confirmation: { confirmed: true, confirmation_ref: `confirmation:${runId}`, ...confirmationOverrides },
    ...topLevelOverrides,
  };
  run.evidence_binding_digest = overrides.evidence_binding_digest ?? digestJson({
    run_id: run.run_id,
    project_identity: run.project_identity,
    evidence_digest: run.evidence_digest,
  });
  return run;
}

function envelope(runs: any[]): any {
  return { schema_version: "1.0", runs };
}

function expectCode(code: string, input: unknown): void {
  assert.throws(() => evaluateProjectValueRuns(input), (error: unknown) => {
    assert.ok(error instanceof ProjectValueValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("三条独立合格真实运行才进入 observed，聚合只消费 qualified 值", () => {
  const runs = [
    valueRun("c-run", { metrics: { time_to_first_frozen_requirement_seconds: 30, user_intervention_count: 2, false_block_count: null, false_block_evidence_refs: [], recovery_seconds: [25], outcome: "abandoned" } }),
    valueRun("a-run", { metrics: { time_to_first_frozen_requirement_seconds: 10, user_intervention_count: 1, false_block_count: 0, false_block_evidence_refs: ["judge:a"], recovery_seconds: [5, 15], outcome: "completed" } }),
    valueRun("b-run", { metrics: { time_to_first_frozen_requirement_seconds: null, user_intervention_count: 3, false_block_count: 2, false_block_evidence_refs: ["judge:b"], recovery_seconds: [], outcome: "blocked" } }),
  ];
  const aggregate = evaluateProjectValueRuns(envelope(runs));
  assert.equal(aggregate.qualified_real_runs, 3);
  assert.equal(aggregate.target_qualified_real_runs, 3);
  assert.equal(aggregate.validation_state, "three-real-runs-observed");
  assert.deepEqual(aggregate.excluded_records, []);
  assert.deepEqual(aggregate.outcomes, { completed: 1, abandoned: 1, blocked: 1 });
  assert.deepEqual(aggregate.medians, {
    time_to_first_frozen_requirement_seconds: 20,
    user_intervention_count: 2,
    adjudicated_false_block_count: 1,
    recovery_seconds: 15,
  });
  const sorted = [...runs].sort((left, right) => left.run_id.localeCompare(right.run_id));
  assert.equal(aggregate.evidence_digest, digestJson({ runs: sorted }));
  assert.equal(canonicalizeJson(aggregate), canonicalizeJson(evaluateProjectValueRuns(envelope([...runs].reverse()))));
});

test("合法不合格记录按冻结优先级保留唯一 reason，重复 identity 全部排除", () => {
  const duplicateIdentity = sha("d");
  const runs = [
    valueRun("i-binding", { evidence_binding_digest: sha("0") }),
    valueRun("h-confirm", { user_confirmation: { confirmed: false, confirmation_ref: null } }),
    valueRun("g-auth", { user_authorization_ref: null }),
    valueRun("f-unused", { used_nextstep: false }),
    valueRun("e-derived", { project_origin: "nextstep-derived" }),
    valueRun("d-self", { project_origin: "nextstep-self" }),
    valueRun("c-retro", { collection_mode: "retrospective" }),
    valueRun("b-synthetic", { run_kind: "synthetic", project_origin: "nextstep-derived" }),
    valueRun("a-duplicate-2", { run_kind: "synthetic", project_identity: duplicateIdentity }),
    valueRun("a-duplicate-1", { project_identity: duplicateIdentity }),
  ];
  const aggregate = evaluateProjectValueRuns(envelope(runs));
  assert.equal(aggregate.qualified_real_runs, 0);
  assert.equal(aggregate.synthetic_records, 2);
  assert.equal(aggregate.duplicate_project_records, 2);
  assert.deepEqual(aggregate.medians, {
    time_to_first_frozen_requirement_seconds: null,
    user_intervention_count: null,
    adjudicated_false_block_count: null,
    recovery_seconds: null,
  });
  assert.deepEqual(aggregate.excluded_records, [
    { run_id: "a-duplicate-1", reason_code: "duplicate-project-identity" },
    { run_id: "a-duplicate-2", reason_code: "duplicate-project-identity" },
    { run_id: "b-synthetic", reason_code: "synthetic" },
    { run_id: "c-retro", reason_code: "retrospective" },
    { run_id: "d-self", reason_code: "nextstep-self" },
    { run_id: "e-derived", reason_code: "nextstep-derived" },
    { run_id: "f-unused", reason_code: "used-nextstep-false" },
    { run_id: "g-auth", reason_code: "missing-user-authorization" },
    { run_id: "h-confirm", reason_code: "missing-user-confirmation" },
    { run_id: "i-binding", reason_code: "evidence-binding-mismatch" },
  ]);
});

test("Schema、时间、数值、敏感输入与重复 run_id 分别整批拒绝", () => {
  const valid = valueRun("valid-run");
  const missing = structuredClone(valid); delete missing.ended_at;
  const reversed = valueRun("time-run", { ended_at: "2026-08-25T23:00:00.000Z" });
  const negative = valueRun("numeric-run", { metrics: { user_intervention_count: -1 } });
  const undecided = valueRun("undecided-run", { metrics: { false_block_count: 0, false_block_evidence_refs: [] } });
  const unknown = valueRun("unknown-run"); unknown.unexpected = true;
  const sensitiveField = valueRun("secret-run"); sensitiveField.api_key = "do-not-echo";
  const sensitiveBusiness = valueRun("business-run"); sensitiveBusiness.business_content = "private";
  const sensitiveContent = valueRun("content-run", { user_authorization_ref: "sk-abcdefghijklmnop1234" });
  for (const invalid of [missing, reversed, negative, undecided, unknown]) expectCode("INVALID_INPUT", envelope([valid, invalid]));
  for (const invalid of [sensitiveField, sensitiveBusiness, sensitiveContent]) expectCode("SENSITIVE_INPUT_REJECTED", envelope([valid, invalid]));
  expectCode("DUPLICATE_RUN_ID", envelope([valid, structuredClone(valid)]));
});

test("冻结枚举、有限时间与 envelope exact shape 均 fail closed", () => {
  for (const [field, value] of [["run_kind", "real-prospective"], ["collection_mode", "live"], ["project_origin", "fixture"]] as const) {
    expectCode("INVALID_INPUT", envelope([valueRun("enum-run", { [field]: value })]));
  }
  expectCode("INVALID_INPUT", { schema_version: "1.0", runs: [], extra: true });
  expectCode("INVALID_INPUT", envelope([valueRun("date-run", { started_at: "not-a-date" })]));
  expectCode("INVALID_INPUT", envelope([valueRun("calendar-run", { started_at: "2026-02-30T01:00:00Z" })]));
  expectCode("INVALID_INPUT", envelope([valueRun("nan-run", { metrics: { recovery_seconds: [Number.NaN] } })]));
  const huge = evaluateProjectValueRuns(envelope([
    valueRun("huge-a", { metrics: { time_to_first_frozen_requirement_seconds: 1e308 } }),
    valueRun("huge-b", { metrics: { time_to_first_frozen_requirement_seconds: 1e308 } }),
  ]));
  assert.equal(huge.medians.time_to_first_frozen_requirement_seconds, 1e308);
  assert.equal(huge.validation_state, "real-runs-insufficient");
  assert.equal(evaluateProjectValueRuns(envelope([valueRun("one-run")])).validation_state, "real-runs-insufficient");
});

test("repository fixture 都是 valid exclusion 或空批，qualified_real_runs 恒为 0", async () => {
  const directory = resolve(process.cwd(), "tests/fixtures/project-value-validation");
  for (const name of ["empty.json", "repository-synthetic.json"]) {
    const input = JSON.parse(await readFile(resolve(directory, name), "utf8"));
    const aggregate = evaluateProjectValueRuns(input);
    assert.equal(aggregate.qualified_real_runs, 0, name);
    assert.equal(aggregate.target_qualified_real_runs, 3, name);
  }
  const relabeled = JSON.parse(await readFile(resolve(directory, "repository-synthetic.json"), "utf8"));
  relabeled.runs[0].run_kind = "real";
  const relabeledAggregate = evaluateProjectValueRuns(relabeled);
  assert.deepEqual(relabeledAggregate.excluded_records, [{ run_id: "repository-synthetic", reason_code: "nextstep-derived" }]);
});

test("纯领域实现不依赖进程、网络、Git 或文件 I/O", async () => {
  const source = await readFile(resolve(process.cwd(), "src/domain/project-value-validation.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:child_process|fs|http|https|net)|\b(?:execFile|fetch|process\.|readFile|spawn|update-ref|writeFile)\b/);
});
