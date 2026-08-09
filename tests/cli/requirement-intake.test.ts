import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const compiledCliPath = resolve(process.cwd(), "dist/src/cli/requirement-intake.js");
const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/requirement-intake");

interface CliResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function runCli(input: string): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [compiledCliPath], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => resolveResult({
      exitCode,
      stderr: Buffer.concat(stderr).toString("utf8"),
      stdout: Buffer.concat(stdout).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

async function readFixture(name: string): Promise<string> {
  const fixture = await readFile(resolve(fixtureDirectory, name), "utf8");
  if (name === "empty-input.json" || name === "non-jcs.json") {
    return fixture;
  }
  return canonicalizeJson(JSON.parse(fixture) as unknown);
}

function parseReceipt(stdout: string): Record<string, unknown> {
  const receipt = parseCanonicalJsonBytes(Buffer.from(stdout, "utf8"));
  assert.equal(canonicalizeJson(receipt), stdout);
  assert.equal(Object.getPrototypeOf(receipt), null);
  return receipt as Record<string, unknown>;
}

test("requirement intake CLI emits one JCS receipt for each target-project fixture", async () => {
  for (const fixture of [
    "project-delivery-tool.json",
    "community-workshop.json",
    "expense-reminder.json",
  ]) {
    const result = await runCli(await readFixture(fixture));
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stderr, "");
    const receipt = parseReceipt(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.code, "REQUIREMENT_INTAKE_ACCEPTED");
    const data = receipt.data as Record<string, unknown>;
    const intake = data.requirement_intake as Record<string, unknown>;
    const userOutput = data.user_output as Record<string, unknown>;
    assert.equal((intake.candidate as Record<string, unknown>).raw_expression === "", false);
    assert.equal(Object.hasOwn(intake, "development_tasks"), false);
    assert.equal(userOutput.status, "candidate-only");
    assert.ok(Array.isArray(userOutput.identified_facts));
    assert.ok(Array.isArray(userOutput.missing_information));
    assert.ok(Array.isArray(userOutput.clarification_questions));
    assert.match(String(userOutput.next_step), /不会冻结|不会写入|不会生成开发任务/);
  }
});

test("requirement intake CLI fails closed for every required negative fixture without leaking sensitive values", async () => {
  for (const [fixture, code] of [
    ["empty-input.json", "INVALID_JSON"],
    ["missing-field.json", "REQUIREMENT_INTAKE_REJECTED"],
    ["unknown-field.json", "REQUIREMENT_INTAKE_REJECTED"],
    ["non-jcs.json", "REQUIREMENT_INTAKE_REJECTED"],
    ["sensitive-field.json", "SENSITIVE_FIELD_DETECTED"],
    ["development-task.json", "DEVELOPMENT_TASK_EMBEDDED"],
  ] as const) {
    const result = await runCli(await readFixture(fixture));
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.stdout.split("\n").length, 1);
    const receipt = parseReceipt(result.stdout);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.code, code);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-that-must-not-appear/);
  }
});
