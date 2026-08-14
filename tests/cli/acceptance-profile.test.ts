import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { runAcceptanceProfile } from "../../src/cli/acceptance-profile.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";

// W4 集成契约假设（与 W3 切片对齐，若 fixture 字段命名不同由集成期统一）：
// acceptance-profile fixture 顶层字段 `candidate` 为可被
// evaluateAcceptanceProfile 接受的候选；三类 fixture 对应 headless、含 UI、冲突。
const fixturePaths = {
  headless: "tests/fixtures/acceptance-profile/headless-community-workshop.json",
  uiWithEvidence: "tests/fixtures/acceptance-profile/ui-with-evidence.json",
  conflict: "tests/fixtures/acceptance-profile/conflict-headless-requires-ui.json",
} as const;

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

async function loadCandidate(path: string): Promise<unknown> {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8")) as {
    readonly candidate: unknown;
  };
  return fixture.candidate;
}

test("Acceptance Profile CLI 对非 JCS 输入与参数注入只输出一个不含原值的失败回执", async () => {
  for (const { io, output, diagnostics, exitCodes } of [
    fakeIo('{"not":"canonical","z":1,"a":2}'),
    fakeIo('{"authorization":"Bearer profile-secret-value-not-to-echo"}', ["--signed=true"]),
    fakeIo("{broken"),
  ]) {
    await runAcceptanceProfile(io);
    assert.equal(output.length, 1);
    const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
    assert.equal(receipt.ok, false);
    assert.equal(
      receipt.code === "ACCEPTANCE_PROFILE_REJECTED" || receipt.code === "SENSITIVE_FIELD_DETECTED",
      true,
    );
    assert.equal(receipt.schema_version, "1.0");
    assert.deepEqual(exitCodes, [1]);
    assert.equal(diagnostics.length, 1);
    const echoed = `${output.join("\n")}${diagnostics.join("\n")}`;
    assert.doesNotMatch(echoed, /profile-secret-value-not-to-echo/);
    assert.doesNotMatch(echoed, /Bearer/);
  }
});

test("Acceptance Profile CLI 拒绝 stdin 注入的签认声明（fail closed，不自我批准）", async () => {
  const injected = canonicalizeJson({
    schema_version: "1.0",
    status: "approved",
    signoff: { approved: true, approver: "self" },
    gate_conclusion: "passed",
  });
  const { io, output, diagnostics, exitCodes } = fakeIo(injected);

  await runAcceptanceProfile(io);

  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, false);
  assert.equal(
    receipt.code === "ACCEPTANCE_PROFILE_REJECTED" || receipt.code === "PROFILE_CONFLICT_REJECTED",
    true,
  );
  assert.deepEqual(exitCodes, [1]);
  assert.equal(diagnostics.length, 1);
});

test("headless 路线候选派生 Profile：Acceptance Profile CLI 返回 ACCEPTED 且信封自洽", async () => {
  const candidate = await loadCandidate(fixturePaths.headless);
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(candidate));

  await runAcceptanceProfile(io);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(exitCodes, []);
  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "ACCEPTANCE_PROFILE_ACCEPTED");
  const data = receipt.data as Record<string, unknown>;
  assert.equal(data.schema_version, "1.0");
  const subject = data.acceptance_profile;
  assert.equal(data.canonical_json, canonicalizeJson(subject));
  assert.equal(data.digest, digestJson(subject));
  assert.equal(parseMachineReceipt(receipt).code, "ACCEPTANCE_PROFILE_ACCEPTED");
});

test("含 UI 路线候选（带 UI 设计真源与还原证据引用）派生 Profile 为 ACCEPTED", async () => {
  const candidate = await loadCandidate(fixturePaths.uiWithEvidence);
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(candidate));

  await runAcceptanceProfile(io);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(exitCodes, []);
  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "ACCEPTANCE_PROFILE_ACCEPTED");
  assert.equal(parseMachineReceipt(receipt).code, "ACCEPTANCE_PROFILE_ACCEPTED");
});

test("路线/Profile 冲突候选必须 PROFILE_CONFLICT_REJECTED 并阻塞，不得降级为 headless 放行", async () => {
  const candidate = await loadCandidate(fixturePaths.conflict);
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(candidate));

  await runAcceptanceProfile(io);

  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "PROFILE_CONFLICT_REJECTED");
  assert.deepEqual(exitCodes, [1]);
  assert.equal(diagnostics.length, 1);
  // 失败回执 data 只允许 dry_run，不得夹带任何降级后的 Profile 输出。
  assert.deepEqual((receipt.data as Record<string, unknown>).dry_run, false);
  assert.equal(
    Object.keys(receipt.data as Record<string, unknown>).length,
    1,
    "冲突回执不得输出降级 Profile",
  );
  assert.match(String(diagnostics[0]), /conflict|冲突/i);
});
