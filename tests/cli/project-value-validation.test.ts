import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const cli = resolve(process.cwd(), "dist/src/cli/project-value-validation.js");
const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/project-value-validation");

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, name), "utf8"));
}

function run(input: string, args: readonly string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (value: Buffer) => stdout.push(value));
    child.stderr.on("data", (value: Buffer) => stderr.push(value));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

test("repository fixture 成功输出唯一 JCS aggregate，真实运行固定为 0/3", async () => {
  const input = await fixture("repository-synthetic.json");
  const result = await run(canonicalizeJson(input));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const aggregate = parseCanonicalJsonBytes(Buffer.from(result.stdout)) as any;
  assert.equal(canonicalizeJson(aggregate), result.stdout);
  assert.equal(aggregate.qualified_real_runs, 0);
  assert.equal(aggregate.target_qualified_real_runs, 3);
  assert.equal(aggregate.validation_state, "real-runs-insufficient");
  assert.equal(canonicalizeJson(aggregate.outcomes), '{"abandoned":0,"blocked":0,"completed":0}');
  assert.doesNotMatch(result.stdout, /22222222/);
});

test("全部 repository fixture 均被消费且不能成为合格真实运行", async () => {
  const names = (await readdir(fixtureDirectory)).sort();
  assert.deepEqual(names, ["empty.json", "repository-synthetic.json"]);
  for (const name of names) {
    const result = await run(canonicalizeJson(await fixture(name)));
    assert.equal(result.code, 0, `${name}: ${result.stderr}`);
    const aggregate = JSON.parse(result.stdout) as any;
    assert.equal(aggregate.qualified_real_runs, 0, name);
    assert.equal(aggregate.target_qualified_real_runs, 3, name);
  }
});

test("非 JCS、未知字段、敏感、畸形、重复 run_id 与参数均遵守精确失败通道", async () => {
  const base = await fixture("repository-synthetic.json");
  const unknown = structuredClone(base);
  unknown.unexpected = true;
  const sensitive = structuredClone(base);
  sensitive.private_key = "do-not-echo-private-material";
  const duplicate = structuredClone(base);
  duplicate.runs.push(structuredClone(duplicate.runs[0]));
  const cases = [
    { input: JSON.stringify({ schema_version: "1.0", runs: [] }, null, 2), args: [], code: "NON_CANONICAL_INPUT" },
    { input: canonicalizeJson(unknown), args: [], code: "INVALID_INPUT" },
    { input: canonicalizeJson(sensitive), args: [], code: "SENSITIVE_INPUT_REJECTED" },
    { input: "{broken-private-value", args: [], code: "INVALID_INPUT" },
    { input: canonicalizeJson(duplicate), args: [], code: "DUPLICATE_RUN_ID" },
    { input: canonicalizeJson(base), args: ["--write"], code: "INVALID_INPUT" },
  ] as const;
  for (const item of cases) {
    const result = await run(item.input, item.args);
    assert.equal(result.code, 1, item.code);
    assert.equal(result.stdout, "", item.code);
    assert.equal(result.stderr, `${item.code}\n`, item.code);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /do-not-echo|private-value|22222222/);
  }
});
