import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runExecutionPacket } from "../../src/cli/execution-packet.ts";
import { evaluateAcceptanceProfile } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { evaluateExecutionPacket, type ExecutionPacketCandidate, type ExecutionPacketEvaluationContext } from "../../src/domain/execution-packet.ts";
import { MAJOR_MILESTONE_DEFINITIONS, evaluateMajorMilestonePlan, type MajorMilestoneCandidate } from "../../src/domain/major-milestone.ts";
import { SMALL_MILESTONE_DEFINITIONS, evaluateSmallMilestonePlan, type SmallMilestoneCandidate } from "../../src/domain/small-milestone.ts";
import { evaluateVersionChain } from "../../src/domain/version-chain.ts";

const compiledCli = resolve(process.cwd(), "dist/src/cli/execution-packet.js");
const fixtureRoot = resolve(process.cwd(), "tests/fixtures");

function fakeIo(bytes: Uint8Array, args: readonly string[] = []) {
  const output: string[] = []; const diagnostics: string[] = []; const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args, async readInput() { return bytes; }, writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); }, setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

function parseReceipt(output: readonly string[]): Record<string, unknown> {
  assert.equal(output.length, 1);
  const value = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8"));
  assert.equal(canonicalizeJson(value), output[0]);
  return value as Record<string, unknown>;
}

async function loadCandidate(): Promise<ExecutionPacketCandidate> {
  const load = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(resolve(fixtureRoot, path), "utf8")) as Record<string, unknown>;
  const versionChain = evaluateVersionChain(await load("version-chain/project-delivery-tool.json"));
  const profileWrapper = await load("acceptance-profile/headless-project-delivery-tool.json");
  const profile = evaluateAcceptanceProfile(profileWrapper.candidate);
  const majorCandidate: MajorMilestoneCandidate = {
    schema_version: "1.0", record_type: "major-milestone-candidate", project: structuredClone(versionChain.project), version_chain: versionChain, acceptance_profile: profile,
    milestones: MAJOR_MILESTONE_DEFINITIONS.map((definition) => ({
      ...definition, pc_ids: [...definition.pc_ids], deliverables: [{ deliverable_id: `delivery-${definition.milestone_id.toLowerCase().replace(".", "-")}`, description: `${definition.title} output` }],
      acceptances: profile.enabled_acceptances.filter((value): value is "integration" | "interaction" | "product" => value !== "ui_restoration").map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" as const })),
    })), summary: { milestone_count: 9, scope_pc_count: 20, duplicate_scope_pc_count: 0, deliverable_count: 9 },
  };
  const majorPlan = evaluateMajorMilestonePlan(majorCandidate);
  const milestones = SMALL_MILESTONE_DEFINITIONS.map((definition) => ({ ...definition, depends_on: [...definition.depends_on] }));
  const smallCandidate: SmallMilestoneCandidate = {
    schema_version: "1.0", record_type: "small-milestone-candidate", project: structuredClone(majorPlan.project), major_milestone_plan: majorPlan, milestones,
    dependency_edges: milestones.slice(1).map((milestone, index) => ({ dependency_id: milestones[index]!.milestone_id, dependent_id: milestone.milestone_id })),
    summary: { milestone_count: 18, major_milestone_count: 9, dependency_edge_count: 17, root_milestone_id: "S1.1", terminal_milestone_id: "S4.3", cycle_count: 0 },
  };
  const plan = evaluateSmallMilestonePlan(smallCandidate);
  const milestone = plan.milestones.find(({ milestone_id }) => milestone_id === "S2.4")!;
  const owner = plan.major_milestone_plan.milestones.find(({ milestone_id }) => milestone_id === milestone.major_milestone_id)!;
  const s4Digest = `sha256:${"b".repeat(64)}`;
  const resultDigest = `sha256:${"c".repeat(64)}`;
  const now = Date.now();
  return {
    schema_version: "1.0", record_type: "execution-packet-candidate", command: "packet-build", dry_run: true, project: structuredClone(plan.project), small_milestone_plan: plan, selected_milestone_id: "S2.4",
    control_identity: { repository_id: plan.project.repository_id, route_generation: 1, stage_id: "P5/V2/M2.2/S2.4", plan_id: `plan-${plan.candidate_digest.slice("sha256:".length, 31)}`, plan_generation: 1, task_id: "S2.4", task_attempt: 1, baseline_oid: plan.project.formal_baseline },
    target: { milestone_id: "S2.4", objective: milestone.outputs, why_now: `Execute ${milestone.title} after accepted dependencies` },
    input_bindings: [
      { input_id: "S2.3", requirement: "S2.3", source_ref: "accepted-plan:project-delivery-tool", source_digest: plan.candidate_digest },
      { input_id: "S4", requirement: "S4", source_ref: "signed-architecture:S4", source_digest: s4Digest },
    ],
    dependency_proofs: milestone.depends_on.map((dependency_id) => ({ dependency_id, status: "satisfied", evidence_ref: `accepted-result:${dependency_id}`, evidence_digest: resultDigest })),
    scope: { allowed_paths: ["src/target/**", "tests/target/**"], forbidden_paths: [".git/**", ".codex/**"], non_goals: [milestone.non_goals], modifies_signed_upstream: false, change_request_ref: null },
    output_contract: { required_outputs: [milestone.outputs], candidate_form: "immutable-candidate" },
    verification: { checks: (["positive", "negative", "blocked", "recovery"] as const).map((check_type) => ({ check_id: `${check_type}-check`, check_type })), acceptance_types: owner.acceptances.map(({ acceptance_type }) => acceptance_type), failure_rules: [milestone.failure_return] },
    execution: { sandbox_mode: "isolated-worktree", host_mode: "manual-isolated", timeout_policy: { timeout_ms: 300000, on_timeout: "blocked" } },
    reporting: { result_schema_version: "1.0", evidence_requirements: [milestone.tests, milestone.definition_of_done], escalation_rules: [milestone.failure_return] },
    validity: { created_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 60_000).toISOString() },
  };
}

