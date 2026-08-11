import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("NextStep Skill documents S1.2 explicit confirmation, immutable freeze, and recovery boundaries", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");

  assert.match(skill, /S1\.2/);
  assert.match(skill, /confirmation challenge|确认挑战/i);
  assert.match(skill, /confirmation envelope|确认信封/i);
  assert.match(skill, /confirmation view|确认视图/i);
  assert.match(skill, /independent user action|独立用户动作/i);
  assert.match(skill, /consumer contract|消费者契约/i);
  assert.match(skill, /trusted confirmation interaction verifier|可信.*verifier/i);
  assert.match(skill, /trusted execution clock|可信执行时钟/i);
  assert.match(skill, /session capability|session.*能力/i);
  assert.match(skill, /saved state snapshot|保存.*状态快照/i);
  assert.match(skill, /manual-isolated-fixture/i);
  assert.match(skill, /stdin.*fail closed|fail closed.*stdin/i);
  assert.match(skill, /host adapter|宿主适配/i);
  assert.match(skill, /arguments.*environment variables|stdin.*环境变量/i);
  assert.match(skill, /full/i);
  assert.match(skill, /bare boolean|裸布尔值|普通文本/i);
  assert.match(skill, /chat|聊天/i);
  assert.match(skill, /PC-17/);
  assert.match(skill, /S1\.3/);
});
