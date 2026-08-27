import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { evaluateAcceptanceProfile, type AcceptanceProfileDecision } from "../../src/domain/acceptance-profile.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  MAJOR_MILESTONE_DEFINITIONS,
  MajorMilestoneError,
  evaluateMajorMilestonePlan,
  parseMajorMilestonePlan,
  type MajorMilestoneAcceptance,
  type MajorMilestoneCandidate,
} from "../../src/domain/major-milestone.ts";
import { evaluateVersionChain, type VersionChainResult } from "../../src/domain/version-chain.ts";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures");
const positiveFixtures = ["project-delivery-tool", "community-workshop", "expense-reminder"] as const;

interface FixtureReference {
  readonly version_chain_fixture: string;
  readonly acceptance_profile_fixture: string;
  readonly deliverable_prefix: string;
}

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(fixtureRoot, path), "utf8")) as Record<string, unknown>;
}

async function loadUpstreams(name: string, ui = false): Promise<{
  readonly versionChain: VersionChainResult;
  readonly profile: AcceptanceProfileDecision;
  readonly prefix: string;
}> {
  const reference = await json(`major-milestone/${name}.json`) as unknown as FixtureReference;
  const versionChain = evaluateVersionChain(await json(`version-chain/${reference.version_chain_fixture}`));
  const profileWrapper = await json(`acceptance-profile/${ui ? "ui-with-evidence.json" : reference.acceptance_profile_fixture}`);
  const profile = evaluateAcceptanceProfile(profileWrapper.candidate);
  return { versionChain, profile, prefix: reference.deliverable_prefix };
}

function acceptanceEntries(profile: AcceptanceProfileDecision): MajorMilestoneAcceptance[] {
  const core: MajorMilestoneAcceptance[] = profile.enabled_acceptances
    .filter((type): type is "integration" | "interaction" | "product" => type !== "ui_restoration")
    .map((acceptance_type) => ({ acceptance_type, applicability: "all-routes" }));
  if (profile.route.kind === "ui" && profile.ui_requirements.status === "required") {
    core.push({
      acceptance_type: "ui_restoration",
      applicability: "ui-only",
      ui_design_source: profile.ui_requirements.ui_design_source,
      ui_restoration_evidence: profile.ui_requirements.ui_restoration_evidence,
    });
  }
  return core;
}

function candidate(
  versionChain: VersionChainResult,
  profile: AcceptanceProfileDecision,
  prefix: string,
): MajorMilestoneCandidate {
  const milestones = MAJOR_MILESTONE_DEFINITIONS.map((definition) => ({
    ...definition,
    pc_ids: [...definition.pc_ids],
    deliverables: [{ deliverable_id: `${prefix}-${definition.milestone_id.toLowerCase().replace(".", "-")}`, description: `${definition.title} output` }],
    acceptances: acceptanceEntries(profile),
  }));
  return {
    schema_version: "1.0",
    record_type: "major-milestone-candidate",
    project: structuredClone(versionChain.project),
    version_chain: versionChain,
    acceptance_profile: profile,
    milestones,
    summary: {
      milestone_count: 9,
      scope_pc_count: 20,
      duplicate_scope_pc_count: 0,
      deliverable_count: 9,
    },
  };
}

function expectCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof MajorMilestoneError);
    assert.ok(error.reasons.some((reason) => reason.code === code), JSON.stringify(error.reasons));
    const keys = error.reasons.map((reason) => `${reason.code}\u0000${reason.path}\u0000${reason.message}`);
    assert.deepEqual(keys, [...keys].sort());
    return true;
  };
}

test("三类目标项目生成固定 9/9 大里程碑与 20/20 互斥范围矩阵", async () => {
  assert.equal(MAJOR_MILESTONE_DEFINITIONS.length, 9);
  for (const name of positiveFixtures) {
    const upstream = await loadUpstreams(name);
    const input = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
    const result = evaluateMajorMilestonePlan(input);
    assert.equal(result.status, "ACCEPTED");
    assert.deepEqual(result.milestones.map(({ milestone_id }) => milestone_id), MAJOR_MILESTONE_DEFINITIONS.map(({ milestone_id }) => milestone_id));
    assert.equal(result.scope_matrix.length, 20);
    assert.equal(new Set(result.scope_matrix.map(({ pc_id }) => pc_id)).size, 20);
    assert.equal(canonicalizeJson(result.metrics), canonicalizeJson({
      milestones: { actual: 9, required: 9 },
      scope_pc: { assigned: 20, required: 20, duplicates: 0, missing: 0 },
      deliverables: { total: 9, unique: 9 },
      acceptances_per_milestone: 3,
    }));
    assert.equal(result.candidate_digest, digestJson(input));
    assert.deepEqual(parseMajorMilestonePlan(result), result);
  }
});

