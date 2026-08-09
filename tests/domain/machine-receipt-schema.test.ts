import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  MACHINE_RECEIPT_SCHEMA,
  parseMachineReceipt,
} from "../../src/domain/machine-receipt.ts";
import { parseRequirementIntake } from "../../src/domain/requirement-intake.ts";

const successfulSubject = { status: "accepted" };

const successfulReceipt = {
  schema_version: "1.0",
  receipt_id: "receipt-001",
  ok: true,
  code: "CONTRACT_PROBE_SUCCEEDED",
  data: {
    canonical_json: canonicalizeJson(successfulSubject),
    digest: digestJson(successfulSubject),
    dry_run: true,
    schema_version: "1.0",
  },
};

test("machine receipt is accepted through the executable schema", () => {
  for (const receipt of [
    MACHINE_RECEIPT_SCHEMA.parse(successfulReceipt),
    parseMachineReceipt(successfulReceipt),
  ]) {
    assert.deepEqual({ ...receipt, data: { ...receipt.data } }, successfulReceipt);
  }
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

test("successful machine receipts verify canonical payload semantics", () => {
  const sensitiveSubject = { access_token: "must-not-pass" };
  const toJsonSubject = { z: 1, toJSON: "metadata", a: 2 };

  for (const data of [
    {
      ...successfulReceipt.data,
      digest: `sha256:${"f".repeat(64)}`,
    },
    {
      ...successfulReceipt.data,
      canonical_json: "{broken",
    },
    {
      ...successfulReceipt.data,
      canonical_json: '{"z":1,"a":2}',
      digest: digestJson({ z: 1, a: 2 }),
    },
    {
      ...successfulReceipt.data,
      canonical_json: canonicalizeJson(sensitiveSubject),
      digest: digestJson(sensitiveSubject),
    },
    {
      ...successfulReceipt.data,
      canonical_json: '{"z":1,"toJSON":"metadata","a":2}',
      digest: digestJson(toJsonSubject),
    },
  ]) {
    assert.throws(
      () => parseMachineReceipt({ ...successfulReceipt, data }),
      /canonical|digest|mismatch|sensitive|token|json/i,
    );
  }
});

test("parseMachineReceipt deeply freezes the validated receipt", () => {
  const receipt = parseMachineReceipt(successfulReceipt);

  assert.ok(Object.isFrozen(receipt));
  assert.ok(Object.isFrozen(receipt.data));
});

test("parseMachineReceipt rejects accessor-backed receipts", () => {
  const receipt = Object.create(Object.prototype, {
    schema_version: { enumerable: true, value: "1.0" },
    receipt_id: { enumerable: true, value: "receipt-accessor" },
    ok: { enumerable: true, value: true },
    code: { enumerable: true, value: "CONTRACT_PROBE_SUCCEEDED" },
    data: {
      enumerable: true,
      get: () => successfulReceipt.data,
    },
  });

  assert.throws(
    () => parseMachineReceipt(receipt),
    /accessor|data propert|plain json/i,
  );
});

test("parseMachineReceipt validates and returns one frozen Proxy descriptor snapshot", () => {
  const receipt = new Proxy(successfulReceipt, {
    get: (target, property, receiver) =>
      property === "receipt_id"
        ? "receipt-consumer-view"
        : Reflect.get(target, property, receiver),
    getOwnPropertyDescriptor: (target, property) =>
      property === "receipt_id"
        ? {
            configurable: true,
            enumerable: true,
            value: "receipt-descriptor-view",
            writable: true,
          }
        : Reflect.getOwnPropertyDescriptor(target, property),
  });

  const parsed = parseMachineReceipt(receipt);

  assert.equal(parsed.receipt_id, "receipt-descriptor-view");
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.data));
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.getPrototypeOf(parsed.data), null);
});

test("parseMachineReceipt requires every root field to be an own property", () => {
  Object.defineProperties(Object.prototype, {
    schema_version: {
      configurable: true,
      value: successfulReceipt.schema_version,
      writable: true,
    },
    receipt_id: {
      configurable: true,
      value: successfulReceipt.receipt_id,
      writable: true,
    },
    ok: { configurable: true, value: successfulReceipt.ok, writable: true },
    code: { configurable: true, value: successfulReceipt.code, writable: true },
    data: { configurable: true, value: successfulReceipt.data, writable: true },
  });

  try {
    assert.throws(() => parseMachineReceipt({}), /receipt|schema|required|invalid/i);
  } finally {
    for (const field of ["schema_version", "receipt_id", "ok", "code", "data"]) {
      Reflect.deleteProperty(Object.prototype, field);
    }
  }
});

test("parseMachineReceipt requires every successful data field to be an own property", () => {
  Object.defineProperties(Object.prototype, {
    canonical_json: {
      configurable: true,
      value: successfulReceipt.data.canonical_json,
      writable: true,
    },
    digest: {
      configurable: true,
      value: successfulReceipt.data.digest,
      writable: true,
    },
    dry_run: {
      configurable: true,
      value: successfulReceipt.data.dry_run,
      writable: true,
    },
    schema_version: {
      configurable: true,
      value: successfulReceipt.data.schema_version,
      writable: true,
    },
  });

  try {
    assert.throws(
      () => parseMachineReceipt({ ...successfulReceipt, data: {} }),
      /receipt|schema|required|data|invalid/i,
    );
  } finally {
    for (const field of ["canonical_json", "digest", "dry_run", "schema_version"]) {
      Reflect.deleteProperty(Object.prototype, field);
    }
  }
});

test("machine receipt accepts a canonical requirement-intake result without a development task", () => {
  const intake = parseRequirementIntake({
    schema_version: "1.0",
    candidate: {
      raw_expression: "我想做一个本地读书提醒工具。",
      intent_summary: { status: "identified", value: "提醒读者完成阅读计划" },
      goals: { status: "identified", items: ["减少遗忘阅读计划"] },
      scenarios: { status: "identified", items: ["读者查看今日阅读提醒"] },
      constraints: { status: "identified", items: ["仅保存本地数据"] },
      expected_outputs: { status: "identified", items: ["每日阅读提醒"] },
      non_goal_gaps: { status: "identified", items: ["不提供书店交易"] },
      clarification_gaps: { status: "identified", items: ["提醒时间"] },
    },
  });
  const receipt = parseMachineReceipt({
    schema_version: "1.0",
    receipt_id: "receipt-intake-001",
    ok: true,
    code: "REQUIREMENT_INTAKE_ACCEPTED",
    data: {
      canonical_json: canonicalizeJson(intake),
      digest: digestJson(intake),
      requirement_intake: intake,
      schema_version: "1.0",
    },
  });

  assert.equal(receipt.code, "REQUIREMENT_INTAKE_ACCEPTED");
  assert.equal(Object.hasOwn(receipt.data, "requirement_intake"), true);
});
