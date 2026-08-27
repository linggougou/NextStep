import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { evaluateAcceptanceProfile, type AcceptanceProfileDecision } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  evaluateExecutionPacket,
  ExecutionPacketError,
  parseExecutionPacketResult,
  type ExecutionPacketCandidate,
} from "../../src/domain/execution-packet.ts";
import {
  MAJOR_MILESTONE_DEFINITIONS,
  evaluateMajorMilestonePlan,
  type MajorMilestoneAcceptance,
  type MajorMilestoneCandidate,
  type MajorMilestonePlan,
} from "../../src/domain/major-milestone.ts";
import {
  SMALL_MILESTONE_DEFINITIONS,
  evaluateSmallMilestonePlan,
  type SmallMilestoneCandidate,
  type SmallMilestonePlan,
} from "../../src/domain/small-milestone.ts";
import { evaluateVersionChain } from "../../src/domain/version-chain.ts";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures");
const fixtureNames = ["project-delivery-tool", "community-workshop", "expense-reminder"] as const;
const digestB = `sha256:${"b".repeat(64)}` as const;
const digestC = `sha256:${"c".repeat(64)}` as const;
const fixedNow = "2026-08-27T12:30:00Z";

interface TestEvaluationContext {
  readonly clock: () => unknown;
  readonly expected: {
    readonly repository_id: string;
    readonly baseline_oid: string;
    readonly route_generation: 1;
    readonly plan_generation: 1;
    readonly task_attempt: 1;
  };
  readonly input_authorities: readonly {
    readonly input_id: "S2.3" | "S4";
    readonly source_ref: string;
    readonly source_digest: string;
  }[];
  readonly accepted_dependency_results: readonly {
    readonly dependency_id: string;
    readonly repository_id: string;
    readonly baseline_oid: string;
    readonly route_generation: 1;
    readonly stage_id: string;
    readonly plan_id: string;
    readonly plan_generation: 1;
    readonly task_id: string;
    readonly task_attempt: number;
    readonly status: "accepted";
    readonly result_ref: string;
    readonly result_digest: string;
  }[];
}

const evaluate = evaluateExecutionPacket as unknown as (
  value: unknown,
  context: TestEvaluationContext,
) => ReturnType<typeof evaluateExecutionPacket>;
const parseResult = parseExecutionPacketResult as unknown as (
  value: unknown,
  context?: TestEvaluationContext,
) => ReturnType<typeof parseExecutionPacketResult>;

interface ExecutionFixture {
  readonly small_milestone_fixture: string;
  readonly selected_milestone_id: string;
  readonly allowed_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
  readonly created_at: string;
  readonly expires_at: string;
}
interface SmallFixtureReference { readonly major_milestone_fixture: string }
interface MajorFixtureReference { readonly version_chain_fixture: string; readonly acceptance_profile_fixture: string; readonly deliverable_prefix: string }

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(fixtureRoot, path), "utf8")) as Record<string, unknown>;
}

function acceptances(profile: AcceptanceProfileDecision): MajorMilestoneAcceptance[] {
  return profile.enabled_acceptances
    .filter((value): value is "integration" | "interaction" | "product" => value !== "ui_restoration")
    .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" }));
}