test("headless 精确 I/X/P；UI 仅追加精确绑定的 ui_restoration", async () => {
  const headless = await loadUpstreams("project-delivery-tool");
  const headlessResult = evaluateMajorMilestonePlan(candidate(headless.versionChain, headless.profile, headless.prefix));
  for (const milestone of headlessResult.milestones) {
    assert.deepEqual(milestone.acceptances.map(({ acceptance_type }) => acceptance_type), ["integration", "interaction", "product"]);
  }

  const ui = await loadUpstreams("project-delivery-tool", true);
  const uiInput = candidate(ui.versionChain, ui.profile, ui.prefix);
  const uiResult = evaluateMajorMilestonePlan(uiInput);
  for (const milestone of uiResult.milestones) {
    assert.deepEqual(milestone.acceptances.map(({ acceptance_type }) => acceptance_type), ["integration", "interaction", "product", "ui_restoration"]);
    const restoration = milestone.acceptances[3] as Record<string, unknown>;
    assert.equal(canonicalizeJson(restoration.ui_design_source), canonicalizeJson(ui.profile.ui_requirements.status === "required" ? ui.profile.ui_requirements.ui_design_source : null));
    assert.equal(canonicalizeJson(restoration.ui_restoration_evidence), canonicalizeJson(ui.profile.ui_requirements.status === "required" ? ui.profile.ui_requirements.ui_restoration_evidence : null));
  }

  for (const mutate of [
    (value: Record<string, unknown>) => ((value.milestones as Record<string, unknown>[])[0]!.acceptances as unknown[]).reverse(),
    (value: Record<string, unknown>) => ((value.milestones as Record<string, unknown>[])[0]!.acceptances as Record<string, unknown>[])[3]!.ui_design_source = { pointer: "/forged", value_digest: `sha256:${"f".repeat(64)}` },
    (value: Record<string, unknown>) => ((value.milestones as Record<string, unknown>[])[0]!.acceptances as unknown[]).pop(),
  ]) {
    const changed = structuredClone(uiInput) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateMajorMilestonePlan(changed), expectCode("PROFILE_CONFLICT"));
  }
});

test("里程碑缺失、重复、乱序、未知、Final Acceptance 与 M4.3 注入均 fail closed", async () => {
  const upstream = await loadUpstreams("project-delivery-tool");
  const base = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const mutations: Array<(value: Record<string, unknown>) => void> = [
    (value) => { (value.milestones as unknown[]).pop(); },
    (value) => { (value.milestones as unknown[])[1] = structuredClone((value.milestones as unknown[])[0]); },
    (value) => { const list = value.milestones as unknown[]; [list[0], list[1]] = [list[1], list[0]]; },
    (value) => { ((value.milestones as Record<string, unknown>[])[0]!).milestone_id = "M0.0"; },
    (value) => { ((value.milestones as Record<string, unknown>[])[0]!).milestone_id = "Final Acceptance"; },
    (value) => { ((value.milestones as Record<string, unknown>[])[8]!).milestone_id = "M4.3"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateMajorMilestonePlan(changed), (error: unknown) => error instanceof MajorMilestoneError);
  }
});

test("范围交叉、遗漏、未知、错误里程碑及 S2.1 主版本分歧均拒绝", async () => {
  const upstream = await loadUpstreams("project-delivery-tool");
  const base = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { ((value.milestones as Record<string, unknown>[])[1]!.pc_ids as string[]).push("PC-01"); }, "DUPLICATE_SCOPE_PC"],
    [(value) => { ((value.milestones as Record<string, unknown>[])[0]!.pc_ids as string[]).shift(); }, "MISSING_SCOPE_PC"],
    [(value) => { ((value.milestones as Record<string, unknown>[])[0]!.pc_ids as string[])[0] = "PC-99"; }, "UNKNOWN_PC"],
    [(value) => { const list = value.milestones as Record<string, unknown>[]; (list[0]!.pc_ids as string[])[0] = "PC-04"; (list[1]!.pc_ids as string[])[0] = "PC-01"; }, "PC_MILESTONE_MISMATCH"],
    [(value) => { (value.milestones as Record<string, unknown>[])[2]!.version_id = "V3"; }, "MILESTONE_VERSION_MISMATCH"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateMajorMilestonePlan(changed), expectCode(code));
  }
});

