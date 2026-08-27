import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { evaluateAcceptanceProfile, type AcceptanceProfileDecision } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  MAJOR_MILESTONE_DEFINITIONS,
  evaluateMajorMilestonePlan,
  type MajorMilestoneAcceptance,
  type MajorMilestoneCandidate,
  type MajorMilestonePlan,
} from "../../src/domain/major-milestone.ts";
import {
  SMALL_MILESTONE_DEFINITIONS,
  SmallMilestoneError,
  evaluateSmallMilestonePlan,
  parseSmallMilestonePlan,
  type SmallMilestoneCandidate,
} from "../../src/domain/small-milestone.ts";
import { VersionChainError, evaluateVersionChain, parseVersionChainResult } from "../../src/domain/version-chain.ts";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures");
const positiveFixtures = ["project-delivery-tool", "community-workshop", "expense-reminder"] as const;

interface SmallFixtureReference { readonly major_milestone_fixture: string }
interface MajorFixtureReference {
  readonly version_chain_fixture: string;
  readonly acceptance_profile_fixture: string;
  readonly deliverable_prefix: string;
}

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(fixtureRoot, path), "utf8")) as Record<string, unknown>;
}

function acceptances(profile: AcceptanceProfileDecision): MajorMilestoneAcceptance[] {
  return profile.enabled_acceptances
    .filter((value): value is "integration" | "interaction" | "product" => value !== "ui_restoration")
    .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" }));
}

async function majorPlan(name: string): Promise<MajorMilestonePlan> {
  const smallRef = await json(`small-milestone/${name}.json`) as unknown as SmallFixtureReference;
  const majorRef = await json(`major-milestone/${smallRef.major_milestone_fixture}`) as unknown as MajorFixtureReference;
  const versionChain = evaluateVersionChain(await json(`version-chain/${majorRef.version_chain_fixture}`));
  const profileWrapper = await json(`acceptance-profile/${majorRef.acceptance_profile_fixture}`);
  const profile = evaluateAcceptanceProfile(profileWrapper.candidate);
  const candidate: MajorMilestoneCandidate = {
    schema_version: "1.0",
    record_type: "major-milestone-candidate",
    project: structuredClone(versionChain.project),
    version_chain: versionChain,
    acceptance_profile: profile,
    milestones: MAJOR_MILESTONE_DEFINITIONS.map((definition) => ({
      ...definition,
      pc_ids: [...definition.pc_ids],
      deliverables: [{
        deliverable_id: `${majorRef.deliverable_prefix}-${definition.milestone_id.toLowerCase().replace(".", "-")}`,
        description: `${definition.title} output`,
      }],
      acceptances: acceptances(profile),
    })),
    summary: { milestone_count: 9, scope_pc_count: 20, duplicate_scope_pc_count: 0, deliverable_count: 9 },
  };
  return evaluateMajorMilestonePlan(candidate);
}

function candidate(upstream: MajorMilestonePlan): SmallMilestoneCandidate {
  const milestones = SMALL_MILESTONE_DEFINITIONS.map((definition) => ({
    ...definition,
    depends_on: [...definition.depends_on],
  }));
  const dependencyEdges = milestones.slice(1).map((milestone, index) => ({
    dependency_id: milestones[index]!.milestone_id,
    dependent_id: milestone.milestone_id,
  }));
  return {
    schema_version: "1.0",
    record_type: "small-milestone-candidate",
    project: structuredClone(upstream.project),
    major_milestone_plan: upstream,
    milestones,
    dependency_edges: dependencyEdges,
    summary: {
      milestone_count: 18,
      major_milestone_count: 9,
      dependency_edge_count: 17,
      root_milestone_id: "S1.1",
      terminal_milestone_id: "S4.3",
      cycle_count: 0,
    },
  };
}

function expectCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof SmallMilestoneError);
    assert.ok(error.reasons.some((reason) => reason.code === code), JSON.stringify(error.reasons));
    const keys = error.reasons.map((reason) => `${reason.code}\u0000${reason.path}\u0000${reason.message}`);
    assert.deepEqual(keys, [...keys].sort());
    return true;
  };
}

test("三类目标项目确定性生成精确 18/18 小里程碑、9/9 归属与 17/17 线性边", async () => {
  assert.equal(SMALL_MILESTONE_DEFINITIONS.length, 18);
  for (const name of positiveFixtures) {
    const input = candidate(await majorPlan(name));
    const first = evaluateSmallMilestonePlan(input);
    const second = evaluateSmallMilestonePlan(JSON.parse(canonicalizeJson(input)) as unknown);
    assert.equal(first.status, "ACCEPTED");
    assert.deepEqual(first.milestones.map(({ milestone_id }) => milestone_id), SMALL_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id));
    assert.equal(new Set(first.ownership_matrix.map(({ major_milestone_id }) => major_milestone_id)).size, 9);
    assert.equal(first.ownership_matrix.length, 18);
    assert.equal(first.dependency_graph.edges.length, 17);
    assert.deepEqual(first.dependency_graph.roots, ["S1.1"]);
    assert.deepEqual(first.dependency_graph.terminals, ["S4.3"]);
    assert.equal(first.metrics.dependencies.cycles, 0);
    assert.equal(first.candidate_digest, digestJson(input));
    assert.equal(canonicalizeJson(first), canonicalizeJson(second));
    assert.deepEqual(parseSmallMilestonePlan(first), first);
  }
});

