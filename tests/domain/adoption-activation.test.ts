import assert from "node:assert/strict";
import test from "node:test";
import { digestJson } from "../../src/domain/content-digest.ts";

import {
  createAdoptionActivation,
  createAdoptionActivationReceipt,
  AdoptionActivationError,
  parseAdoptionActivation,
  parseAdoptionActivationReceipt,
} from "../../src/domain/adoption-activation.ts";

test("activation 和 receipt 均内容寻址，业务 baseline 只作为数据而非 parent", () => {
  const activation = createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "4".repeat(40),
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: `sha256:${"6".repeat(64)}`,
  });
  assert.equal(activation.control_parent_oid, activation.genesis_oid);
  assert.notEqual(activation.control_parent_oid, activation.baseline_oid);
  assert.deepEqual(parseAdoptionActivation(structuredClone(activation)), activation);
  const receipt = createAdoptionActivationReceipt(activation, "7".repeat(40));
  assert.equal(receipt.activation_oid, "7".repeat(40));
  assert.match(receipt.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(parseAdoptionActivationReceipt(structuredClone(receipt)), receipt);
});

test("activation/receipt parser 对未知类型、坏 OID、parent 和 digest fail closed", () => {
  assert.throws(() => createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "bad",
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: `sha256:${"6".repeat(64)}`,
  }), AdoptionActivationError);
  for (const value of [null, [], {}, { record_type: "adoption-activation-receipt" }]) {
    assert.throws(() => parseAdoptionActivation(value), AdoptionActivationError);
  }
  assert.throws(() => parseAdoptionActivationReceipt(null), AdoptionActivationError);
  const valid = createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "4".repeat(40),
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: `sha256:${"6".repeat(64)}`,
  });
  assert.throws(() => parseAdoptionActivation({ ...valid, activation_digest: `sha256:${"0".repeat(64)}` }), AdoptionActivationError);
  const { activation_digest: _old, ...changed } = valid;
  const wrongParentBody = { ...changed, control_parent_oid: "9".repeat(40) };
  assert.throws(() => parseAdoptionActivation({ ...wrongParentBody, activation_digest: digestJson(wrongParentBody) }), AdoptionActivationError);
  const receipt = createAdoptionActivationReceipt(valid, "7".repeat(40));
  assert.throws(() => parseAdoptionActivationReceipt({ ...receipt, receipt_digest: `sha256:${"0".repeat(64)}` }), AdoptionActivationError);
  assert.throws(() => createAdoptionActivationReceipt(valid, "bad"), AdoptionActivationError);
});
