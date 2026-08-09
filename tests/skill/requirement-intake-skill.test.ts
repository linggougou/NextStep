import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const compiledCliPath = resolve(process.cwd(), "dist/src/cli/requirement-intake.js");

interface ReplayFixture {
  readonly replay_kind: string;
  readonly user_input: string;
  readonly host_ai_candidate: unknown;
}

function runCli(input: string): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [compiledCliPath], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({
      code,
      stderr: Buffer.concat(stderr).toString("utf8"),
      stdout: Buffer.concat(stdout).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

test("NextStep Skill replays one sentence through the host-AI contract handoff", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /host AI|宿主 AI/i);
  assert.match(skill, /evidence|原文证据/i);
  assert.match(skill, /does not prove|不证明.*模型/i);
  assert.match(skill, /不冻结|do not freeze/i);

  const replay = JSON.parse(
    await readFile(
      resolve(process.cwd(), "tests/fixtures/requirement-intake/skill-replay.json"),
      "utf8",
    ),
  ) as ReplayFixture;
  assert.equal(replay.replay_kind, "host-ai-contract-handoff");
  assert.equal(
    (replay.host_ai_candidate as { candidate: { raw_expression: string } }).candidate.raw_expression,
    replay.user_input,
  );

  const result = await runCli(canonicalizeJson(replay.host_ai_candidate));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const receipt = parseCanonicalJsonBytes(Buffer.from(result.stdout, "utf8")) as Record<string, unknown>;
  const data = receipt.data as Record<string, unknown>;
  const output = data.user_output as Record<string, unknown>;
  assert.equal(receipt.code, "REQUIREMENT_INTAKE_ACCEPTED");
  assert.equal(output.status, "candidate-only");
  assert.match(String(output.candidate_summary), /自由职业者|未付款发票/);
  assert.ok((output.identified_facts as readonly unknown[]).length >= 5);
  assert.ok((output.clarification_questions as readonly string[]).some((item) => /澄清|哪些/.test(item)));
  assert.match(String(output.next_step), /不会冻结|不会写入|不会生成开发任务/);
});
