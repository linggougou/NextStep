import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("NextStep Skill replays S1.3 stage entry and fail-closed product-definition boundaries", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  const replay = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/product-definition/l3-regressions.json"), "utf8")) as {
    readonly skill_stage_replay: {
      readonly allowed_stage: string;
      readonly required_command: string;
      readonly required_boundary: string;
    };
  };
  const frontmatterEnd = skill.indexOf("---", 4);
  const inspectEnd = skill.indexOf("## Build An Evidence-Backed Candidate");
  const frontmatter = skill.slice(0, frontmatterEnd + 3);
  const inspectStage = skill.slice(0, inspectEnd);

  assert.ok(frontmatter.includes(replay.skill_stage_replay.allowed_stage));
  assert.ok(inspectStage.includes(replay.skill_stage_replay.allowed_stage));
  assert.ok(skill.includes(replay.skill_stage_replay.required_command));
  assert.ok(skill.includes(replay.skill_stage_replay.required_boundary));

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
    /pending.*confirmed.*rejected.*cancelled.*expired.*superseded/i,
    /replacement display.*reducer|新.*display.*reducer/i,
    /semantic.source.*partition|按.*semantic.source.*分区/i,
    /activity.*result|活动.*结果/i,
    /independent user action|独立用户动作/i,
    /manual-isolated consumer contract/i,
    /stdin.*fail closed|fail closed.*stdin/i,
    /bare boolean|裸布尔值|普通文本/i,
  ]) assert.match(skill, expected);
});