async function smallPlan(name: string): Promise<SmallMilestonePlan> {
  const smallRef = await json(`small-milestone/${name}.json`) as unknown as SmallFixtureReference;
  const majorRef = await json(`major-milestone/${smallRef.major_milestone_fixture}`) as unknown as MajorFixtureReference;
  const versionChain = evaluateVersionChain(await json(`version-chain/${majorRef.version_chain_fixture}`));
  const profileWrapper = await json(`acceptance-profile/${majorRef.acceptance_profile_fixture}`);
  const profile = evaluateAcceptanceProfile(profileWrapper.candidate);
  const majorCandidate: MajorMilestoneCandidate = {
    schema_version: "1.0", record_type: "major-milestone-candidate", project: structuredClone(versionChain.project),
    version_chain: versionChain, acceptance_profile: profile,
    milestones: MAJOR_MILESTONE_DEFINITIONS.map((definition) => ({
      ...definition, pc_ids: [...definition.pc_ids],
      deliverables: [{ deliverable_id: `${majorRef.deliverable_prefix}-${definition.milestone_id.toLowerCase().replace(".", "-")}`, description: `${definition.title} output` }],
      acceptances: acceptances(profile),
    })),
    summary: { milestone_count: 9, scope_pc_count: 20, duplicate_scope_pc_count: 0, deliverable_count: 9 },
  };
  const upstream: MajorMilestonePlan = evaluateMajorMilestonePlan(majorCandidate);
  const milestones = SMALL_MILESTONE_DEFINITIONS.map((definition) => ({ ...definition, depends_on: [...definition.depends_on] }));
  const candidate: SmallMilestoneCandidate = {
    schema_version: "1.0", record_type: "small-milestone-candidate", project: structuredClone(upstream.project), major_milestone_plan: upstream, milestones,
    dependency_edges: milestones.slice(1).map((milestone, index) => ({ dependency_id: milestones[index]!.milestone_id, dependent_id: milestone.milestone_id })),
    summary: { milestone_count: 18, major_milestone_count: 9, dependency_edge_count: 17, root_milestone_id: "S1.1", terminal_milestone_id: "S4.3", cycle_count: 0 },
  };
  return evaluateSmallMilestonePlan(candidate);
}

function versionFor(majorId: string): string { return `V${majorId[1]}`; }
function planIdFor(plan: SmallMilestonePlan): string { return `plan-${plan.candidate_digest.slice("sha256:".length, 31)}`; }

async function candidate(name: typeof fixtureNames[number] = "project-delivery-tool"): Promise<ExecutionPacketCandidate> {
  const config = await json(`execution-packet/${name}.json`) as unknown as ExecutionFixture;
  const plan = await smallPlan(config.small_milestone_fixture);
  const milestone = plan.milestones.find(({ milestone_id }) => milestone_id === config.selected_milestone_id)!;
  const owner = plan.major_milestone_plan.milestones.find(({ milestone_id }) => milestone_id === milestone.major_milestone_id)!;
  return {
    schema_version: "1.0", record_type: "execution-packet-candidate", command: "packet-build", dry_run: true,
    project: structuredClone(plan.project), small_milestone_plan: plan, selected_milestone_id: milestone.milestone_id,
    control_identity: {
      repository_id: plan.project.repository_id, route_generation: 1,
      stage_id: `P5/${versionFor(milestone.major_milestone_id)}/${milestone.major_milestone_id}/${milestone.milestone_id}`,
      plan_id: planIdFor(plan), plan_generation: 1, task_id: milestone.milestone_id, task_attempt: 1,
      baseline_oid: plan.project.formal_baseline,
    },
    target: { milestone_id: milestone.milestone_id, objective: milestone.outputs, why_now: `Execute ${milestone.title} after accepted dependencies` },
    input_bindings: [
      { input_id: "S2.3", requirement: "S2.3", source_ref: `accepted-plan:${name}`, source_digest: plan.candidate_digest },
      { input_id: "S4", requirement: "S4", source_ref: "signed-architecture:S4", source_digest: digestB },
    ],
    dependency_proofs: milestone.depends_on.map((dependency_id) => ({ dependency_id, status: "satisfied", evidence_ref: `accepted-result:${dependency_id}`, evidence_digest: digestC })),
    scope: { allowed_paths: config.allowed_paths, forbidden_paths: config.forbidden_paths, non_goals: [milestone.non_goals], modifies_signed_upstream: false, change_request_ref: null },
    output_contract: { required_outputs: [milestone.outputs], candidate_form: "immutable-candidate" },
    verification: {
      checks: (["positive", "negative", "blocked", "recovery"] as const).map((check_type) => ({ check_id: `${check_type}-check`, check_type })),
      acceptance_types: owner.acceptances.map(({ acceptance_type }) => acceptance_type), failure_rules: [milestone.failure_return],
    },
    execution: { sandbox_mode: "isolated-worktree", host_mode: "manual-isolated", timeout_policy: { timeout_ms: 300000, on_timeout: "blocked" } },
    reporting: { result_schema_version: "1.0", evidence_requirements: [milestone.tests, milestone.definition_of_done], escalation_rules: [milestone.failure_return] },
    validity: { created_at: config.created_at, expires_at: config.expires_at },
  } as unknown as ExecutionPacketCandidate;
}

