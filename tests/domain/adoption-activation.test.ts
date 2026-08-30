import assert from "node:assert/strict";
import test from "node:test";
import { digestJson } from "../../src/domain/content-digest.ts";

import {
  createAdoptionActivation,
  createAdoptionActivationReceipt,
  createAdoptionRollbackReceipt,
  AdoptionActivationError,
  parseAdoptionActivation,
  parseAdoptionActivationReceipt,
  parseAdoptionRollbackReceipt,
} from "../../src/domain/adoption-activation.ts";

test("activation 和 receipt 均内容寻址，业务 baseline 只作为数据而非 parent", () => {
  const activation = createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "4".repeat(40),
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: digestJson([]),
  });
  assert.equal(activation.control_parent_oid, activation.genesis_oid);
  assert.notEqual(activation.control_parent_oid, activation.baseline_oid);
  assert.deepEqual(parseAdoptionActivation(structuredClone(activation)), activation);
  const receipt = createAdoptionActivationReceipt(activation, "7".repeat(40));
  assert.equal(receipt.activation_oid, "7".repeat(40));
  assert.match(receipt.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(receipt.activated_namespace_digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(parseAdoptionActivationReceipt(structuredClone(receipt)), receipt);
  const rollback = createAdoptionRollbackReceipt({
    activation_receipt: receipt,
    rollback_action_digest: `sha256:${"8".repeat(64)}`,
    rolled_back_at_trusted: "2026-08-30T09:05:00.000Z",
  });
  assert.deepEqual(parseAdoptionRollbackReceipt(structuredClone(rollback)), rollback);
});

test("activation/receipt parser 对未知类型、坏 OID、parent 和 digest fail closed", () => {
  assert.throws(() => createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "bad",
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: digestJson([]),
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
    expected_namespace_digest: digestJson([]),
  });
  assert.throws(() => parseAdoptionActivation({ ...valid, activation_digest: `sha256:${"0".repeat(64)}` }), AdoptionActivationError);
  const { activation_digest: _old, ...changed } = valid;
  const wrongParentBody = { ...changed, control_parent_oid: "9".repeat(40) };
  assert.throws(() => parseAdoptionActivation({ ...wrongParentBody, activation_digest: digestJson(wrongParentBody) }), AdoptionActivationError);
  const receipt = createAdoptionActivationReceipt(valid, "7".repeat(40));
  assert.throws(() => parseAdoptionActivationReceipt({ ...receipt, receipt_digest: `sha256:${"0".repeat(64)}` }), AdoptionActivationError);
  const { receipt_digest: _receiptDigest, ...receiptBody } = receipt;
  const changedReceipt = { ...receiptBody, activated_namespace_digest: `sha256:${"0".repeat(64)}` };
  assert.throws(() => parseAdoptionActivationReceipt({ ...changedReceipt, receipt_digest: digestJson(changedReceipt) }), AdoptionActivationError);
  assert.throws(() => createAdoptionActivationReceipt(valid, "bad"), AdoptionActivationError);
  assert.throws(() => parseAdoptionRollbackReceipt(null), AdoptionActivationError);
  for (const parse of [parseAdoptionActivation, parseAdoptionActivationReceipt, parseAdoptionRollbackReceipt]) {
    assert.throws(() => parse(Object.defineProperty({}, "value", {
      enumerable: true, get() { throw new Error("getter"); },
    })), AdoptionActivationError);
  }
  assert.throws(() => parseAdoptionRollbackReceipt({
    ...createAdoptionRollbackReceipt({
      activation_receipt: receipt,
      rollback_action_digest: `sha256:${"8".repeat(64)}`,
      rolled_back_at_trusted: "2026-08-30T09:05:00.000Z",
    }),
    receipt_digest: `sha256:${"0".repeat(64)}`,
  }), AdoptionActivationError);
});

test("parser 独立重算 activation 与 receipt 的全部派生身份", () => {
  const activation = createAdoptionActivation({
    repository_identity: `sha256:${"1".repeat(64)}`,
    candidate_digest: `sha256:${"2".repeat(64)}`,
    confirmation_envelope_digest: `sha256:${"3".repeat(64)}`,
    baseline_oid: "4".repeat(40),
    genesis_oid: "5".repeat(40),
    activated_at_trusted: "2026-08-30T09:04:00.000Z",
    expected_namespace_digest: digestJson([]),
  });
  assert.throws(() => createAdoptionActivation({
    repository_identity: activation.repository_identity,
    candidate_digest: activation.candidate_digest,
    confirmation_envelope_digest: activation.confirmation_envelope_digest,
    baseline_oid: activation.baseline_oid,
    genesis_oid: activation.genesis_oid,
    activated_at_trusted: activation.activated_at_trusted,
    expected_namespace_digest: `sha256:${"f".repeat(64)}`,
  }), AdoptionActivationError);
  const forgedActivations = [
    { ...activation, effect_identity: `sha256:${"8".repeat(64)}` },
    { ...activation, activation_receipt_identity: `sha256:${"9".repeat(64)}` },
    { ...activation, rollback_guard: { ...activation.rollback_guard, expected_namespace_digest: `sha256:${"a".repeat(64)}` } },
  ].map((value) => {
    const { activation_digest: _ignored, ...body } = value;
    return { ...body, activation_digest: digestJson(body) };
  });
  for (const forged of forgedActivations) {
    assert.throws(() => parseAdoptionActivation(forged), AdoptionActivationError);
  }

  const receipt = createAdoptionActivationReceipt(activation, "7".repeat(40));
  const { receipt_digest: _ignored, ...receiptBody } = receipt;
  const forgedBody = { ...receiptBody, effect_identity: `sha256:${"b".repeat(64)}` };
  assert.throws(() => parseAdoptionActivationReceipt({
    ...forgedBody,
    receipt_digest: digestJson(forgedBody),
  }), AdoptionActivationError);
});
