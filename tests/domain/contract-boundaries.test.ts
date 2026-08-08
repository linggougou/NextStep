import assert from "node:assert/strict";
import test from "node:test";

import { assertSupportedContractVersion } from "../../src/domain/contract-version.ts";
import { parseGateConclusion } from "../../src/domain/gate-conclusion.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import { assertNoSensitiveFields } from "../../src/domain/sensitive-fields.ts";

test("parseGateConclusion accepts exactly the four permitted conclusions", () => {
  for (const conclusion of ["通过", "退回", "需讨论", "阻塞"]) {
    assert.equal(parseGateConclusion(conclusion), conclusion);
  }
});

test("parseGateConclusion rejects unknown, missing, and non-string states", () => {
  for (const conclusion of ["未知", "完成", "", undefined, 1]) {
    assert.throws(
      () => parseGateConclusion(conclusion),
      /conclusion|state|状态|结论/i,
    );
  }
});

test("assertSupportedContractVersion rejects unknown contract major versions", () => {
  assert.doesNotThrow(() => assertSupportedContractVersion("1.0"));
  assert.throws(
    () => assertSupportedContractVersion("2.0"),
    /version|版本|unsupported|unknown/i,
  );
  assert.throws(
    () => assertSupportedContractVersion("not-a-version"),
    /version|版本/i,
  );
});

test("assertSupportedContractVersion supports exactly contract version 1.0", () => {
  for (const version of ["1.1", "1.999"]) {
    assert.throws(
      () => assertSupportedContractVersion(version),
      /version|版本|unsupported|unknown/i,
    );
  }
});

test("parseMachineReceipt accepts a complete machine-readable receipt", () => {
  const receipt = {
    schema_version: "1.0",
    receipt_id: "receipt-001",
    ok: false,
    code: "SENSITIVE_FIELD_DETECTED",
    data: { field_path: "$.result.access_token" },
  };

  assert.deepEqual(parseMachineReceipt(receipt), receipt);
});

test("parseMachineReceipt rejects malformed receipts rather than returning a partial success", () => {
  const completeReceipt = {
    schema_version: "1.0",
    receipt_id: "receipt-001",
    ok: true,
    code: "CONTRACT_PROBE_SUCCEEDED",
    data: {},
  };

  for (const receipt of [
    { ...completeReceipt, schema_version: undefined },
    { ...completeReceipt, receipt_id: "" },
    { ...completeReceipt, ok: "true" },
    { ...completeReceipt, code: 200 },
    { ...completeReceipt, data: [] },
  ]) {
    assert.throws(() => parseMachineReceipt(receipt), /receipt|schema|field|invalid/i);
  }
});

test("assertNoSensitiveFields fails closed for prohibited fields at any nesting level", () => {
  const allowed = {
    task_id: "task-001",
    evidence_refs: ["evidence:sha256:abc"],
    nested: { outcome: "blocked" },
  };

  assert.doesNotThrow(() => assertNoSensitiveFields(allowed));

  for (const prohibited of [
    { access_token: "not-allowed" },
    { nested: { authorization: "Bearer not-allowed" } },
    { credentials: { privateKey: "not-allowed" } },
    { password: "not-allowed" },
    { apikey: "not-allowed" },
    { apiKey: "not-allowed" },
  ]) {
    assert.throws(
      () => assertNoSensitiveFields(prohibited),
      /sensitive|secret|token|credential|password/i,
    );
  }
});