function contextFor(input: ExecutionPacketCandidate, clock: () => unknown = () => fixedNow): TestEvaluationContext {
  return {
    clock,
    expected: {
      repository_id: input.project.repository_id,
      baseline_oid: input.project.formal_baseline,
      route_generation: 1,
      plan_generation: 1,
      task_attempt: 1,
    },
    input_authorities: input.input_bindings.map(({ input_id, source_ref, source_digest }) => ({ input_id: input_id as "S2.3" | "S4", source_ref, source_digest })),
    accepted_dependency_results: input.dependency_proofs.map(({ dependency_id, evidence_ref, evidence_digest }) => ({
      dependency_id,
      repository_id: input.project.repository_id,
      baseline_oid: input.project.formal_baseline,
      route_generation: 1,
      stage_id: `P5/V2/M2.2/${dependency_id}`,
      plan_id: input.control_identity.plan_id,
      plan_generation: 1,
      task_id: dependency_id,
      task_attempt: 1,
      status: "accepted",
      result_ref: evidence_ref,
      result_digest: evidence_digest,
    })),
  };
}

function expectCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ExecutionPacketError);
    assert.ok(error.reasons.some((reason) => reason.code === code), JSON.stringify(error.reasons));
    const keys = error.reasons.map((reason) => `${reason.code}\u0000${reason.path}\u0000${reason.message}`);
    assert.deepEqual(keys, [...keys].sort());
    return true;
  };
}

function changed(base: ExecutionPacketCandidate, mutate: (value: Record<string, unknown>) => void): Record<string, unknown> {
  const value = structuredClone(base) as unknown as Record<string, unknown>;
  mutate(value);
  return value;
}

test("三类目标项目各选择一个已接受 S2.3 小里程碑并确定性生成十组完整任务包候选", async () => {
  for (const name of fixtureNames) {
    const input = await candidate(name);
    const first = evaluate(input, contextFor(input));
    const second = evaluate(JSON.parse(canonicalizeJson(input)) as unknown, contextFor(input));
    assert.equal(first.status, "packet-valid-only");
    assert.equal(first.execution_packet.milestone_id, input.selected_milestone_id);
    const packetBody = structuredClone(first.execution_packet) as unknown as Record<string, unknown>;
    delete packetBody.packet_digest;
    delete packetBody.dedup_key;
    assert.equal(first.execution_packet.packet_digest, digestJson(packetBody));
    assert.match(first.execution_packet.packet_id, /^ep-[a-f0-9]{24}$/);
    assert.match(first.execution_packet.dedup_key, /^sha256:[a-f0-9]{64}$/);
    assert.equal(first.summary.field_group_count, 10);
    assert.equal(first.summary.side_effects, "none");
    assert.equal(canonicalizeJson(first), canonicalizeJson(second));
    assert.deepEqual(parseResult(first, contextFor(input)), first);
  }
});

