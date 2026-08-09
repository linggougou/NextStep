import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import {
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
      assert.equal(field.status, "identified");
      assert.notEqual(field.items.length, 0);
    }
  }
});

test("requirement intake preserves explicit missing information without inventing it", async () => {
  const fixture = await readFixture("missing-field.json") as Record<string, unknown>;
  const candidate = fixture.candidate as Record<string, unknown>;
  candidate.scenarios = { status: "missing", items: [] };

  const intake = parseRequirementIntake(fixture);
  assert.equal(intake.candidate.scenarios.status, "missing");
  assert.deepEqual(intake.candidate.scenarios.items, []);
  assert.equal(intake.candidate.intent_summary.status, "missing");
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
    (intake.candidate.goals.items as string[]).push("fabricated");
  });
});
