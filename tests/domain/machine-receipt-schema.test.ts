import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  MACHINE_RECEIPT_SCHEMA,
  parseMachineReceipt,
} from "../../src/domain/machine-receipt.ts";
import {
  buildRequirementIntakeUserOutput,
  parseRequirementIntake,
} from "../../src/domain/requirement-intake.ts";
import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
} from "../../src/domain/requirement-confirmation.ts";
import { freezeRequirementSet } from "../../src/domain/requirement-freeze.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

test("产品定义回执区分 1.0 信封与 2.0 subject，并绑定 canonical、digest 与对象", () => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/product-definition/community-workshop.json"), "utf8")) as {
    product_definition: Record<string, unknown>;
  };
  const candidate = fixture.product_definition;
  const receipt = {
    schema_version: "1.0",
    receipt_id: "receipt-product-definition-v2",
    ok: true,
    code: "PRODUCT_DEFINITION_ACCEPTED",
    data: {
      canonical_json: canonicalizeJson(candidate),
      digest: digestJson(candidate),
      product_definition: candidate,
      schema_version: "2.0",
    },
  };

  assert.equal(parseMachineReceipt(receipt).code, "PRODUCT_DEFINITION_ACCEPTED");
  for (const invalid of [
    { ...receipt, data: { ...receipt.data, schema_version: "1.0" } },
    { ...receipt, data: { ...receipt.data, product_definition: { ...candidate, schema_version: "1.0" } } },
    { ...receipt, data: { ...receipt.data, canonical_json: canonicalizeJson({ ...candidate, product_definition_id: "tampered" }) } },
    { ...receipt, data: { ...receipt.data, digest: `sha256:${"0".repeat(64)}` } },
  ]) {
    assert.throws(() => parseMachineReceipt(invalid), /version|schema|canonical|digest|product definition|invalid/i);
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
      intent_summary: {
        status: "identified",
        source: "derived",
        value: "建立一个本地读书提醒工具",
        evidence: [{ start: 2, end: 13, quote: "做一个本地读书提醒工具" }],
      },
      goals: {
        status: "identified",
        items: [{
          value: "做一个本地读书提醒工具",
          evidence: [{ start: 2, end: 13, quote: "做一个本地读书提醒工具" }],
        }],
      },
      scenarios: { status: "missing", items: [], clarification_question: "谁会使用？" },
      constraints: { status: "missing", items: [], clarification_question: "有哪些限制？" },
      expected_outputs: { status: "missing", items: [], clarification_question: "输出什么？" },
      non_goal_gaps: { status: "missing", items: [], clarification_question: "不做什么？" },
      clarification_gaps: { status: "missing", items: [], clarification_question: "还要澄清什么？" },
    },
  });
  const userOutput = buildRequirementIntakeUserOutput(intake);
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
      user_output: userOutput,
    },
  });

  assert.equal(receipt.code, "REQUIREMENT_INTAKE_ACCEPTED");
  assert.equal(Object.hasOwn(receipt.data, "requirement_intake"), true);
});

test("machine receipt rejects user output that hides missing information", () => {
  const intake = parseRequirementIntake({
    schema_version: "1.0",
    candidate: {
      raw_expression: "我想做提醒工具。",
      intent_summary: {
        status: "identified",
        source: "derived",
        value: "建立提醒工具",
        evidence: [{ start: 3, end: 7, quote: "提醒工具" }],
      },
      goals: {
        status: "identified",
        items: [{ value: "提醒工具", evidence: [{ start: 3, end: 7, quote: "提醒工具" }] }],
      },
      scenarios: { status: "missing", items: [], clarification_question: "谁会使用？" },
      constraints: { status: "missing", items: [], clarification_question: "有哪些限制？" },
      expected_outputs: { status: "missing", items: [], clarification_question: "输出什么？" },
      non_goal_gaps: { status: "missing", items: [], clarification_question: "不做什么？" },
      clarification_gaps: { status: "missing", items: [], clarification_question: "还要澄清什么？" },
    },
  });
  const userOutput = buildRequirementIntakeUserOutput(intake);

  assert.throws(
    () => parseMachineReceipt({
      schema_version: "1.0",
      receipt_id: "receipt-dishonest-output",
      ok: true,
      code: "REQUIREMENT_INTAKE_ACCEPTED",
      data: {
        canonical_json: canonicalizeJson(intake),
        digest: digestJson(intake),
        requirement_intake: intake,
        schema_version: "1.0",
        user_output: { ...userOutput, missing_information: [], clarification_questions: [] },
      },
    }),
    /user output|match|receipt|invalid/i,
  );
});