test("上游必须由 parseSmallMilestonePlan 权威重验且项目、控制、里程碑和完整语义不可漂移", async () => {
  const base = await candidate();
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.small_milestone_plan as Record<string, unknown>).candidate_digest = `sha256:${"f".repeat(64)}`; }, "UPSTREAM_SMALL_MILESTONE_INVALID"],
    [(value) => { (value.project as Record<string, unknown>).repository_id = `sha256:${"b".repeat(64)}`; }, "PROJECT_BINDING_MISMATCH"],
    [(value) => { (value.control_identity as Record<string, unknown>).baseline_oid = "b".repeat(40); }, "CONTROL_IDENTITY_MISMATCH"],
    [(value) => { value.selected_milestone_id = "S9.9"; }, "MILESTONE_NOT_FOUND"],
    [(value) => { (value.target as Record<string, unknown>).objective = "changed"; }, "MILESTONE_CONTRACT_MISMATCH"],
    [(value) => { ((value.scope as Record<string, unknown>).non_goals as string[])[0] = "changed"; }, "MILESTONE_CONTRACT_MISMATCH"],
    [(value) => { ((value.output_contract as Record<string, unknown>).required_outputs as string[])[0] = "changed"; }, "MILESTONE_CONTRACT_MISMATCH"],
  ];
  for (const [mutate, code] of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));
  const duplicate = changed(base, (value) => {
    const plan = value.small_milestone_plan as Record<string, unknown>;
    (plan.milestones as unknown[]).push(structuredClone((plan.milestones as unknown[])[9]));
  });
  assert.throws(() => evaluate(duplicate, contextFor(base)), expectCode("MILESTONE_NOT_UNIQUE"));
});

test("输入绑定与依赖证明的缺失、冲突、不满足和伪造全部 fail closed", async () => {
  const base = await candidate();
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { value.input_bindings = []; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.input_bindings as unknown[]).push(structuredClone((value.input_bindings as unknown[])[0])); }, "INVALID_EXECUTION_PACKET"],
    [(value) => { ((value.input_bindings as Record<string, unknown>[])[0]!).source_digest = "not-a-digest"; }, "SOURCE_DIGEST_INVALID"],
    [(value) => { value.dependency_proofs = []; }, "DEPENDENCY_PROOF_MISSING"],
    [(value) => { ((value.dependency_proofs as Record<string, unknown>[])[0]!).status = "blocked"; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.dependency_proofs as unknown[]).push(structuredClone((value.dependency_proofs as unknown[])[0])); }, "DEPENDENCY_PROOF_CONFLICT"],
  ];
  for (const [mutate, code] of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));
});

test("路径、上游变更、验收 Profile、检查覆盖、宿主能力和有效期严格拒绝", async () => {
  const base = await candidate();
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { ((value.scope as Record<string, unknown>).allowed_paths as string[])[0] = "src/../secret"; }, "PATH_NOT_NORMALIZED"],
    [(value) => { ((value.scope as Record<string, unknown>).allowed_paths as string[])[0] = "src/*/secret"; }, "PATH_NOT_NORMALIZED"],
    [(value) => { ((value.scope as Record<string, unknown>).allowed_paths as string[]).push("src/target/file.ts"); }, "PATH_SCOPE_CONFLICT"],
    [(value) => { ((value.scope as Record<string, unknown>).allowed_paths as string[])[0] = ".codex/results/**"; }, "CONTROL_PATH_FORBIDDEN"],
    [(value) => { const scope = value.scope as Record<string, unknown>; scope.modifies_signed_upstream = true; scope.change_request_ref = null; }, "SIGNED_UPSTREAM_FORBIDDEN"],
    [(value) => { ((value.verification as Record<string, unknown>).acceptance_types as string[]).pop(); }, "ACCEPTANCE_PROFILE_CONFLICT"],
    [(value) => { ((value.verification as Record<string, unknown>).checks as unknown[]).pop(); }, "CHECK_COVERAGE_MISSING"],
    [(value) => { ((value.execution as Record<string, unknown>).host_mode) = "blocked"; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { ((value.execution as Record<string, unknown>).capability_evidence) = { isolated_worktree: true, filesystem_write: true, git: true, network: false }; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { ((value.validity as Record<string, unknown>).expires_at) = "2026-08-27T11:00:00Z"; }, "INVALID_VALIDITY_WINDOW"],
  ];
  for (const [mutate, code] of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));
});