function contextFor(input: ExecutionPacketCandidate): ExecutionPacketEvaluationContext {
  const now = new Date((Date.parse(input.validity.created_at) + Date.parse(input.validity.expires_at)) / 2).toISOString();
  return {
    clock: () => now,
    expected: { repository_id: input.project.repository_id, baseline_oid: input.project.formal_baseline, route_generation: 1, plan_generation: 1, task_attempt: 1 },
    input_authorities: input.input_bindings.map(({ input_id, source_ref, source_digest }) => ({ input_id: input_id as "S2.3" | "S4", source_ref, source_digest })),
    accepted_dependency_results: input.dependency_proofs.map(({ dependency_id, evidence_ref, evidence_digest }) => ({
      dependency_id, repository_id: input.project.repository_id, baseline_oid: input.project.formal_baseline, route_generation: 1,
      stage_id: `P5/V2/M2.2/${dependency_id}`, plan_id: input.control_identity.plan_id, plan_generation: 1, task_id: dependency_id,
      task_attempt: 1, status: "accepted", result_ref: evidence_ref, result_digest: evidence_digest,
    })),
  };
}

function processRun(stdin: string, args: readonly string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, [compiledCli, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Uint8Array[] = []; const stderr: Uint8Array[] = [];
    child.stdout.on("data", (value: Uint8Array) => stdout.push(value)); child.stderr.on("data", (value: Uint8Array) => stderr.push(value));
    child.once("error", reject); child.once("close", (code) => resolveResult({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(stdin);
  });
}

test("CLI 成功只输出一份确定性 EXECUTION_PACKET_VALID JCS 回执", async () => {
  const input = await loadCandidate();
  const canonical = canonicalizeJson(input);
  const first = fakeIo(Buffer.from(canonical)); const second = fakeIo(Buffer.from(canonical));
  const context = contextFor(input);
  await runExecutionPacket(first.io, context); await runExecutionPacket(second.io, context);
  assert.deepEqual(first.output, second.output); assert.deepEqual(first.diagnostics, []); assert.deepEqual(first.exitCodes, []);
  const receipt = parseReceipt(first.output);
  assert.equal(receipt.ok, true); assert.equal(receipt.code, "EXECUTION_PACKET_VALID");
  const data = receipt.data as Record<string, unknown>;
  assert.equal(data.canonical_json, canonicalizeJson(data.execution_packet_result));
  assert.equal(data.digest, digestJson(data.execution_packet_result));
  assert.equal((data.execution_packet_result as Record<string, unknown>).status, "packet-valid-only");
  assert.deepEqual(evaluateExecutionPacket(input, context), data.execution_packet_result);
});

test("非 JCS、坏 UTF-8、参数注入、未知与敏感输入稳定失败且值安全", async () => {
  const base = structuredClone(await loadCandidate()) as unknown as Record<string, unknown>;
  const unknown = structuredClone(base); unknown.unexpected = true;
  const sensitive = structuredClone(base); sensitive.api_token = "secret-that-must-not-appear";
  const cases = [fakeIo(Buffer.from('{"z":1,"a":2}')), fakeIo(Uint8Array.from([0xc3, 0x28])), fakeIo(Buffer.from(canonicalizeJson(base)), ["--dispatch"]), fakeIo(Buffer.from(canonicalizeJson(unknown))), fakeIo(Buffer.from(canonicalizeJson(sensitive)))];
  for (const item of cases) {
    await runExecutionPacket(item.io);
    const receipt = parseReceipt(item.output);
    assert.equal(receipt.ok, false);
    assert.equal(["INVALID_JSON", "EXECUTION_PACKET_REJECTED", "SENSITIVE_FIELD_DETECTED"].includes(String(receipt.code)), true);
    assert.equal(canonicalizeJson(receipt.data), canonicalizeJson({ dry_run: false })); assert.deepEqual(item.exitCodes, [1]);
    assert.deepEqual(item.diagnostics, ["Execution packet input rejected\n"]);
    assert.doesNotMatch(`${item.output.join("\n")}${item.diagnostics.join("\n")}`, /secret-that-must-not-appear/i);
  }
});

test("构建后的独立 CLI 因无进程内 authority 稳定拒绝并保持 JCS、stderr 与退出码边界", async () => {
  const blocked = await processRun(canonicalizeJson(await loadCandidate()));
  assert.equal(blocked.code, 1); assert.equal(parseReceipt([blocked.stdout]).code, "EXECUTION_PACKET_REJECTED");
  assert.equal(blocked.stderr, "Execution packet input rejected\n");
  const rejected = await processRun('{"z":1,"a":2}');
  assert.equal(rejected.code, 1); assert.equal(parseReceipt([rejected.stdout]).code, "INVALID_JSON");
  assert.equal(rejected.stderr, "Execution packet input rejected\n");
});

test("Skill 只暴露 S2.4 候选校验并继续阻塞持久化、派发、S3.1、提升和完成声明", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /## S2\.4 Execution Packet Candidate Boundary/);
  assert.match(skill, /parseSmallMilestonePlan/);
  assert.match(skill, /node dist\/src\/cli\/execution-packet\.js/);
  assert.match(skill, /EXECUTION_PACKET_VALID/);
  assert.match(skill, /packet-valid-only/);
  assert.match(skill, /non-JSON, in-process evaluation context/);
  assert.match(skill, /pure stdin invocation is intentionally rejected/);
  assert.match(skill, /full.*remains separately gated to S3\.1/);
  assert.match(skill, /does not persist or dispatch/);
  assert.match(skill, /S3\.1 remains separately gated/);
  assert.match(skill, /Do not claim PC-12, PC-13, M2\.2, V2, or P5 complete/);
});