test("machine receipt validates frozen requirement semantics independently for its success code", () => {
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: "req-receipt-freeze",
    project: { repository_id: `sha256:${"c".repeat(64)}`, formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454" },
    version: 1,
    candidate: {
      schema_version: "1.0",
      candidate: {
        raw_expression: "我想做一个离线提醒工具。",
        intent_summary: { status: "identified", source: "derived", value: "创建离线提醒工具", evidence: [{ start: 2, end: 11, quote: "做一个离线提醒工具" }] },
        goals: { status: "identified", items: [{ value: "做一个离线提醒工具", evidence: [{ start: 2, end: 11, quote: "做一个离线提醒工具" }] }] },
        scenarios: { status: "missing", items: [], clarification_question: "场景？" },
        constraints: { status: "missing", items: [], clarification_question: "限制？" },
        expected_outputs: { status: "missing", items: [], clarification_question: "输出？" },
        non_goal_gaps: { status: "missing", items: [], clarification_question: "非目标？" },
        clarification_gaps: { status: "missing", items: [], clarification_question: "澄清？" },
      },
    },
    user_resolutions: [
      { field: "scenarios", status: "identified", values: ["个人日程"] },
      { field: "constraints", status: "none", values: [] },
      { field: "expected_outputs", status: "identified", values: ["提醒"] },
      { field: "non_goal_gaps", status: "none", values: [] },
      { field: "clarification_gaps", status: "none", values: [] },
    ],
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: "confirm-receipt-freeze",
    created_at: "2026-08-10T01:09:00.000Z",
    expires_at: "2026-08-10T01:12:00.000Z",
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: "display-receipt-freeze",
    displayed_at: "2026-08-10T01:10:00.000Z",
  });
  const userAction = createUnverifiedUserConfirmationAction(display, {
    user_action_id: "user-action-receipt-freeze",
    action: "confirm",
    occurred_at: "2026-08-10T01:11:00.000Z",
  });
  const verifier = {
    verifier_kind: "manual-isolated-fixture" as const,
    verify: () => true,
  };
  const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
  const interactionSession = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(
    interactionSession,
    { type: "user-action", verified_interaction: verified, evaluated_at: "2026-08-10T01:11:01.000Z" },
  );
  const frozen = freezeRequirementSet({
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(verified),
  }, undefined, {
    verifier,
    verified_interaction: verified,
    interaction_session: interactionSession,
    now: () => new Date("2026-08-10T01:11:02.000Z"),
  });
  const receipt = {
    schema_version: "1.0",
    receipt_id: "receipt-freeze-001",
    ok: true,
    code: "REQUIREMENT_FREEZE_ACCEPTED",
    data: {
      canonical_json: canonicalizeJson(frozen),
      digest: digestJson(frozen),
      frozen_requirement: frozen,
      requirement_set: frozen.requirement_set,
      schema_version: "1.0",
    },
  };

  assert.equal(parseMachineReceipt(receipt).code, "REQUIREMENT_FREEZE_ACCEPTED");
  assert.throws(
    () => parseMachineReceipt({
      ...receipt,
      data: { ...receipt.data, requirement_set: { ...frozen.requirement_set, summary: "unbound" } },
    }),
    /frozen|requirement set|identity|receipt/i,
  );
});

// ---- S1.4（M1.2）新增回执码：TS 联合与 JSON Schema 枚举双真源同步验证 ----
// 依赖 W1/W2/W3 切片的 domain 模块与 fixture；集成前该依赖在 W4 分支上显式缺失。

import { parseInteractionPrototype } from "../../src/domain/interaction-prototype.ts";
import { parseCarrierDecision } from "../../src/domain/carrier-decision.ts";
import { evaluateAcceptanceProfile } from "../../src/domain/acceptance-profile.ts";

async function readFixtureSubject(path: string, field: string): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8")) as Record<string, unknown>;
  return fixture[field];
}

function s14Receipt(code: string, subjectField: string, subject: unknown) {
  return {
    schema_version: "1.0",
    receipt_id: `receipt-s14-${subjectField}`,
    ok: true,
    code,
    data: {
      canonical_json: canonicalizeJson(subject),
      digest: digestJson(subject),
      [subjectField]: subject,
      schema_version: "1.0",
    },
  };
}