test("进程内时钟只读取一次并拒绝未生效、已过期和无效 clock，结果 parser 不受当前时间漂移", async () => {
  const base = await candidate();
  let calls = 0;
  const current = evaluate(base, contextFor(base, () => { calls += 1; return fixedNow; }));
  assert.equal(calls, 1);
  assert.deepEqual(parseResult(current, { ...contextFor(base), clock: () => { throw new Error("parser must not read clock"); } } as TestEvaluationContext), current);
  assert.throws(() => evaluate(base, contextFor(base, () => "2026-08-27T11:59:59Z")), expectCode("PACKET_NOT_YET_VALID"));
  assert.throws(() => evaluate(base, contextFor(base, () => "2026-08-27T13:00:00Z")), expectCode("PACKET_EXPIRED"));
  for (const invalid of ["not-a-clock", Number.NaN, undefined]) {
    assert.throws(() => evaluate(base, contextFor(base, () => invalid)), expectCode("INVALID_VALIDATION_CLOCK"));
  }
});

test("S2.4 仅声明 initial/manual-isolated 且拒绝 caller capability 与 signed-upstream 变更", async () => {
  const base = await candidate();
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.execution as Record<string, unknown>).host_mode = "full"; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.execution as Record<string, unknown>).host_mode = "blocked"; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.execution as Record<string, unknown>).capability_evidence = { isolated_worktree: true }; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { const scope = value.scope as Record<string, unknown>; scope.modifies_signed_upstream = true; scope.change_request_ref = "CR-999"; }, "SIGNED_UPSTREAM_FORBIDDEN"],
    [(value) => { (value.scope as Record<string, unknown>).change_request_ref = "CR-999"; }, "SIGNED_UPSTREAM_FORBIDDEN"],
  ];
  for (const [mutate, code] of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));
});

test("签认真源路径及其祖先和子孙不可作为 allowed path，近似目录不误判", async () => {
  const base = await candidate();
  for (const path of [
    "docs/product-specs/**", "docs/product-specs/index.md", "docs/design-docs/**", "docs/architecture/s4/**",
    "docs/exec-plans/**", "docs/**", "docs",
  ]) {
    assert.throws(() => evaluate(changed(base, (value) => { (value.scope as Record<string, unknown>).allowed_paths = [path]; }), contextFor(base)), expectCode("SIGNED_PATH_FORBIDDEN"));
  }
  const nearMiss = changed(base, (value) => { (value.scope as Record<string, unknown>).allowed_paths = ["docs/product-specs-backup/**"]; });
  assert.equal(evaluate(nearMiss, contextFor(base)).status, "packet-valid-only");
});

test("allowed/forbidden 各自 unique 且任何父子或 wildcard overlap 都稳定拒绝", async () => {
  const base = await candidate();
  const cases: Array<(value: Record<string, unknown>) => void> = [
    (value) => { (value.scope as Record<string, unknown>).allowed_paths = ["src/target/**", "src/target/**"]; },
    (value) => { (value.scope as Record<string, unknown>).forbidden_paths = ["tmp/**", "tmp/**"]; },
    (value) => { (value.scope as Record<string, unknown>).forbidden_paths = ["tmp/**", "tmp/private/**"]; },
    (value) => { (value.scope as Record<string, unknown>).allowed_paths = ["src/target", "src/target/file.ts"]; },
    (value) => { const scope = value.scope as Record<string, unknown>; scope.allowed_paths = ["src/target/**"]; scope.forbidden_paths = ["src/target/private.ts"]; },
  ];
  for (const mutate of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode("PATH_SCOPE_CONFLICT"));
});

test("initial identity 固定为 generation/attempt 1 且 plan_id 只能从 S2.3 candidate_digest 派生", async () => {
  const base = await candidate();
  const cases: Array<(value: Record<string, unknown>) => void> = [
    (value) => { (value.control_identity as Record<string, unknown>).route_generation = 2; },
    (value) => { (value.control_identity as Record<string, unknown>).plan_generation = 2; },
    (value) => { (value.control_identity as Record<string, unknown>).task_attempt = 2; },
  ];
  for (const mutate of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode("INITIAL_IDENTITY_REQUIRED"));
  assert.throws(() => evaluate(changed(base, (value) => { (value.control_identity as Record<string, unknown>).plan_id = "caller-chosen"; }), contextFor(base)), expectCode("PLAN_ID_MISMATCH"));
});

