import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { createConfirmationChallenge, createConfirmationEnvelope } from "../../src/domain/requirement-confirmation.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";

const compiledCliPath = resolve(process.cwd(), "dist/src/cli/requirement-freeze.js");

function runCli(input: string): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [compiledCliPath], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(input);
  });
}

function command() {
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: "req-cli",
    project: { repository_id: `sha256:${"b".repeat(64)}`, formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454" },
    version: 1,
    candidate: {
      schema_version: "1.0",
      candidate: {
        raw_expression: "我想做一个本地提醒工具。",
        intent_summary: { status: "identified", source: "derived", value: "创建本地提醒工具", evidence: [{ start: 2, end: 11, quote: "做一个本地提醒工具" }] },
        goals: { status: "identified", items: [{ value: "做一个本地提醒工具", evidence: [{ start: 2, end: 11, quote: "做一个本地提醒工具" }] }] },
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
  const challenge = createConfirmationChallenge(requirementSet, { confirmation_id: "confirm-cli", created_at: "2026-08-10T01:07:00.000Z" });
  return {
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(challenge, { confirmation_kind: "explicit-user-confirmation", confirmed_at: "2026-08-10T01:08:00.000Z" }),
    known_frozen_records: [],
  };
}

test("requirement freeze CLI emits exactly one JCS receipt and only stderr diagnostics", async () => {
  const result = await runCli(canonicalizeJson(command()));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.split("\n").length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(result.stdout, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.code, "REQUIREMENT_FREEZE_ACCEPTED");
  assert.equal(receipt.ok, true);
});

test("requirement freeze CLI fails closed without echoing sensitive values", async () => {
  const input = command();
  const result = await runCli(canonicalizeJson({
    ...input,
    requirement_set: { ...input.requirement_set, summary: "Authorization: Bearer secret-value-not-to-echo" },
  }));
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout.split("\n").length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(result.stdout, "utf8")) as Record<string, unknown>;
  assert.equal(receipt.ok, false);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-value-not-to-echo/);
});
