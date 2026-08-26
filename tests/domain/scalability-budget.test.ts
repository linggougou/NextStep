import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { Ajv } from "ajv";

import scalabilityBudgetSchema from "../../schemas/v1/scalability-budget.schema.json" with { type: "json" };
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  SCALABILITY_BUDGET_LIMITS,
  SCALABILITY_BUDGET_METRICS,
  ScalabilityBudgetError,
  evaluateScalabilityBudget,
} from "../../src/domain/scalability-budget.ts";

type BudgetMetric = (typeof SCALABILITY_BUDGET_METRICS)[number];
type Measurements = Record<BudgetMetric, number | null>;

interface BudgetInput {
  schema_version: string;
  measurements: Measurements;
  [key: string]: unknown;
}

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/scalability-budget");

async function loadFixture(name: string): Promise<BudgetInput> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, `${name}.json`), "utf8")) as BudgetInput;
}

function expectInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ScalabilityBudgetError);
    assert.equal(error.code, "INVALID_SCALABILITY_BUDGET");
    assert.notEqual(error.message, "");
    return true;
  });
}

function git(...args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: process.cwd(), encoding: "utf8" }).trim();
}

test("六项冻结边界通过，结果符合同文件定义的 result Schema", async () => {
  const input = await loadFixture("within-budget");
  const result = evaluateScalabilityBudget(input);

  assert.equal(result.conclusion, "within-budget");
  assert.deepEqual(result.limits, SCALABILITY_BUDGET_LIMITS);
  assert.deepEqual(result.exceeded_metrics, []);
  assert.deepEqual(result.unmeasurable_metrics, []);
  assert.equal(result.input_digest, digestJson(input));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.limits));

  const ajv = new Ajv({ strict: true, allErrors: true });
  ajv.addSchema(scalabilityBudgetSchema);
  const validateResult = ajv.compile({
    $ref: `${scalabilityBudgetSchema.$id}#/definitions/result`,
  });
  assert.equal(validateResult(result), true, ajv.errorsText(validateResult.errors));
});

test("任一冻结上限加一均要求例外，调用方不能覆盖阈值", async () => {
  const base = await loadFixture("within-budget");
  for (const metric of SCALABILITY_BUDGET_METRICS) {
    const input = structuredClone(base);
    input.measurements[metric] = SCALABILITY_BUDGET_LIMITS[metric] + 1;
    const result = evaluateScalabilityBudget(input);
    assert.equal(result.conclusion, "exception-required", metric);
    assert.deepEqual(result.exceeded_metrics, [metric], metric);
  }

  for (const field of ["limits", "threshold_version", "force"]) {
    const input = structuredClone(base);
    input[field] = field === "force" ? true : SCALABILITY_BUDGET_LIMITS;
    expectInvalid(() => evaluateScalabilityBudget(input));
  }
});

test("多项超限按冻结字段顺序完整输出且不受输入键序影响", async () => {
  const input = await loadFixture("multi-exceeded");
  const first = evaluateScalabilityBudget(input);
  const reordered: BudgetInput = {
    measurements: Object.fromEntries(Object.entries(input.measurements).reverse()) as Measurements,
    schema_version: input.schema_version,
  };
  const second = evaluateScalabilityBudget(reordered);

  assert.equal(first.conclusion, "exception-required");
  assert.deepEqual(first.exceeded_metrics, [
    "control_cas_per_attempt",
    "immutable_evidence_files_per_attempt",
    "active_independent_tasks_per_packet",
  ]);
  assert.deepEqual(second, first);
  assert.equal(canonicalizeJson(second), canonicalizeJson(first));
});

test("任一 null 返回不可测，并保留全部不可测和超限诊断", async () => {
  const input = await loadFixture("unmeasurable");
  const result = evaluateScalabilityBudget(input);

  assert.equal(result.conclusion, "unmeasurable");
  assert.deepEqual(result.unmeasurable_metrics, [
    "immutable_evidence_files_per_attempt",
    "active_plan_generations_per_milestone",
  ]);
  assert.deepEqual(result.exceeded_metrics, ["control_cas_per_attempt"]);
});

test("缺字段、负数、非整数、未知版本、未知字段、NaN 与 Infinity 均拒绝", async () => {
  const base = await loadFixture("within-budget");
  for (const metric of SCALABILITY_BUDGET_METRICS) {
    const missing = structuredClone(base);
    delete missing.measurements[metric];
    expectInvalid(() => evaluateScalabilityBudget(missing));
  }

  for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const input = structuredClone(base);
    input.measurements.control_cas_per_attempt = invalid;
    expectInvalid(() => evaluateScalabilityBudget(input));
  }

  const unknownVersion = structuredClone(base);
  unknownVersion.schema_version = "2.0";
  expectInvalid(() => evaluateScalabilityBudget(unknownVersion));

  const unknownTopLevel = structuredClone(base);
  unknownTopLevel.unexpected = true;
  expectInvalid(() => evaluateScalabilityBudget(unknownTopLevel));

  const unknownMeasurement = structuredClone(base);
  (unknownMeasurement.measurements as Record<string, number | null>).unexpected = 1;
  expectInvalid(() => evaluateScalabilityBudget(unknownMeasurement));
});

test("跳过独立验收、用户会签或 CAS 的豁免建议被拒绝", async () => {
  const input = await loadFixture("override-suggestion");
  expectInvalid(() => evaluateScalabilityBudget(input));
});

test("同一 canonical input 产生确定性 JCS 结果与 input digest", async () => {
  const input = await loadFixture("within-budget");
  const reordered: BudgetInput = {
    measurements: Object.fromEntries(Object.entries(input.measurements).reverse()) as Measurements,
    schema_version: input.schema_version,
  };

  const first = evaluateScalabilityBudget(input);
  const second = evaluateScalabilityBudget(reordered);
  assert.deepEqual(second, first);
  assert.equal(canonicalizeJson(second), canonicalizeJson(first));
  assert.equal(first.input_digest, digestJson(input));
  assert.match(first.input_digest, /^sha256:[a-f0-9]{64}$/);
});

test("领域实现不依赖 Git/文件 I/O，判定前后 formal/control 与工作树不变", async () => {
  const source = await readFile(resolve(process.cwd(), "src/domain/scalability-budget.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process)|\b(?:readFile|writeFile|execFile|spawn|update-ref)\b/);
  assert.doesNotMatch(source, /process\.|\.git|refs\/nextstep|\bformal\b|\bcontrol\b/);

  const before = {
    formal: git("rev-parse", "refs/nextstep/formal"),
    control: git("rev-parse", "refs/nextstep/control"),
    status: git("status", "--porcelain"),
  };
  const input = await loadFixture("multi-exceeded");
  for (let index = 0; index < 10; index += 1) evaluateScalabilityBudget(input);
  const after = {
    formal: git("rev-parse", "refs/nextstep/formal"),
    control: git("rev-parse", "refs/nextstep/control"),
    status: git("status", "--porcelain"),
  };
  assert.deepEqual(after, before);
});