test("S2.3 与 S4 binding 必须精确唯一并与非 JSON authority 一致", async () => {
  const base = await candidate();
  const candidateCases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.input_bindings as unknown[]).pop(); }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.input_bindings as unknown[]).push({ input_id: "extra", requirement: "extra", source_ref: "extra", source_digest: digestB }); }, "INVALID_EXECUTION_PACKET"],
    [(value) => { (value.input_bindings as unknown[]).push(structuredClone((value.input_bindings as unknown[])[0])); }, "INVALID_EXECUTION_PACKET"],
    [(value) => { ((value.input_bindings as Record<string, unknown>[])[0]!).source_ref = "forged"; }, "INPUT_AUTHORITY_CONFLICT"],
    [(value) => { ((value.input_bindings as Record<string, unknown>[])[1]!).source_digest = digestC; }, "INPUT_AUTHORITY_CONFLICT"],
  ];
  for (const [mutate, code] of candidateCases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));

  const original = contextFor(base);
  const authorityCases: TestEvaluationContext[] = [
    { ...original, input_authorities: original.input_authorities.slice(0, 1) },
    { ...original, input_authorities: [...original.input_authorities, { input_id: "S4", source_ref: "extra", source_digest: digestB }] },
    { ...original, input_authorities: original.input_authorities.map((item, index) => index === 0 ? { ...item, source_ref: "forged" } : item) },
  ];
  for (const context of authorityCases) assert.throws(() => evaluate(base, context), expectCode("INPUT_AUTHORITY_CONFLICT"));
  assert.throws(() => evaluate(base, undefined as unknown as TestEvaluationContext), expectCode("EVALUATION_CONTEXT_REQUIRED"));
  assert.throws(() => evaluate(base, { ...original, caller_claim: true } as unknown as TestEvaluationContext), expectCode("EVALUATION_CONTEXT_REQUIRED"));
  assert.throws(() => evaluate(base, { ...original, input_authorities: [null] } as unknown as TestEvaluationContext), expectCode("EVALUATION_CONTEXT_REQUIRED"));
});

test("dependency proof 必须与唯一已接受 Result 的完整身份和 ref/digest 权威一致", async () => {
  const base = await candidate();
  const original = contextFor(base);
  assert.throws(() => evaluate(changed(base, (value) => { ((value.dependency_proofs as Record<string, unknown>[])[0]!).evidence_ref = "forged"; }), original), expectCode("DEPENDENCY_AUTHORITY_CONFLICT"));
  const contextCases: TestEvaluationContext[] = [
    { ...original, accepted_dependency_results: [] },
    { ...original, accepted_dependency_results: [...original.accepted_dependency_results, ...original.accepted_dependency_results] },
    { ...original, accepted_dependency_results: original.accepted_dependency_results.map((item) => ({ ...item, status: "blocked" as "accepted" })) },
    { ...original, accepted_dependency_results: original.accepted_dependency_results.map((item) => ({ ...item, repository_id: digestB })) },
    { ...original, accepted_dependency_results: original.accepted_dependency_results.map((item) => ({ ...item, stage_id: "P5/V2/M2.1/S2.3" })) },
  ];
  for (const context of contextCases) assert.throws(() => evaluate(base, context), expectCode("DEPENDENCY_AUTHORITY_CONFLICT"));
});