test("交付物 ID 全局唯一，全部里程碑/验收必填字段遗漏均 fail closed", async () => {
  const upstream = await loadUpstreams("community-workshop");
  const base = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const duplicate = structuredClone(base) as unknown as Record<string, unknown>;
  const list = duplicate.milestones as Record<string, unknown>[];
  (list[1]!.deliverables as Record<string, unknown>[])[0]!.deliverable_id = (list[0]!.deliverables as Record<string, unknown>[])[0]!.deliverable_id;
  assert.throws(() => evaluateMajorMilestonePlan(duplicate), expectCode("DUPLICATE_DELIVERABLE"));

  for (const field of ["milestone_id", "version_id", "title", "objective", "pc_ids", "deliverables", "acceptances"]) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    delete (changed.milestones as Record<string, unknown>[])[0]![field];
    assert.throws(() => evaluateMajorMilestonePlan(changed), (error: unknown) => error instanceof MajorMilestoneError);
  }
  for (const field of ["acceptance_type", "applicability"]) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    delete ((changed.milestones as Record<string, unknown>[])[0]!.acceptances as Record<string, unknown>[])[0]![field];
    assert.throws(() => evaluateMajorMilestonePlan(changed), (error: unknown) => error instanceof MajorMilestoneError);
  }
  const ui = await loadUpstreams("project-delivery-tool", true);
  const uiBase = candidate(ui.versionChain, ui.profile, ui.prefix);
  for (const field of ["acceptance_type", "applicability", "ui_design_source", "ui_restoration_evidence"]) {
    const changed = structuredClone(uiBase) as unknown as Record<string, unknown>;
    delete ((changed.milestones as Record<string, unknown>[])[0]!.acceptances as Record<string, unknown>[])[3]![field];
    assert.throws(() => evaluateMajorMilestonePlan(changed), (error: unknown) => error instanceof MajorMilestoneError);
  }
});

test("摘要、版本、未知字段、敏感字段与敏感内容 fail closed", async () => {
  const upstream = await loadUpstreams("project-delivery-tool");
  const base = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.summary as Record<string, unknown>).milestone_count = 8; }, "SUMMARY_MISMATCH"],
    [(value) => { value.schema_version = "2.0"; }, "INVALID_MAJOR_MILESTONE"],
    [(value) => { value.execution_packet = {}; }, "INVALID_MAJOR_MILESTONE"],
    [(value) => { value.api_token = "secret-not-echoed"; }, "SENSITIVE_INPUT"],
    [(value) => { ((value.milestones as Record<string, unknown>[])[0]!.deliverables as Record<string, unknown>[])[0]!.description = "authorization: bearer abcdefghijklmnop"; }, "SENSITIVE_INPUT"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateMajorMilestonePlan(changed), expectCode(code));
  }
});

test("权威上游 parser、项目绑定与输出完整性均 fail closed", async () => {
  const upstream = await loadUpstreams("expense-reminder");
  const base = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const cases: Array<[(value: Record<string, unknown>) => void, string]> = [
    [(value) => { (value.version_chain as Record<string, unknown>).candidate_digest = `sha256:${"f".repeat(64)}`; }, "UPSTREAM_VERSION_CHAIN_INVALID"],
    [(value) => { (value.acceptance_profile as Record<string, unknown>).status = "rejected"; }, "UPSTREAM_PROFILE_INVALID"],
    [(value) => { (value.project as Record<string, unknown>).repository_id = `sha256:${"a".repeat(64)}`; }, "PROJECT_BINDING_MISMATCH"],
  ];
  for (const [mutate, code] of cases) {
    const changed = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(changed);
    assert.throws(() => evaluateMajorMilestonePlan(changed), expectCode(code));
  }

  const rejectedWrapper = await json("acceptance-profile/conflict-headless-requires-ui.json");
  const rejectedProfile = evaluateAcceptanceProfile(rejectedWrapper.candidate);
  assert.equal(rejectedProfile.status, "rejected");
  const rejectedCandidate = structuredClone(base) as unknown as Record<string, unknown>;
  rejectedCandidate.acceptance_profile = rejectedProfile as unknown as Record<string, unknown>;
  assert.throws(() => evaluateMajorMilestonePlan(rejectedCandidate), expectCode("PROFILE_CONFLICT"));

  const result = evaluateMajorMilestonePlan(base);
  for (const mutate of [
    (value: Record<string, unknown>) => { value.candidate_digest = `sha256:${"0".repeat(64)}`; },
    (value: Record<string, unknown>) => { (value.scope_matrix as unknown[]).pop(); },
    (value: Record<string, unknown>) => { ((value.milestones as Record<string, unknown>[])[0]!.acceptances as unknown[]).pop(); },
    (value: Record<string, unknown>) => { value.status = "REJECTED"; },
  ]) {
    const forged = structuredClone(result) as unknown as Record<string, unknown>;
    mutate(forged);
    assert.throws(() => parseMajorMilestonePlan(forged), expectCode("RESULT_INTEGRITY_MISMATCH"));
  }
});

test("同一 JCS 输入确定性相同，且 S2.2 无 S2.3+ 或副作用输出", async () => {
  const upstream = await loadUpstreams("project-delivery-tool");
  const input = candidate(upstream.versionChain, upstream.profile, upstream.prefix);
  const first = evaluateMajorMilestonePlan(input);
  const second = evaluateMajorMilestonePlan(JSON.parse(canonicalizeJson(input)) as unknown);
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.doesNotMatch(canonicalizeJson(first), /small_milestone|dependency_graph|execution_packet|development_task|dispatch|formal_(?:promotion|ref)|control_ref/i);
  const source = await readFile(resolve(process.cwd(), "src/domain/major-milestone.ts"), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process)|\.git|refs\/nextstep|git\s/i);
});
