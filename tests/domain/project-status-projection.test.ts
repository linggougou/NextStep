import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { Ajv } from "ajv";

import projectionSchema from "../../schemas/v1/project-status-projection.schema.json" with { type: "json" };
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  projectProjectStatus,
  type ProjectStatusSource,
} from "../../src/domain/project-status-projection.ts";

const fixturePath = resolve(process.cwd(), "tests/fixtures/project-status/available-source.json");

async function source(): Promise<ProjectStatusSource> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as ProjectStatusSource;
}

test("一致来源生成字段完备、简洁、可追溯的 available 投影", async () => {
  const input = await source();
  const projection = projectProjectStatus(input);

  assert.deepEqual(projection, {
    schema_version: "1.0",
    status: "available",
    current_stage: "P5/CR-006/SG-2",
    current_scope: "SG-2 generation 5 attempt 1",
    latest_formal_conclusion: "V1 formally completed",
    blockers: [],
    next_action: "SG-2 generation 5 attempt 1 executing; independent acceptance and main integration remain gated",
    risk_summary: [],
    formal_oid: input.formal_oid,
    control_oid: input.control_oid,
    source_digest: digestJson({
      checkpoint_blob_oid: input.checkpoint_blob_oid,
      control_oid: input.control_oid,
      formal_oid: input.formal_oid,
      registry_blob_oid: input.registry_blob_oid,
    }),
    freshness: "current",
    unavailable_reasons: [],
  });
  assert.equal(canonicalizeJson(projection), canonicalizeJson(projectProjectStatus(await source())));

  const validate = new Ajv({ strict: true }).compile(projectionSchema);
  assert.equal(validate(projection), true, JSON.stringify(validate.errors));
  const output = canonicalizeJson(projection);
  assert.doesNotMatch(output, /secret-that-must-not-appear|old-signoff|private-chat|claim|fence|absolute/);
});

test("旧 revision-required 与旧会签不会冒充当前 blocker 或授权", async () => {
  const input = await source();
  const projection = projectProjectStatus(input);
  assert.deepEqual(projection.blockers, []);
  assert.doesNotMatch(canonicalizeJson(projection), /revision-required|signoff|authorize/);
});

test("身份冲突、非法 OID、最高身份冲突与未知状态均 fail closed", async () => {
  const cases: [string, (value: any) => void][] = [
    ["identity-conflict", (value) => { value.registry.repository_id = "sha256:" + "9".repeat(64); }],
    ["invalid-oid", (value) => { value.control_oid = "not-an-oid"; }],
    ["highest-identity-conflict", (value) => {
      const duplicate = structuredClone(value.registry.tasks[2]);
      duplicate.status = "candidate-ready";
      value.registry.tasks.push(duplicate);
    }],
    ["unknown-status", (value) => { value.registry.tasks[2].status = "magic-complete"; }],
  ];

  for (const [reason, mutate] of cases) {
    const input: any = await source();
    mutate(input);
    const projection = projectProjectStatus(input);
    assert.equal(projection.status, "unavailable", reason);
    assert.equal(projection.next_action, null, reason);
    assert.deepEqual(projection.unavailable_reasons, [reason], reason);
  }
});

test("过期活动身份与不可证明 next action 均 unavailable，且 next_action=null", async () => {
  const expired: any = await source();
  expired.observed_at = "2026-08-28T00:00:00Z";
  let projection = projectProjectStatus(expired);
  assert.equal(projection.status, "unavailable");
  assert.equal(projection.freshness, "stale");
  assert.equal(projection.next_action, null);
  assert.deepEqual(projection.unavailable_reasons, ["stale-active-identity"]);

  const inconsistent: any = await source();
  inconsistent.checkpoint.next_stage = "SG-1 generation 5 attempt 1 may start coding";
  projection = projectProjectStatus(inconsistent);
  assert.equal(projection.status, "unavailable");
  assert.equal(projection.next_action, null);
  assert.deepEqual(projection.unavailable_reasons, ["unproven-next-action"]);
});

test("结构化 next action 含 claim 或 fence 时不脱敏猜测，直接 fail closed", async () => {
  for (const sensitive of ["claim hidden-id", "under fence 120"]) {
    const input: any = await source();
    input.checkpoint.next_stage = `SG-2 generation 5 attempt 1 executing ${sensitive}`;
    const projection = projectProjectStatus(input);
    assert.equal(projection.status, "unavailable");
    assert.equal(projection.next_action, null);
    assert.deepEqual(projection.unavailable_reasons, ["next-action-sensitive"]);
    assert.doesNotMatch(canonicalizeJson(projection), /hidden-id|fence 120/);
  }
});