test("S1.4 三个 ACCEPTED 回执码被信封接受，且主题可被独立重验（canonical/digest 自洽）", async () => {
  const prototype = parseInteractionPrototype(
    await readFixtureSubject("tests/fixtures/interaction-prototype/community-workshop.json", "interaction_prototype"),
  );
  const carrierDecision = parseCarrierDecision(
    await readFixtureSubject("tests/fixtures/carrier-decision/community-workshop.json", "carrier_decision"),
  );
  const acceptanceProfile = evaluateAcceptanceProfile(
    await readFixtureSubject("tests/fixtures/acceptance-profile/headless-community-workshop.json", "acceptance_profile"),
  );

  assert.equal(parseMachineReceipt(s14Receipt("INTERACTION_PROTOTYPE_ACCEPTED", "interaction_prototype", prototype)).code, "INTERACTION_PROTOTYPE_ACCEPTED");
  assert.equal(parseMachineReceipt(s14Receipt("CARRIER_DECISION_ACCEPTED", "carrier_decision", carrierDecision)).code, "CARRIER_DECISION_ACCEPTED");
  assert.equal(parseMachineReceipt(s14Receipt("ACCEPTANCE_PROFILE_ACCEPTED", "acceptance_profile", acceptanceProfile)).code, "ACCEPTANCE_PROFILE_ACCEPTED");
});

test("S1.4 回执码的 ok/code 错配、未知码与 data 形状违规均 fail closed", async () => {
  const prototype = parseInteractionPrototype(
    await readFixtureSubject("tests/fixtures/interaction-prototype/community-workshop.json", "interaction_prototype"),
  );
  const validReceipt = s14Receipt("INTERACTION_PROTOTYPE_ACCEPTED", "interaction_prototype", prototype);

  for (const receipt of [
    // ok=true 搭配 REJECTED 码：oneOf 无匹配分支。
    { ...validReceipt, code: "INTERACTION_PROTOTYPE_REJECTED" },
    // ok=false 搭配 ACCEPTED 码：else 分支码枚举不包含它。
    { ...validReceipt, ok: false, code: "CARRIER_DECISION_ACCEPTED", data: { dry_run: false } },
    { ...validReceipt, ok: false, code: "PROFILE_CONFLICT_REJECTED", data: { dry_run: false, acceptance_profile: prototype } },
    // 未列入双真源枚举的码。
    { ...validReceipt, code: "PROFILE_CONFLICT_ACCEPTED" },
    { ...validReceipt, code: "S14_UNKNOWN_CODE" },
    // data 缺字段 / 多字段。
    { ...validReceipt, data: { canonical_json: validReceipt.data.canonical_json, digest: validReceipt.data.digest, schema_version: "1.0" } },
    { ...validReceipt, data: { ...validReceipt.data, unexpected: true } },
    // 主题被篡改：canonical/digest 与对象不再一致。
    { ...validReceipt, data: { ...validReceipt.data, interaction_prototype: { ...prototype, tampered: true } } },
  ]) {
    assert.throws(() => parseMachineReceipt(receipt), /code|receipt|schema|data|digest|canonical|invalid|mismatch/i);
  }
});

test("S1.4 成功回执的 data 含敏感字段时拒绝且不落盘原值", () => {
  assert.throws(
    () =>
      parseMachineReceipt({
        schema_version: "1.0",
        receipt_id: "receipt-s14-sensitive",
        ok: true,
        code: "ACCEPTANCE_PROFILE_ACCEPTED",
        data: { authorization: "Bearer value-that-must-not-be-persisted" },
      }),
    /sensitive|secret|token|authorization/i,
  );
});

test("PROFILE_CONFLICT_REJECTED 是独立的失败码：只允许 dry_run data，不得携带 Profile 输出", () => {
  assert.equal(
    parseMachineReceipt({
      schema_version: "1.0",
      receipt_id: "receipt-s14-conflict",
      ok: false,
      code: "PROFILE_CONFLICT_REJECTED",
      data: { dry_run: false },
    }).code,
    "PROFILE_CONFLICT_REJECTED",
  );
  assert.throws(
    () =>
      parseMachineReceipt({
        schema_version: "1.0",
        receipt_id: "receipt-s14-conflict-leak",
        ok: false,
        code: "PROFILE_CONFLICT_REJECTED",
        data: { dry_run: false, acceptance_profile: { downgraded: true } },
      }),
    /data|receipt|schema|invalid/i,
  );
});
