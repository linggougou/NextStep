import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runVersionChain } from "../../src/cli/version-chain.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/version-chain");
const compiledCli = resolve(process.cwd(), "dist/src/cli/version-chain.js");

function runProcess(input: string, args: readonly string[] = []) {
  return new Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, [compiledCli, ...args], { stdio: ["pipe", "pipe", "pipe"] });
      const stdout: Uint8Array[] = [];
      const stderr: Uint8Array[] = [];
      child.stdout.on("data", (value: Uint8Array) => stdout.push(value));
      child.stderr.on("data", (value: Uint8Array) => stderr.push(value));
      child.once("error", reject);
      child.once("close", (code) => resolveResult({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }));
      child.stdin.end(input);
    },
  );
}

function fakeIo(input: string, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return Buffer.from(input, "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

async function canonicalFixture(name = "project-delivery-tool.json"): Promise<string> {
  return canonicalizeJson(JSON.parse(await readFile(resolve(fixtureDirectory, name), "utf8")) as unknown);
}

function parseReceipt(output: readonly string[]): Record<string, unknown> {
  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8"));
  assert.equal(canonicalizeJson(receipt), output[0]);
  return receipt as Record<string, unknown>;
}

test("CLI 对三类目标项目输出一份确定性 VERSION_CHAIN_ACCEPTED JCS 回执", async () => {
  for (const fixture of ["project-delivery-tool.json", "community-workshop.json", "expense-reminder.json"]) {
    const input = await canonicalFixture(fixture);
    const first = fakeIo(input);
    const second = fakeIo(input);
    await runVersionChain(first.io);
    await runVersionChain(second.io);

    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(first.exitCodes, []);
    assert.deepEqual(first.output, second.output);
    const receipt = parseReceipt(first.output);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.code, "VERSION_CHAIN_ACCEPTED");
    const data = receipt.data as Record<string, unknown>;
    assert.equal(data.schema_version, "1.0");
    assert.equal(data.canonical_json, canonicalizeJson(data.version_chain));
    assert.equal(data.digest, digestJson(data.version_chain));
  }
});

test("CLI 拒绝非 JCS、参数注入、未知字段和敏感字段/内容且不泄漏原值", async () => {
  const candidate = JSON.parse(await canonicalFixture()) as Record<string, unknown>;
  const unknown = structuredClone(candidate);
  unknown.unexpected = true;
  const sensitiveField = structuredClone(candidate);
  sensitiveField.api_token = "secret-that-must-not-appear";
  const sensitiveContent = structuredClone(candidate);
  (sensitiveContent.project as Record<string, unknown>).repository_id = "authorization: bearer abcdefghijklmnop";

  for (const { io, output, diagnostics, exitCodes } of [
    fakeIo('{"z":1,"a":2}'),
    fakeIo("{broken"),
    fakeIo(canonicalizeJson(candidate), ["--commit"]),
    fakeIo(canonicalizeJson(unknown)),
    fakeIo(canonicalizeJson(sensitiveField)),
    fakeIo(canonicalizeJson(sensitiveContent)),
  ]) {
    await runVersionChain(io);
    const receipt = parseReceipt(output);
    assert.equal(receipt.ok, false);
    assert.equal(
      ["INVALID_JSON", "VERSION_CHAIN_REJECTED", "SENSITIVE_FIELD_DETECTED"].includes(String(receipt.code)),
      true,
    );
    assert.equal(canonicalizeJson(receipt.data), canonicalizeJson({ dry_run: false }));
    assert.deepEqual(exitCodes, [1]);
    assert.equal(diagnostics.length, 1);
    assert.doesNotMatch(`${output.join("\n")}${diagnostics.join("\n")}`, /secret-that-must-not-appear|abcdefghijklmnop|Bearer/i);
  }
});

test("CLI 只消费 stdin，不暴露写入、执行、任务或 ref 推进入口", async () => {
  const { io, output } = fakeIo(await canonicalFixture());
  await runVersionChain(io);
  const receipt = parseReceipt(output);
  assert.doesNotMatch(canonicalizeJson(receipt), /milestone|dependency|execution_packet|development_task|dispatch|formal_(?:promotion|ref)|control_ref/i);

  const source = await readFile(resolve(process.cwd(), "src/cli/version-chain.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process)|\.git|refs\/nextstep|--commit|atomicWrite/i);
});

test("Skill 固定 S2.1 主归属入口并继续阻塞 S2.2+ 与完成声明", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /## S2\.1 Version Chain Unique Ownership/);
  assert.match(skill, /project\.repository_id/);
  assert.match(skill, /project\.formal_baseline/);
  assert.match(skill, /V1`, `V2`, `V3`, `V4`, `Final Acceptance/);
  assert.match(skill, /node dist\/src\/cli\/version-chain\.js/);
  assert.match(skill, /VERSION_CHAIN_ACCEPTED/);
  assert.match(skill, /S2\.2, S2\.3, and S2\.4 remain separately gated/);
  assert.match(skill, /Do not claim PC-09, M2\.1, V2, or P5 complete/);
});

test("构建后的真实 CLI 进程保持单一 stdout JCS 与失败 exit 1", async () => {
  const accepted = await runProcess(await canonicalFixture());
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.stderr, "");
  assert.equal(parseReceipt([accepted.stdout]).code, "VERSION_CHAIN_ACCEPTED");

  const rejected = await runProcess('{"z":1,"a":2}');
  assert.equal(rejected.code, 1);
  assert.equal(parseReceipt([rejected.stdout]).code, "INVALID_JSON");
  assert.equal(rejected.stderr, "Version chain input rejected\n");
});
