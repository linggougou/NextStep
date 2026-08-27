import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runSmallMilestone } from "../../src/cli/small-milestone.ts";
import { evaluateAcceptanceProfile } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { MAJOR_MILESTONE_DEFINITIONS, evaluateMajorMilestonePlan, type MajorMilestoneCandidate } from "../../src/domain/major-milestone.ts";
import { SMALL_MILESTONE_DEFINITIONS, type SmallMilestoneCandidate } from "../../src/domain/small-milestone.ts";
import { evaluateVersionChain } from "../../src/domain/version-chain.ts";

const fixtures = resolve(process.cwd(), "tests/fixtures");
const compiledCli = resolve(process.cwd(), "dist/src/cli/small-milestone.js");

async function load(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(fixtures, path), "utf8")) as Record<string, unknown>;
}

async function input(): Promise<SmallMilestoneCandidate> {
  const versionChain = evaluateVersionChain(await load("version-chain/project-delivery-tool.json"));
  const profileWrapper = await load("acceptance-profile/headless-project-delivery-tool.json");
  const profile = evaluateAcceptanceProfile(profileWrapper.candidate);
  const majorCandidate: MajorMilestoneCandidate = {
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
        .filter((value): value is "integration" | "interaction" | "product" => value !== "ui_restoration")
        .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" as const })),
    })),
    summary: { milestone_count: 9, scope_pc_count: 20, duplicate_scope_pc_count: 0, deliverable_count: 9 },
  };
  const majorPlan = evaluateMajorMilestonePlan(majorCandidate);
  const milestones = SMALL_MILESTONE_DEFINITIONS.map((definition) => ({ ...definition, depends_on: [...definition.depends_on] }));
  return {
    schema_version: "1.0",
    record_type: "small-milestone-candidate",
    project: structuredClone(majorPlan.project),
    major_milestone_plan: majorPlan,
    milestones,
    dependency_edges: milestones.slice(1).map((milestone, index) => ({ dependency_id: milestones[index]!.milestone_id, dependent_id: milestone.milestone_id })),
    summary: { milestone_count: 18, major_milestone_count: 9, dependency_edge_count: 17, root_milestone_id: "S1.1", terminal_milestone_id: "S4.3", cycle_count: 0 },
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

test("CLI 成功只输出一份确定性 SMALL_MILESTONE_ACCEPTED JCS 回执", async () => {
  const canonical = canonicalizeJson(await input());
  const first = fakeIo(Buffer.from(canonical));
  const second = fakeIo(Buffer.from(canonical));
  await runSmallMilestone(first.io);
  await runSmallMilestone(second.io);
  assert.deepEqual(first.output, second.output);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(first.exitCodes, []);
  const receipt = parseReceipt(first.output);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "SMALL_MILESTONE_ACCEPTED");
  const data = receipt.data as Record<string, unknown>;
  assert.equal(data.canonical_json, canonicalizeJson(data.small_milestone_plan));
  assert.equal(data.digest, digestJson(data.small_milestone_plan));
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
    await runSmallMilestone(item.io);
    const receipt = parseReceipt(item.output);
    assert.equal(receipt.ok, false);
    assert.equal(["INVALID_JSON", "SMALL_MILESTONE_REJECTED", "SENSITIVE_FIELD_DETECTED"].includes(String(receipt.code)), true);
    assert.equal(canonicalizeJson(receipt.data), canonicalizeJson({ dry_run: false }));
    assert.deepEqual(item.exitCodes, [1]);
    assert.deepEqual(item.diagnostics, ["Small milestone input rejected\n"]);
    assert.doesNotMatch(`${item.output.join("\n")}${item.diagnostics.join("\n")}`, /secret-that-must-not-appear/i);
  }
});

test("构建后的 CLI 进程保持 stdout JCS、stderr 诊断与退出码边界", async () => {
  const accepted = await processRun(canonicalizeJson(await input()));
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.stderr, "");
  assert.equal(parseReceipt([accepted.stdout]).code, "SMALL_MILESTONE_ACCEPTED");
  const rejected = await processRun('{"z":1,"a":2}');
  assert.equal(rejected.code, 1);
  assert.equal(parseReceipt([rejected.stdout]).code, "INVALID_JSON");
  assert.equal(rejected.stderr, "Small milestone input rejected\n");
});

test("Skill 只暴露 S2.3 候选入口并阻塞 S2.4、任务、派发、提升和完成声明", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /## S2\.3 Small Milestone Closure And Dependencies/);
  assert.match(skill, /parseMajorMilestonePlan/);
  assert.match(skill, /node dist\/src\/cli\/small-milestone\.js/);
  assert.match(skill, /SMALL_MILESTONE_ACCEPTED/);
  assert.match(skill, /S2\.4 remains separately gated/);
  assert.match(skill, /Do not claim PC-11, M2\.2, V2, or P5 complete/);
});