test("结果 parser 必须重验非时间 authority，缺 context、S4、dependency 或 expected identity 均拒绝", async () => {
  const base = await candidate();
  const context = contextFor(base);
  const result = evaluate(base, context);
  assert.throws(() => parseResult(result), expectCode("EVALUATION_CONTEXT_REQUIRED"));
  const s4 = context.input_authorities.find(({ input_id }) => input_id === "S4")!;
  const invalidContexts: TestEvaluationContext[] = [
    { ...context, input_authorities: context.input_authorities.filter(({ input_id }) => input_id !== "S4") },
    { ...context, input_authorities: context.input_authorities.map((item) => item.input_id === "S4" ? { ...item, source_digest: digestC } : item) },
    { ...context, accepted_dependency_results: context.accepted_dependency_results.map((item) => ({ ...item, result_ref: "forged" })) },
    { ...context, accepted_dependency_results: context.accepted_dependency_results.map((item) => ({ ...item, result_digest: digestB })) },
    { ...context, expected: { ...context.expected, repository_id: digestB } },
  ];
  assert.equal(s4.source_digest, digestB);
  for (const invalid of invalidContexts) assert.throws(() => parseResult(result, invalid), expectCode("RESULT_INTEGRITY_MISMATCH"));
});

test("结果 parser 不读取 clock，但拒绝重新摘要后与原 authority 不一致的自洽 Result", async () => {
  const base = await candidate();
  const originalContext = contextFor(base);
  const original = evaluate(base, originalContext);
  const noClockContext = { ...originalContext, clock: () => { throw new Error("expired parse clock must not be read"); } } as TestEvaluationContext;
  assert.deepEqual(parseResult(original, noClockContext), original);

  const forgedCandidate = changed(base, (value) => {
    const s4 = (value.input_bindings as Record<string, unknown>[]).find(({ input_id }) => input_id === "S4")!;
    s4.source_ref = "forged-authority:S4";
    s4.source_digest = digestC;
  }) as unknown as ExecutionPacketCandidate;
  const forgedResult = evaluate(forgedCandidate, contextFor(forgedCandidate));
  assert.throws(() => parseResult(forgedResult, originalContext), expectCode("RESULT_INTEGRITY_MISMATCH"));
});

test("结果 parser 重建候选并拒绝 packet、dedup、summary、status 和额外字段伪造", async () => {
  const input = await candidate();
  const result = evaluate(input, contextFor(input));
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { ((value.execution_packet as Record<string, unknown>).packet_digest) = `sha256:${"0".repeat(64)}`; }, "PACKET_DIGEST_MISMATCH"],
    [(value) => { ((value.execution_packet as Record<string, unknown>).dedup_key) = `sha256:${"0".repeat(64)}`; }, "DEDUP_KEY_MISMATCH"],
    [(value) => { ((value.summary as Record<string, unknown>).field_group_count) = 9; }, "SUMMARY_MISMATCH"],
    [(value) => { value.status = "dispatched"; }, "RESULT_INTEGRITY_MISMATCH"],
    [(value) => { value.dispatch = {}; }, "RESULT_INTEGRITY_MISMATCH"],
  ];
  for (const [mutate, code] of cases) {
    const forged = structuredClone(result) as unknown as Record<string, unknown>;
    mutate(forged);
    assert.throws(() => parseResult(forged, contextFor(input)), expectCode(code));
  }
});

test("未知或敏感输入、dry-run 关闭以及任何真实派发对象均拒绝且纯函数无外部副作用", async () => {
  const base = await candidate();
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { value.dry_run = false; }, "DRY_RUN_REQUIRED"],
    [(value) => { value.unexpected = true; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { value.api_token = "secret-not-echoed"; }, "SENSITIVE_INPUT"],
    [(value) => { value.dispatch = {}; }, "INVALID_EXECUTION_PACKET"],
    [(value) => { value.claim = {}; }, "INVALID_EXECUTION_PACKET"],
  ];
  for (const [mutate, code] of cases) assert.throws(() => evaluate(changed(base, mutate), contextFor(base)), expectCode(code));
  const output = canonicalizeJson(evaluate(base, contextFor(base)));
  assert.doesNotMatch(output, /dispatch-ack|dispatch-ready|claim_id|fence|formal_ref|control_ref|host_task_id/i);
  const source = await readFile(resolve(process.cwd(), "src/domain/execution-packet.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process|net|http|https)|from ["'](?:git|simple-git)/);
});
