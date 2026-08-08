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
    nested: { status: "accepted" },
    outputs: [{ digest: "sha256:abc" }],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

test("parseMachineReceipt deeply freezes the validated receipt", () => {
  const receipt = parseMachineReceipt(successfulReceipt);
  const nested = receipt.data.nested;
  const outputs = receipt.data.outputs;

  assert.ok(Object.isFrozen(receipt));
  assert.ok(Object.isFrozen(receipt.data));
  assert.ok(isRecord(nested));
  assert.ok(Array.isArray(outputs));
  assert.ok(isRecord(outputs[0]));
  assert.ok(Object.isFrozen(nested));
  assert.ok(Object.isFrozen(outputs));
  assert.ok(Object.isFrozen(outputs[0]));
});
