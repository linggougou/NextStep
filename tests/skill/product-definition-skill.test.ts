import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("NextStep Skill documents S1.3 Frozen Requirement binding and fail-closed signoff boundaries", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");

  for (const expected of [
    /S1\.3/,
    /Frozen Requirement/i,
    /PRD/,
    /用户旅程/,
    /能力映射/,
    /JSON Pointer/i,
    /source binding|来源绑定/i,
    /deterministically derived|确定性派生/i,
    /kind: direct|kind.*derived/i,
    /completion-transition/i,
    /transition_digest/i,
    /not-started.*in-progress.*completed/i,
    /actor.*semantic_source.*action.*state_change.*outcome/i,
    /session capability|session.*能力/i,
    /independent user action|独立用户动作/i,
    /manual-isolated consumer contract/i,
    /stdin.*fail closed|fail closed.*stdin/i,
    /bare boolean|裸布尔值|普通文本/i,
  ]) assert.match(skill, expected);
});
