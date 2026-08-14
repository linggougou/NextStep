import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { runInteractionPrototype } from "../../src/cli/interaction-prototype.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";

// W4 集成契约假设（与 W1 切片对齐，若 fixture 字段命名不同由集成期统一）：
// tests/fixtures/interaction-prototype/community-workshop.json 顶层字段
// `interaction_prototype` 为可被 parseInteractionPrototype 接受的候选。
const positiveFixturePath = "tests/fixtures/interaction-prototype/community-workshop.json";

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

test("载体无关原型 CLI 对非 JCS 输入与参数注入只输出一个不含原值的失败回执", async () => {
  for (const { io, output, diagnostics, exitCodes } of [
    fakeIo('{"not":"canonical","z":1,"a":2}'),
    fakeIo('{"authorization":"Bearer proto-secret-value-not-to-echo"}', ["--signed=true"]),
    fakeIo("{broken"),
  ]) {
    await runInteractionPrototype(io);
    assert.equal(output.length, 1);
    const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
    assert.equal(receipt.ok, false);
    assert.equal(
      receipt.code === "INTERACTION_PROTOTYPE_REJECTED" || receipt.code === "SENSITIVE_FIELD_DETECTED",
      true,
    );
    assert.equal(receipt.schema_version, "1.0");
    assert.deepEqual(exitCodes, [1]);
    assert.equal(diagnostics.length, 1);
    const echoed = `${output.join("\n")}${diagnostics.join("\n")}`;
    assert.doesNotMatch(echoed, /proto-secret-value-not-to-echo/);
    assert.doesNotMatch(echoed, /Bearer/);
  }
});

test("载体无关原型 CLI 拒绝 stdin 注入的签认声明（fail closed，不自我批准）", async () => {
  const injected = canonicalizeJson({
    schema_version: "1.0",
    status: "approved",
    signoff: { approved: true, approver: "self" },
    gate_conclusion: "passed",
  });
  const { io, output, diagnostics, exitCodes } = fakeIo(injected);

  await runInteractionPrototype(io);

  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "INTERACTION_PROTOTYPE_REJECTED");
  assert.deepEqual(exitCodes, [1]);
  assert.equal(diagnostics.length, 1);
});

test("载体无关原型 CLI 回放目标项目 fixture 并返回 JCS 回执，信封与主题摘要自洽", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), positiveFixturePath), "utf8")) as {
    readonly interaction_prototype: unknown;
  };
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(fixture.interaction_prototype));

  await runInteractionPrototype(io);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(exitCodes, []);
  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "INTERACTION_PROTOTYPE_ACCEPTED");
  assert.equal(receipt.schema_version, "1.0");
  const data = receipt.data as Record<string, unknown>;
  assert.equal(data.schema_version, "1.0");
  const subject = data.interaction_prototype;
  assert.equal(typeof data.canonical_json, "string");
  assert.equal(data.canonical_json, canonicalizeJson(subject));
  assert.equal(data.digest, digestJson(subject));
  // 信封必须可被独立重验：parseMachineReceipt 会重新解析主题并核对 canonical/digest。
  assert.equal(parseMachineReceipt(receipt).code, "INTERACTION_PROTOTYPE_ACCEPTED");
});
