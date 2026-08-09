import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("NextStep Skill documents S1.2 explicit confirmation, immutable freeze, and recovery boundaries", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");

  assert.match(skill, /S1\.2/);
  assert.match(skill, /confirmation challenge|确认挑战/i);
  assert.match(skill, /confirmation envelope|确认信封/i);
  assert.match(skill, /bare boolean|裸布尔值|普通文本/i);
  assert.match(skill, /chat|聊天/i);
  assert.match(skill, /PC-17/);
  assert.match(skill, /S1\.3/);
});
