import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  REQUIRED_PC_IDS,
  VERSION_CHAIN_IDS,
  VersionChainError,
  evaluateVersionChain,
  parseVersionChainResult,
  type VersionChainCandidate,
} from "../../src/domain/version-chain.ts";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/version-chain");
const positiveFixtures = [
  "project-delivery-tool.json",
  "community-workshop.json",
  "expense-reminder.json",
] as const;

async function loadJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, name), "utf8")) as unknown;
}

async function loadCandidate(name: string = positiveFixtures[0]): Promise<VersionChainCandidate> {
  return await loadJson(name) as VersionChainCandidate;
}

function cloneCandidate(candidate: VersionChainCandidate): Record<string, unknown> {
  return structuredClone(candidate) as unknown as Record<string, unknown>;
}

function expectReason(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof VersionChainError)) {
      assert.fail(`应为 VersionChainError，实际 ${String(error)}`);
    }
    assert.ok(error.reasons.some((reason) => reason.code === code), JSON.stringify(error.reasons));
    assert.deepEqual(error.reasons, [...error.reasons].sort((left, right) => {
      const leftKey = `${left.code}\u0000${left.path}\u0000${left.message}`;
      const rightKey = `${right.code}\u0000${right.path}\u0000${right.message}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }));
    return true;
  };
}

function applyMutation(candidate: Record<string, unknown>, mutation: Record<string, unknown>): void {
  const versions = candidate.versions as Array<Record<string, unknown>>;
  const versionIndex = Number(mutation.version_index);
  switch (mutation.operation) {
    case "append-primary":
      (versions[versionIndex]!.primary_pc_ids as string[]).push(String(mutation.pc_id));
      return;
    case "remove-primary": {
      const ids = versions[versionIndex]!.primary_pc_ids as string[];
      ids.splice(ids.indexOf(String(mutation.pc_id)), 1);
      return;
    }
    case "replace-primary": {
      const ids = versions[versionIndex]!.primary_pc_ids as string[];
      ids[ids.indexOf(String(mutation.from_pc_id))] = String(mutation.pc_id);
      return;
    }
    case "append-backlog-pc": {
      const backlog = candidate.backlog as Array<Record<string, unknown>>;
      (backlog[Number(mutation.backlog_index)]!.pc_ids as string[]).push(String(mutation.pc_id));
      return;
    }
    case "remove-version":
      versions.splice(versionIndex, 1);
      return;
    case "replace-version-id":
      versions[versionIndex]!.version_id = mutation.version_id;
      return;
    case "swap-versions": {
      const left = Number(mutation.left_index);
      const right = Number(mutation.right_index);
      [versions[left], versions[right]] = [versions[right]!, versions[left]!];
      return;
    }
    default:
      assert.fail(`未知 mutation：${String(mutation.operation)}`);
  }
}

test("三类目标项目 fixture 均生成 20/20 唯一主归属矩阵", async () => {
  assert.deepEqual(VERSION_CHAIN_IDS, ["V1", "V2", "V3", "V4", "Final Acceptance"]);
  assert.equal(REQUIRED_PC_IDS.length, 20);

  for (const fixture of positiveFixtures) {
    const candidate = await loadCandidate(fixture);
    const result = evaluateVersionChain(candidate);
    assert.equal(result.status, "ACCEPTED");
    assert.equal(canonicalizeJson(result.project), canonicalizeJson(candidate.project));
    assert.equal(result.ownership_matrix.length, 20);
    assert.deepEqual(result.ownership_matrix.map(({ pc_id }) => pc_id), REQUIRED_PC_IDS);
    assert.equal(canonicalizeJson(result.metrics), canonicalizeJson({
      versions: { actual: 5, required: 5 },
      primary_pc: { assigned: 20, required: 20, duplicates: 0, missing: 0 },
      backlog_pc_count: 0,
    }));
    assert.equal(result.candidate_digest, digestJson(candidate));
    assert.deepEqual(parseVersionChainResult(result), result);
  }
});

test("七类单一 mutation 负例分别 fail closed，原因顺序稳定", async () => {
  const fixture = await loadJson("single-mutations.json") as {
    readonly base_fixture: string;
    readonly cases: readonly Record<string, unknown>[];
  };
  const base = await loadCandidate(fixture.base_fixture);

  for (const mutation of fixture.cases) {
    const candidate = cloneCandidate(base);
    applyMutation(candidate, mutation);
    const expectedCode = String(mutation.expected_code);
    assert.throws(() => evaluateVersionChain(candidate), expectReason(expectedCode), String(mutation.name));
    let first: readonly unknown[] = [];
    let second: readonly unknown[] = [];
    try { evaluateVersionChain(candidate); } catch (error) { first = (error as VersionChainError).reasons; }
    try { evaluateVersionChain(candidate); } catch (error) { second = (error as VersionChainError).reasons; }
    assert.deepEqual(first, second, String(mutation.name));
  }
});

test("PC 主版本必须逐项匹配 P3 冻结矩阵，不能只满足唯一性", async () => {
  const candidate = cloneCandidate(await loadCandidate());
  const versions = candidate.versions as Array<Record<string, unknown>>;
  const v1 = versions[0]!.primary_pc_ids as string[];
  const v2 = versions[1]!.primary_pc_ids as string[];
  v1[v1.indexOf("PC-08")] = "PC-09";
  v2[v2.indexOf("PC-09")] = "PC-08";
  assert.throws(() => evaluateVersionChain(candidate), expectReason("PC_OWNER_MISMATCH"));
});

test("未知版本、未知字段、缺必填、摘要漂移和敏感输入均拒绝", async () => {
  const base = await loadCandidate();
  const cases: Array<[Record<string, unknown>, string]> = [];

  const unknownVersion = cloneCandidate(base);
  unknownVersion.schema_version = "2.0";
  cases.push([unknownVersion, "INVALID_VERSION_CHAIN"]);

  const extra = cloneCandidate(base);
  extra.unexpected = true;
  cases.push([extra, "INVALID_VERSION_CHAIN"]);

  const missing = cloneCandidate(base);
  delete missing.project;
  cases.push([missing, "INVALID_VERSION_CHAIN"]);

  const summaryDrift = cloneCandidate(base);
  (summaryDrift.summary as Record<string, unknown>).primary_pc_count = 19;
  cases.push([summaryDrift, "SUMMARY_MISMATCH"]);

  const sensitiveField = cloneCandidate(base);
  sensitiveField.api_token = "not-echoed";
  cases.push([sensitiveField, "SENSITIVE_INPUT"]);

  const sensitiveContent = cloneCandidate(base);
  (sensitiveContent.project as Record<string, unknown>).repository_id = "authorization: bearer abcdefghijklmnop";
  cases.push([sensitiveContent, "SENSITIVE_INPUT"]);

  for (const [candidate, code] of cases) {
    assert.throws(() => evaluateVersionChain(candidate), expectReason(code));
  }
});

test("同一 canonical 输入产生确定性结果与摘要，输出 parser 拒绝伪造", async () => {
  const candidate = await loadCandidate();
  const first = evaluateVersionChain(candidate);
  const second = evaluateVersionChain(JSON.parse(canonicalizeJson(candidate)) as unknown);
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.equal(first.candidate_digest, second.candidate_digest);

  for (const mutate of [
    (value: Record<string, unknown>) => { value.candidate_digest = `sha256:${"f".repeat(64)}`; },
    (value: Record<string, unknown>) => { (value.ownership_matrix as unknown[]).pop(); },
    (value: Record<string, unknown>) => { value.status = "REJECTED"; },
    (value: Record<string, unknown>) => { value.execution_packet = {}; },
  ]) {
    const forged = structuredClone(first) as unknown as Record<string, unknown>;
    mutate(forged);
    assert.throws(() => parseVersionChainResult(forged), expectReason("RESULT_INTEGRITY_MISMATCH"));
  }
});

test("S2.1 输出不生成里程碑、依赖图、任务包或执行动作", async () => {
  const result = evaluateVersionChain(await loadCandidate());
  assert.deepEqual(Object.keys(result).sort(), [
    "backlog",
    "candidate_digest",
    "metrics",
    "ownership_matrix",
    "project",
    "record_type",
    "schema_version",
    "status",
    "versions",
  ]);
  assert.doesNotMatch(canonicalizeJson(result), /milestone|dependency|execution_packet|development_task|dispatch|formal_(?:promotion|ref)|control_ref/i);

  const source = await readFile(resolve(process.cwd(), "src/domain/version-chain.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process)|\.git|refs\/nextstep|git\s/i);
});
