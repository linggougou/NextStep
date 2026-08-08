import assert from "node:assert/strict";
import test from "node:test";

import {
  MACHINE_RECEIPT_SCHEMA,
  parseMachineReceipt,
} from "../../src/domain/machine-receipt.ts";

const successfulReceipt = {
  schema_version: "1.0",
  receipt_id: "receipt-001",
  ok: true,
  code: "CONTRACT_PROBE_SUCCEEDED",
  data: {
    canonical_json: '{"status":"accepted"}',
    digest: `sha256:${"a".repeat(64)}`,
    dry_run: true,
    schema_version: "1.0",
  },
};

test("machine receipt is accepted through the executable schema", () => {
  assert.deepEqual(MACHINE_RECEIPT_SCHEMA.parse(successfulReceipt), successfulReceipt);
  assert.deepEqual(parseMachineReceipt(successfulReceipt), successfulReceipt);
});

test("machine receipt schema rejects unknown codes and ok/code mismatches", () => {
  for (const receipt of [
    { ...successfulReceipt, code: "UNRECOGNIZED_RECEIPT_CODE" },
    { ...successfulReceipt, ok: true, code: "INVALID_JSON" },
    { ...successfulReceipt, ok: false, code: "CONTRACT_PROBE_SUCCEEDED" },
  ]) {
    assert.throws(
      () => MACHINE_RECEIPT_SCHEMA.parse(receipt),
      /code|receipt|schema|invalid/i,
    );
  }
});

test("machine receipt schema fails closed when data contains sensitive fields", () => {
  assert.throws(
    () =>
      MACHINE_RECEIPT_SCHEMA.parse({
        ...successfulReceipt,
        data: { authorization: "Bearer value-that-must-not-be-persisted" },
      }),
    /sensitive|secret|token|authorization/i,
  );
});

test("machine receipt schema rejects incomplete or mismatched data shapes", () => {
  for (const receipt of [
    { ...successfulReceipt, data: {} },
    {
      ...successfulReceipt,
      data: { ...successfulReceipt.data, digest: "sha256:abc" },
    },
    {
      ...successfulReceipt,
      data: { ...successfulReceipt.data, dry_run: "true" },
    },
    {
      ...successfulReceipt,
      data: { ...successfulReceipt.data, unexpected: true },
    },
    {
      schema_version: "1.0",
      receipt_id: "receipt-failure",
      ok: false,
      code: "CONTRACT_PROBE_REJECTED",
      data: {},
    },
    {
      schema_version: "1.0",
      receipt_id: "receipt-failure",
      ok: false,
      code: "CONTRACT_PROBE_REJECTED",
      data: { dry_run: false, unexpected: true },
    },
  ]) {
    assert.throws(
      () => parseMachineReceipt(receipt),
      /data|digest|dry.run|schema|receipt|invalid/i,
    );
  }
});

test("parseMachineReceipt deeply freezes the validated receipt", () => {
  const receipt = parseMachineReceipt(successfulReceipt);

  assert.ok(Object.isFrozen(receipt));
  assert.ok(Object.isFrozen(receipt.data));
});