test("缺失、重复、乱序、未知及 S4.4/Final Acceptance 注入均 fail closed", async () => {
  const base = candidate(await majorPlan("project-delivery-tool"));
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.milestones as unknown[]).pop(); }, "MISSING_MILESTONE"],
    [(value) => { (value.milestones as unknown[])[1] = structuredClone((value.milestones as unknown[])[0]); }, "DUPLICATE_MILESTONE"],
    [(value) => { const list = value.milestones as unknown[]; [list[0], list[1]] = [list[1], list[0]]; }, "MILESTONE_ORDER_MISMATCH"],
    [(value) => { (value.milestones as Record<string, unknown>[])[0]!.milestone_id = "S9.9"; }, "UNKNOWN_MILESTONE"],
    [(value) => { (value.milestones as Record<string, unknown>[])[17]!.milestone_id = "S4.4"; }, "UNKNOWN_MILESTONE"],
    [(value) => { (value.milestones as Record<string, unknown>[])[17]!.milestone_id = "Final Acceptance"; }, "INVALID_SMALL_MILESTONE"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateSmallMilestonePlan(changed), expectCode(code));
  }
});

test("P3 全部 18 行的归属和八个逐行语义字段任一遗漏或改写均拒绝", async () => {
  const base = candidate(await majorPlan("community-workshop"));
  const fields = ["title", "inputs", "outputs", "definition_of_done", "tests", "non_goals", "depends_on", "failure_return"] as const;
  for (let milestoneIndex = 0; milestoneIndex < SMALL_MILESTONE_DEFINITIONS.length; milestoneIndex += 1) {
    for (const field of fields) {
      const missing = structuredClone(base) as unknown as Record<string, unknown>;
      delete (missing.milestones as Record<string, unknown>[])[milestoneIndex]![field];
      assert.throws(() => evaluateSmallMilestonePlan(missing), expectCode("INVALID_SMALL_MILESTONE"));

      const changed = structuredClone(base) as unknown as Record<string, unknown>;
      const milestone = (changed.milestones as Record<string, unknown>[])[milestoneIndex]!;
      milestone[field] = field === "depends_on"
        ? (milestoneIndex === 0 ? ["S4.3"] : [])
        : "rewritten";
      assert.throws(
        () => evaluateSmallMilestonePlan(changed),
        expectCode(field === "depends_on" ? "DEPENDENCY_GRAPH_MISMATCH" : "MILESTONE_DEFINITION_MISMATCH"),
      );
    }
  }
  const wrongOwner = structuredClone(base) as unknown as Record<string, unknown>;
  (wrongOwner.milestones as Record<string, unknown>[])[8]!.major_milestone_id = "M2.1";
  assert.throws(() => evaluateSmallMilestonePlan(wrongOwner), expectCode("MILESTONE_MAJOR_MISMATCH"));
});

test("依赖缺失、额外、重复、自依赖、未知、反向、跳级、替代 DAG 与环路精确拒绝", async () => {
  const base = candidate(await majorPlan("expense-reminder"));
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.dependency_edges as unknown[]).pop(); }, "MISSING_DEPENDENCY"],
    [(value) => { (value.dependency_edges as unknown[]).push({ dependency_id: "S1.1", dependent_id: "S1.3" }); }, "DEPENDENCY_GRAPH_MISMATCH"],
    [(value) => { (value.dependency_edges as unknown[])[1] = structuredClone((value.dependency_edges as unknown[])[0]); }, "DUPLICATE_DEPENDENCY"],
    [(value) => { (value.dependency_edges as Record<string, unknown>[])[0] = { dependency_id: "S1.1", dependent_id: "S1.1" }; }, "SELF_DEPENDENCY"],
    [(value) => { (value.dependency_edges as Record<string, unknown>[])[0] = { dependency_id: "S0.9", dependent_id: "S1.2" }; }, "UNKNOWN_DEPENDENCY"],
    [(value) => { (value.dependency_edges as Record<string, unknown>[])[0] = { dependency_id: "S1.2", dependent_id: "S1.1" }; }, "DEPENDENCY_GRAPH_MISMATCH"],
    [(value) => { (value.dependency_edges as Record<string, unknown>[])[1] = { dependency_id: "S1.1", dependent_id: "S1.3" }; }, "DEPENDENCY_GRAPH_MISMATCH"],
    [(value) => { const edges = value.dependency_edges as Record<string, unknown>[]; edges[0] = { dependency_id: "S1.1", dependent_id: "S1.3" }; edges[1] = { dependency_id: "S1.3", dependent_id: "S1.2" }; }, "DEPENDENCY_GRAPH_MISMATCH"],
    [(value) => { (value.dependency_edges as unknown[]).push({ dependency_id: "S4.3", dependent_id: "S1.1" }); }, "DEPENDENCY_CYCLE"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateSmallMilestonePlan(changed), expectCode(code));
  }
});

