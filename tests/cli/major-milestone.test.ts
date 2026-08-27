import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runMajorMilestone } from "../../src/cli/major-milestone.ts";
import { evaluateAcceptanceProfile } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { MAJOR_MILESTONE_DEFINITIONS, type MajorMilestoneCandidate } from "../../src/domain/major-milestone.ts";
import { evaluateVersionChain } from "../../src/domain/version-chain.ts";

const fixtures = resolve(process.cwd(), "tests/fixtures");
const compiledCli = resolve(process.cwd(), "dist/src/cli/major-milestone.js");

async function load(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(fixtures, path), "utf8")) as Record<string, unknown>;
}

async function input(): Promise<MajorMilestoneCandidate> {
  const versionChain = evaluateVersionChain(await load("version-chain/project-delivery-tool.json"));
  const wrapper = await load("acceptance-profile/headless-project-delivery-tool.json");
  const profile = evaluateAcceptanceProfile(wrapper.candidate);
  return {
    schema_version: "1.0",
    record_type: "major-milestone-candidate",
    project: structuredClone(versionChain.project),
    version_chain: versionChain,
    acceptance_profile: profile,
    milestones: MAJOR_MILESTONE_DEFINITIONS.map((definition) => ({
      ...definition,
      pc_ids: [...definition.pc_ids],
      deliverables: [{ deliverable_id: `delivery-${definition.milestone_id.toLowerCase().replace(".", "-")}`, description: `${definition.title} output` }],
      acceptances: profile.enabled_acceptances
        .filter((type): type is "integration" | "interaction" | "product" => type !== "ui_restoration")
        .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" as const })),
    })),
    summary: { milestone_count: 9, scope_pc_count: 20, duplicate_scope_pc_count: 0, deliverable_count: 9 },
  };
}

function fakeIo(bytes: Uint8Array, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return bytes; },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

function parseReceipt(output: readonly string[]): Record<string, unknown> {
  assert.equal(output.length, 1);
  const value = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8"));
  assert.equal(canonicalizeJson(value), output[0]);
  return value as Record<string, unknown>;
}

function processRun(stdin: string, args: readonly string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, [compiledCli, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    child.stdout.on("data", (value: Uint8Array) => stdout.push(value));
    child.stderr.on("data", (value: Uint8Array) => stderr.push(value));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(stdin);
  });
}

test("CLI 成功只输出一份确定性 MAJOR_MILESTONE_ACCEPTED JCS 回执", async () => {
  const canonical = canonicalizeJson(await input());
  const first = fakeIo(Buffer.from(canonical));
  const second = fakeIo(Buffer.from(canonical));
  await runMajorMilestone(first.io);
  await runMajorMilestone(second.io);
  assert.deepEqual(first.output, second.output);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(first.exitCodes, []);
  const receipt = parseReceipt(first.output);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "MAJOR_MILESTONE_ACCEPTED");
  const data = receipt.data as Record<string, unknown>;
  assert.equal(data.canonical_json, canonicalizeJson(data.major_milestone_plan));
  assert.equal(data.digest, digestJson(data.major_milestone_plan));
});

test("非 JCS、坏 UTF-8、参数、未知/敏感输入稳定失败且不泄漏值", async () => {
  const base = structuredClone(await input()) as unknown as Record<string, unknown>;
  const unknown = structuredClone(base); unknown.unexpected = true;
  const sensitive = structuredClone(base); sensitive.api_token = "secret-that-must-not-appear";
  const cases = [
    fakeIo(Buffer.from('{"z":1,"a":2}')),
    fakeIo(Uint8Array.from([0xc3, 0x28])),
    fakeIo(Buffer.from(canonicalizeJson(base)), ["--commit"]),
    fakeIo(Buffer.from(canonicalizeJson(unknown))),
    fakeIo(Buffer.from(canonicalizeJson(sensitive))),
  ];
  for (const item of cases) {
    await runMajorMilestone(item.io);
    const receipt = parseReceipt(item.output);
    assert.equal(receipt.ok, false);
    assert.equal(["INVALID_JSON", "MAJOR_MILESTONE_REJECTED", "SENSITIVE_FIELD_DETECTED"].includes(String(receipt.code)), true);
    assert.equal(canonicalizeJson(receipt.data), canonicalizeJson({ dry_run: false }));
    assert.deepEqual(item.exitCodes, [1]);
    assert.deepEqual(item.diagnostics, ["Major milestone input rejected\n"]);
    assert.doesNotMatch(`${item.output.join("\n")}${item.diagnostics.join("\n")}`, /secret-that-must-not-appear/i);
  }
});

test("构建后的 CLI 进程保持 stdout JCS、stderr 诊断与退出码边界", async () => {
  const accepted = await processRun(canonicalizeJson(await input()));
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.stderr, "");
  assert.equal(parseReceipt([accepted.stdout]).code, "MAJOR_MILESTONE_ACCEPTED");
  const rejected = await processRun('{"z":1,"a":2}');
  assert.equal(rejected.code, 1);
  assert.equal(parseReceipt([rejected.stdout]).code, "INVALID_JSON");
  assert.equal(rejected.stderr, "Major milestone input rejected\n");
});

test("Skill 仅新增 S2.2 候选入口并阻塞 S2.3+、提升和完成声明", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /## S2\.2 Major Milestone Exclusive Boundaries/);
  assert.match(skill, /parseVersionChainResult/);
  assert.match(skill, /parseAcceptanceProfileDecision/);
  assert.match(skill, /node dist\/src\/cli\/major-milestone\.js/);
  assert.match(skill, /MAJOR_MILESTONE_ACCEPTED/);
  assert.match(skill, /S2\.3 and S2\.4 remain separately gated/);
  assert.match(skill, /Do not claim PC-10, M2\.1, V2, or P5 complete/);
});
