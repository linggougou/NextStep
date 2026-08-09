import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import {
  buildRequirementIntakeUserOutput,
  RequirementIntakeError,
  parseRequirementIntake,
} from "../../src/domain/requirement-intake.ts";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/requirement-intake");

async function readFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, name), "utf8")) as unknown;
}

test("requirement intake accepts three traceable one-sentence project candidates", async () => {
  for (const fixture of [
    "project-delivery-tool.json",
    "community-workshop.json",
    "expense-reminder.json",
  ]) {
    const intake = parseRequirementIntake(await readFixture(fixture));

    assert.notEqual(intake.candidate.raw_expression, "");
    assert.equal(intake.schema_version, "1.0");
    assert.ok(Object.isFrozen(intake));
    assert.ok(Object.isFrozen(intake.candidate));
    for (const field of [
      intake.candidate.goals,
      intake.candidate.scenarios,
      intake.candidate.constraints,
      intake.candidate.expected_outputs,
      intake.candidate.non_goal_gaps,
      intake.candidate.clarification_gaps,
    ]) {
      if (field.status === "identified") {
        assert.notEqual(field.items.length, 0);
        for (const item of field.items) {
          assert.equal(item.evidence.length, 1);
          assert.equal(item.value, item.evidence[0]?.quote);
        }
      } else {
        assert.equal(field.items.length, 0);
        assert.notEqual(field.clarification_question, "");
      }
    }
  }
});

test("requirement intake preserves explicit missing information without inventing it", async () => {
  const intake = parseRequirementIntake(await readFixture("project-delivery-tool.json"));
  assert.equal(intake.candidate.scenarios.status, "missing");
  assert.deepEqual(intake.candidate.scenarios.items, []);
  assert.match(intake.candidate.scenarios.clarification_question, /谁|场景/);
});

test("identified facts require matching in-bounds source evidence and cannot be prefilled", async () => {
  const fixture = await readFixture("project-delivery-tool.json") as Record<string, unknown>;

  for (const goals of [
    { status: "identified", items: [{ value: "面向企业团队", evidence: [] }] },
    {
      status: "identified",
      items: [{
        value: "面向企业团队",
        evidence: [{ start: 2, end: 15, quote: "做一个 AI 项目推进工具" }],
      }],
    },
    {
      status: "identified",
      items: [{
        value: "做一个 AI 项目推进工具",
        evidence: [{ start: 2, end: 99, quote: "做一个 AI 项目推进工具" }],
      }],
    },
    {
      status: "identified",
      items: [{
        value: "做一个 AI 项目推进工具",
        evidence: [{ start: 2, end: 15, quote: "不匹配的原文片段" }],
      }],
    },
  ]) {
    const candidate = structuredClone(fixture) as Record<string, unknown>;
    (candidate.candidate as Record<string, unknown>).goals = goals;
    assert.throws(() => parseRequirementIntake(candidate), /evidence|quote|source|schema|invalid/i);
  }
});

test("derived intent is explicit and user output exposes every missing field and question", async () => {
  const intake = parseRequirementIntake(await readFixture("project-delivery-tool.json"));
  assert.equal(intake.candidate.intent_summary.status, "identified");
  assert.equal(intake.candidate.intent_summary.source, "derived");
  assert.notEqual(intake.candidate.intent_summary.evidence.length, 0);

  const output = buildRequirementIntakeUserOutput(intake);
  assert.equal(output.status, "candidate-only");
  assert.match(output.candidate_summary, /AI 项目推进工具/);
  assert.ok(output.identified_facts.some((fact) => fact.field === "goals"));
  assert.ok(output.missing_information.some((item) => item.field === "scenarios"));
  assert.ok(output.clarification_questions.some((question) => /谁|场景/.test(question)));
  assert.match(output.next_step, /不会冻结|不会写入|不会生成开发任务/);
  assert.ok(Object.isFrozen(output));
});

test("requirement intake rejects empty, incomplete, unknown, sensitive, and development-task candidates", async () => {
  for (const [fixture, code] of [
    ["missing-field.json", "INVALID_REQUIREMENT_INTAKE"],
    ["unknown-field.json", "INVALID_REQUIREMENT_INTAKE"],
    ["sensitive-field.json", "SENSITIVE_FIELD_DETECTED"],
    ["development-task.json", "DEVELOPMENT_TASK_EMBEDDED"],
  ] as const) {
    await assert.rejects(
      async () => parseRequirementIntake(await readFixture(fixture)),
      (error: unknown) => error instanceof RequirementIntakeError && error.code === code,
    );
  }
  assert.throws(
    () => parseRequirementIntake(undefined),
    (error: unknown) => error instanceof RequirementIntakeError && error.code === "INVALID_REQUIREMENT_INTAKE",
  );
});

test("requirement intake only returns canonical, frozen, no-prototype JSON", async () => {
  const intake = parseRequirementIntake(await readFixture("project-delivery-tool.json"));

  assert.equal(canonicalizeJson(intake), canonicalizeJson({ ...intake }));
  assert.equal(Object.getPrototypeOf(intake), null);
  assert.equal(Object.getPrototypeOf(intake.candidate), null);
  assert.throws(() => {
    (intake.candidate.goals.items as unknown as unknown[]).push("fabricated");
  });
});
