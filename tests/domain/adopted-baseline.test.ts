import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { createAdoptionCandidate } from "../../src/domain/adoption-candidate.ts";
import {
  AdoptionTrustError,
  createAdoptedBaseline,
  parseAdoptionConfirmation,
  parseAdoptedBaseline,
  assertTrustedAdoptionConfirmation,
  verifyAdoptionConfirmation,
} from "../../src/domain/adopted-baseline.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";

const sourcePath = resolve(process.cwd(), "tests/fixtures/existing-project-adoption/candidate-source.json");

async function candidate() {
  return createAdoptionCandidate(JSON.parse(await readFile(sourcePath, "utf8")));
}

test("可信宿主确认绑定 candidate/display/session/clock 并生成可重放 envelope", async () => {
  const value = await candidate();
  const input = {
    candidate_digest: value.candidate_digest,
    displayed_view_digest: `sha256:${"b".repeat(64)}` as const,
    user_action_ref: "host-action-001",
    session_identity: `sha256:${"c".repeat(64)}` as const,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:02:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "nonce-001",
    decision: "confirm" as const,
  };
  const verifier = { verifier_kind: "trusted-host" as const, verify: () => true };
  const first = verifyAdoptionConfirmation(value, input, verifier, () => new Date("2026-08-30T09:03:00.000Z"));
  const second = verifyAdoptionConfirmation(value, input, verifier, () => new Date("2026-08-30T09:03:00.000Z"));
  assert.deepEqual(first, second);
  assert.equal(first.record_type, "adoption-confirmation-envelope");
  assert.match(first.envelope_digest, /^sha256:[a-f0-9]{64}$/);
});

test("确认与 baseline parser 对 schema、digest、信任来源和 candidate 绑定逐项 fail closed", async () => {
  const value = await candidate();
  const verifier = { verifier_kind: "trusted-host" as const, verify: () => true };
  const input = {
    candidate_digest: value.candidate_digest,
    displayed_view_digest: `sha256:${"a".repeat(64)}` as const,
    user_action_ref: "host-action-parser",
    session_identity: `sha256:${"b".repeat(64)}` as const,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:02:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "nonce-parser",
    decision: "confirm" as const,
  };
  const envelope = verifyAdoptionConfirmation(value, input, verifier, () => new Date("2026-08-30T09:03:00.000Z"));
  assert.deepEqual(parseAdoptionConfirmation(structuredClone(envelope)), envelope);
  assert.throws(() => assertTrustedAdoptionConfirmation(structuredClone(envelope)), AdoptionTrustError);
  for (const invalid of [null, [], { ...envelope, envelope_digest: `sha256:${"0".repeat(64)}` }, { ...envelope, extra: true }]) {
    assert.throws(() => parseAdoptionConfirmation(invalid), AdoptionTrustError);
  }
  const baseline = createAdoptedBaseline(value, envelope, { stage: "S5", milestone: "M1", scope: "baseline" });
  for (const invalid of [null, [], { ...baseline, record_digest: `sha256:${"0".repeat(64)}` }, { ...baseline, lifecycle_state: "invented" }]) {
    assert.throws(() => parseAdoptedBaseline(invalid), AdoptionTrustError);
  }
  assert.throws(() => verifyAdoptionConfirmation(value, { ...input, decision: "reject" as never }, verifier, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, { ...input, candidate_digest: `sha256:${"0".repeat(64)}` }, verifier, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, input, verifier, () => new Date("2026-08-30T09:01:00.000Z")), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, { ...input, expires_at_trusted: "2026-08-30T09:16:00.000Z" }, verifier, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, input, verifier, () => new Date(Number.NaN)), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, input, { verifier_kind: "trusted-host", verify: () => false }, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
  assert.throws(() => verifyAdoptionConfirmation(value, { ...input, user_action_ref: "bad value with spaces" }, verifier, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
  const { envelope_digest: _digest, ...otherUnsigned } = envelope;
  const otherUnsignedRecord = { ...otherUnsigned, candidate_digest: `sha256:${"0".repeat(64)}` };
  const otherEnvelope = { ...otherUnsignedRecord, envelope_digest: digestJson(otherUnsignedRecord) };
  assert.throws(() => createAdoptedBaseline(value, otherEnvelope as never, { stage: "S5", milestone: "M1", scope: "baseline" }), AdoptionTrustError);
});

test("缺失/抛错 verifier、过期、candidate 漂移与 replay key 异载荷 fail closed", async () => {
  const value = await candidate();
  const base = {
    candidate_digest: value.candidate_digest,
    displayed_view_digest: `sha256:${"b".repeat(64)}` as const,
    user_action_ref: "host-action-002",
    session_identity: `sha256:${"c".repeat(64)}` as const,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:02:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "nonce-002",
    decision: "confirm" as const,
  };
  for (const verifier of [undefined, { verifier_kind: "trusted-host" as const }, {
    verifier_kind: "trusted-host" as const,
    verify() { throw new Error("untrusted detail"); },
  }]) {
    assert.throws(
      () => verifyAdoptionConfirmation(value, base, verifier as never, () => new Date("2026-08-30T09:03:00.000Z")),
      AdoptionTrustError,
    );
  }
  assert.throws(() => verifyAdoptionConfirmation(value, base, {
    verifier_kind: "trusted-host", verify: () => true,
  }, () => new Date("2026-08-30T09:11:00.000Z")), AdoptionTrustError);

  const verifier = { verifier_kind: "trusted-host" as const, verify: () => true };
  verifyAdoptionConfirmation(value, { ...base, nonce_or_replay_key: "nonce-reused" }, verifier, () => new Date("2026-08-30T09:03:00.000Z"));
  assert.throws(() => verifyAdoptionConfirmation(value, {
    ...base, nonce_or_replay_key: "nonce-reused", user_action_ref: "different-action",
  }, verifier, () => new Date("2026-08-30T09:03:00.000Z")), AdoptionTrustError);
});

test("adopted baseline 与历史 version signoff 分离并固定免责声明", async () => {
  const value = await candidate();
  const verifier = { verifier_kind: "trusted-host" as const, verify: () => true };
  const envelope = verifyAdoptionConfirmation(value, {
    candidate_digest: value.candidate_digest,
    displayed_view_digest: `sha256:${"d".repeat(64)}`,
    user_action_ref: "host-action-003",
    session_identity: `sha256:${"e".repeat(64)}`,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:02:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "nonce-003",
    decision: "confirm",
  }, verifier, () => new Date("2026-08-30T09:03:00.000Z"));
  const baseline = createAdoptedBaseline(value, envelope, {
    stage: "S5", milestone: "M1", scope: "existing-project-baseline",
  });
  assert.equal(baseline.baseline_oid, value.candidate_head_oid);
  assert.equal(baseline.disclaimer, "adopted baseline; historical gates not verified by NextStep");
  assert.equal(baseline.lifecycle_state, "rollback-eligible");
  assert.doesNotMatch(canonicalizeJson(baseline), /version_signoffs|formally-completed/);
  assert.deepEqual(parseAdoptedBaseline(JSON.parse(canonicalizeJson(baseline))), baseline);
});