test("权威 S2.2 parser、项目绑定、摘要与结果完整性全部 fail closed", async () => {
  const base = candidate(await majorPlan("project-delivery-tool"));
  const upstreamForged = structuredClone(base) as unknown as Record<string, unknown>;
  (upstreamForged.major_milestone_plan as Record<string, unknown>).candidate_digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => evaluateSmallMilestonePlan(upstreamForged), expectCode("UPSTREAM_MAJOR_MILESTONE_INVALID"));

  const binding = structuredClone(base) as unknown as Record<string, unknown>;
  (binding.project as Record<string, unknown>).repository_id = `sha256:${"a".repeat(64)}`;
  assert.throws(() => evaluateSmallMilestonePlan(binding), expectCode("PROJECT_BINDING_MISMATCH"));

  const formalBinding = structuredClone(base) as unknown as Record<string, unknown>;
  (formalBinding.project as Record<string, unknown>).formal_baseline = "a".repeat(40);
  assert.throws(() => evaluateSmallMilestonePlan(formalBinding), expectCode("PROJECT_BINDING_MISMATCH"));

  const summary = structuredClone(base) as unknown as Record<string, unknown>;
  (summary.summary as Record<string, unknown>).dependency_edge_count = 16;
  assert.throws(() => evaluateSmallMilestonePlan(summary), expectCode("SUMMARY_MISMATCH"));

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => evaluateSmallMilestonePlan(cyclic), expectCode("INVALID_SMALL_MILESTONE"));
  assert.throws(() => parseSmallMilestonePlan(cyclic), expectCode("RESULT_INTEGRITY_MISMATCH"));
  assert.throws(
    () => parseVersionChainResult(cyclic),
    (error) => error instanceof VersionChainError && error.reasons.some((reason) => reason.code === "RESULT_INTEGRITY_MISMATCH"),
  );
  assert.throws(
    () => evaluateVersionChain(null),
    (error) => error instanceof VersionChainError && error.reasons.some((reason) => reason.code === "INVALID_VERSION_CHAIN"),
  );

  const result = evaluateSmallMilestonePlan(base);
  const resultMutations: Array<(value: Record<string, unknown>) => void> = [
    (value) => { value.candidate_digest = `sha256:${"0".repeat(64)}`; },
    (value) => { (value.dependency_graph as Record<string, unknown>).roots = ["S1.2"]; },
    (value) => { (value.ownership_matrix as unknown[]).pop(); },
    (value) => { ((value.metrics as Record<string, unknown>).dependencies as Record<string, unknown>).cycles = 1; },
    (value) => { value.status = "REJECTED"; },
    (value) => { value.execution_packet = {}; },
  ];
  for (const mutate of resultMutations) {
    const forged = structuredClone(result) as unknown as Record<string, unknown>;
    mutate(forged);
    assert.throws(() => parseSmallMilestonePlan(forged), expectCode("RESULT_INTEGRITY_MISMATCH"));
  }
});

test("未知字段、敏感字段/内容及副作用或后续对象均 fail closed", async () => {
  const base = candidate(await majorPlan("project-delivery-tool"));
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { value.unexpected = true; }, "INVALID_SMALL_MILESTONE"],
    [(value) => { value.api_token = "secret-not-echoed"; }, "SENSITIVE_INPUT"],
    [(value) => { (value.milestones as Record<string, unknown>[])[0]!.outputs = "authorization: bearer abcdefghijklmnop"; }, "SENSITIVE_INPUT"],
    [(value) => { value.execution_packet = {}; }, "INVALID_SMALL_MILESTONE"],
    [(value) => { value.dispatch = {}; }, "INVALID_SMALL_MILESTONE"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateSmallMilestonePlan(changed), expectCode(code));
  }
  const result = evaluateSmallMilestonePlan(base);
  assert.doesNotMatch(canonicalizeJson(result), /execution_packet|development_task|dispatch|claim|fence|formal_(?:promotion|ref)|control_ref/i);
  const source = await readFile(resolve(process.cwd(), "src/domain/small-milestone.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process|net|http|https)|\.git|refs\/nextstep|git\s/i);
});
