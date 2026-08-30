import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  AdoptionCandidateError,
  createAdoptionCandidate,
  parseAdoptionCandidate,
} from "../../src/domain/adoption-candidate.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";

const fixturePath = resolve(
  process.cwd(),
  "tests/fixtures/existing-project-adoption/candidate-source.json",
);

async function source(): Promise<any> {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

test("同一 observation 生成 Schema 合法且完全确定的只读 AdoptionCandidate", async () => {
  const input = await source();
  const first = createAdoptionCandidate(input);
  const second = createAdoptionCandidate(input);

  assert.deepEqual(first, second);
  assert.equal(first.record_type, "adoption-candidate");
  assert.match(first.candidate_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.proposed_projection.phase.value, "existing-project-adoption");
  assert.equal(first.proposed_projection.phase.classification, "unknown");
  assert.equal(first.proposed_projection.stage.value, null);
  assert.deepEqual(first.unknown_gates, [
    "historical-gates-not-verified",
    "trusted-user-confirmation-required",
    "activation-not-performed",
  ]);
  assert.equal(parseAdoptionCandidate(JSON.parse(canonicalizeJson(first))).candidate_digest, first.candidate_digest);
});

test("领域拒绝证据升级、重复路径、时间反转、敏感字段与摘要篡改", async () => {
  const base = await source();
  const invalid: any[] = [
    { ...base, evidence_sources: [{ ...base.evidence_sources[0], classification: "verified" }] },
    { ...base, evidence_sources: [{ ...base.evidence_sources[0], path: base.active_plan.path }] },
    { ...base, expires_at_trusted: base.created_at_trusted },
    { ...base, api_token: "token=should-never-be-accepted" },
    { ...base, active_plan: { ...base.active_plan, path: "README.md" } },
    { ...base, evidence_sources: [{ ...base.evidence_sources[0], path: "docs/evidence.md" }] },
  ];
  for (const value of invalid) {
    assert.throws(() => createAdoptionCandidate(value), AdoptionCandidateError);
  }

  const candidate: any = JSON.parse(canonicalizeJson(createAdoptionCandidate(base)));
  candidate.unknown_gates = [];
  assert.throws(() => parseAdoptionCandidate(candidate), AdoptionCandidateError);
});

test("候选只保留相对 blob 身份、未知证据与非目标，不携带正文、写命令或用户确认", async () => {
  const candidate = createAdoptionCandidate(await source());
  const text = canonicalizeJson(candidate);
  assert.doesNotMatch(text, /\/Volumes\/|\/Users\/|update-ref|--commit|user_action|confirmation_envelope/);
  assert.equal(candidate.evidence_sources[0]?.classification, "unknown");
  assert.ok(candidate.declared_non_goals.includes("no-ref-write"));
  assert.ok(candidate.declared_non_goals.includes("no-historical-gate-claim"));
});