test("较旧 sibling 的未知状态不抢先污染更新的当前任务", async () => {
  const input: any = await source();
  const olderSibling = structuredClone(input.registry.tasks[2]);
  olderSibling.status = "acceptance-dispatch-aborted";
  olderSibling.updated_at = "2026-08-26T06:15:20Z";

  const currentTask = structuredClone(input.registry.tasks[2]);
  currentTask.stage_id = "P5/CR-006/SG-2/acceptance";
  currentTask.task_id = "SG-2-I-X-P";
  currentTask.task_attempt = 5;
  currentTask.status = "running";
  currentTask.updated_at = "2026-08-26T06:30:00Z";

  input.checkpoint.highest_task_attempts = { "SG-2": 1, "SG-2-I-X-P": 5 };
  input.checkpoint.next_stage = "SG-2-I-X-P generation 5 attempt 5 running under fence 125; claim hidden and inspect /Volumes/private/project";
  input.registry.tasks = [olderSibling, currentTask];

  const projection = projectProjectStatus(input);
  assert.equal(projection.status, "unavailable");
  assert.equal(projection.next_action, null);
  assert.deepEqual(projection.unavailable_reasons, ["next-action-sensitive"]);
  assert.doesNotMatch(canonicalizeJson(projection), /claim|fence|Volumes|private\/project/);
});

test("未知 freshness 不凭文件年龄猜过期", async () => {
  const input: any = await source();
  delete input.registry.tasks[2].dispatch_claim;
  const projection = projectProjectStatus(input);
  assert.equal(projection.status, "available");
  assert.equal(projection.freshness, "unknown");
});

test("来源外壳、checkpoint 绑定与当前身份缺失的各条分支均最小失败", async () => {
  const mutations: ((value: any) => void)[] = [
    (value) => { value.schema_version = "2.0"; },
    (value) => { value.formal_oid = "x"; },
    (value) => { value.control_parent_oid = "x"; },
    (value) => { value.checkpoint_blob_oid = "x"; },
    (value) => { value.registry_blob_oid = "x"; },
    (value) => { value.observed_at = "not-a-date"; },
    (value) => { value.checkpoint = []; },
    (value) => { value.registry = []; },
    (value) => { value.checkpoint.formal_ref = "HEAD"; },
    (value) => { value.checkpoint.formal_oid = "f".repeat(40); },
    (value) => { value.checkpoint.control_parent_oid = "f".repeat(40); },
    (value) => { value.checkpoint.plan_id = "other-plan"; },
    (value) => { value.checkpoint.highest_task_attempts = {}; },
    (value) => { value.checkpoint.version_signoffs = {}; },
  ];
  for (const mutate of mutations) {
    const input: any = await source();
    mutate(input);
    const projection = projectProjectStatus(input);
    assert.equal(projection.status, "unavailable");
    assert.equal(projection.next_action, null);
    assert.equal(projection.unavailable_reasons.length, 1);
  }
});

test("当前结构化阻塞、直接 expiry 与较新正式版本按当前身份投影", async () => {
  const input: any = await source();
  input.registry.tasks[2].status = "blocked";
  input.registry.tasks[2].expires_at = input.registry.tasks[2].dispatch_claim.lease_expires_at;
  delete input.registry.tasks[2].dispatch_claim;
  input.checkpoint.version_signoffs.V2 = {
    ...input.checkpoint.version_signoffs.V1,
    completed_at: "2026-08-25T17:28:06Z",
    result_ref: "results/v2.json",
  };
  const projection = projectProjectStatus(input);
  assert.equal(projection.status, "available");
  assert.equal(projection.freshness, "current");
  assert.equal(projection.latest_formal_conclusion, "V2 formally completed");
  assert.deepEqual(projection.blockers, [{
    reason_code: "blocked",
    evidence_ref: "registry:SG-2@g5#a1",
  }]);
});

test("next action 中的绝对业务路径同样 fail closed", async () => {
  const input: any = await source();
  input.checkpoint.next_stage = "SG-2 generation 5 attempt 1 inspect /Volumes/private/project";
  const projection = projectProjectStatus(input);
  assert.equal(projection.status, "unavailable");
  assert.equal(projection.next_action, null);
  assert.doesNotMatch(canonicalizeJson(projection), /Volumes|private\/project/);
});
