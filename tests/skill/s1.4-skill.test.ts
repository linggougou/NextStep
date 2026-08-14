import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

// S1.4 Skill 守卫测试：只断言 skills/nextstep/SKILL.md 内容，不依赖并行 domain 模块，
// 因此可在 W1..W3 集成前独立运行。S1.1..S1.3 既有断言由既有 skill 测试保护，本文件
// 额外复核关键段落仍然存在，防止追加 S1.4 节时误删历史边界。

async function loadSkill(): Promise<string> {
  return readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
}

test("NextStep Skill 保留 S1.1..S1.3 阶段、命令与边界段落", async () => {
  const skill = await loadSkill();

  for (const expected of [
    /S1\.1/,
    /S1\.2/,
    /S1\.3/,
    /V1 \/ M1\.1 \/ S1\.1/,
    /V1 \/ M1\.1 \/ S1\.2/,
    /V1 \/ M1\.1 \/ S1\.3/,
    /node dist\/src\/cli\/requirement-intake\.js/,
    /node dist\/src\/cli\/requirement-freeze\.js/,
    /node dist\/src\/cli\/product-definition\.js/,
    /Inspect The Stage/,
    /manual-isolated consumer contract/i,
  ]) {
    assert.match(skill, expected);
  }
});

test("NextStep Skill 只允许在 V1 / M1.2 / S1.4 阶段进入 S1.4 入口", async () => {
  const skill = await loadSkill();

  assert.match(skill, /V1 \/ M1\.2 \/ S1\.4/);
  const inspectEnd = skill.indexOf("## Build An Evidence-Backed Candidate");
  assert.notEqual(inspectEnd, -1);
  const stageSection = skill.slice(0, inspectEnd);
  assert.ok(stageSection.includes("V1 / M1.2 / S1.4"), "Inspect The Stage 段落必须列出 S1.4 阶段守卫");
  assert.match(skill, /do not enter S1\.4 until|S1\.4.*only after.*S1\.3|仅.*S1\.3.*提升.*才.*进入.*S1\.4/is);
  assert.doesNotMatch(skill, /do not enter S1\.4 from this Skill/i);
});

test("NextStep Skill 声明三个 S1.4 stdin 校验命令", async () => {
  const skill = await loadSkill();

  for (const command of [
    "node dist/src/cli/interaction-prototype.js",
    "node dist/src/cli/carrier-decision.js",
    "node dist/src/cli/acceptance-profile.js",
  ]) {
    assert.ok(skill.includes(command), `SKILL.md 缺少命令 ${command}`);
  }
});

test("NextStep Skill 声明 S1.4 kernel 只校验、不回写、不签认、不声明 full", async () => {
  const skill = await loadSkill();

  assert.match(skill, /carrier-free|载体无关/i);
  assert.match(skill, /only validates|只校验/i);
  assert.match(skill, /never writes truth sources back|不回写/i);
  assert.match(skill, /never signs|不签认/i);
  assert.match(skill, /never declares `full`|不声明 `?full`?/i);
  assert.match(skill, /RFC 8785/i);
  assert.match(skill, /stdin-injected signoff|stdin 注入.*签认/i);
});

test("NextStep Skill 声明载体裁决边界：skill-chat 主载体、候选分支不得冒充主线、需显式确认", async () => {
  const skill = await loadSkill();

  assert.match(skill, /skill-chat/);
  assert.match(skill, /candidate branch|候选分支/i);
  assert.match(skill, /must not be treated as the current mainline|不得.*冒充.*主线|不得作为当前主线/i);
  assert.match(skill, /explicit user confirmation|显式确认/i);
});

test("NextStep Skill 声明 Acceptance Profile 冲突 fail closed 且不降级为 headless", async () => {
  const skill = await loadSkill();

  assert.match(skill, /ACCEPTANCE_PROFILE_ACCEPTED/);
  assert.match(skill, /PROFILE_CONFLICT_REJECTED/);
  assert.match(skill, /no downgrade to headless|不得降级为 ?headless|不降级为 ?headless/i);
  assert.match(skill, /headless/i);
  assert.match(skill, /UI restoration|UI 还原/i);
  assert.match(skill, /only provide evidence|只提供证据|只能提供证据/i);
});

test("NextStep Skill 声明 S1.4 确认节点四态记录与证据边界（不构成 M1.2 完成）", async () => {
  const skill = await loadSkill();

  assert.match(skill, /通过.*退回.*需讨论.*阻塞/);
  assert.match(skill, /receipts are evidence|回执.*证据/i);
  assert.match(skill, /does not complete M1\.2|不构成 ?M1\.2 ?完成/i);
  assert.match(skill, /refs\/nextstep\/formal/);
  assert.match(skill, /refs\/nextstep\/control/);
});
