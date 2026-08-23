import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const SKILL_PATH = resolve(process.cwd(), "skills/nextstep/SKILL.md");

test("NextStep Skill 明示 S1.6/PC-08、F15、Q3=100% 与 Q11=20/20 入口", async () => {
  const source = await readFile(SKILL_PATH, "utf8");
  assert.match(source, /V1\s*\/\s*M1\.2\s*\/\s*S1\.6/);
  assert.match(source, /PC-08/);
  assert.match(source, /7169e9b019fe2213ca76babb4122a84760bdf112/);
  assert.match(source, /Q3[^\n]*100%/);
  assert.match(source, /Q11[^\n]*20\s*\/\s*20/);
  assert.match(source, /node dist\/src\/cli\/source-validate\.js/);
});

test("NextStep Skill 冻结五类回滚入口并保持 manual-isolated consumer contract 边界", async () => {
  const source = await readFile(SKILL_PATH, "utf8");
  for (const rollbackId of [
    "stop-auto-write-and-enter-change-request",
    "manual-isolated-fallback",
    "blocked-await-external-proof",
    "awaiting-formal-promotion",
    "awaiting-archive",
  ]) {
    assert.match(source, new RegExp(rollbackId));
  }
  assert.match(source, /manual-isolated consumer contract/);
  assert.match(source, /不得[^\n]*(?:宣称|声明)[^\n]*full/);
  assert.match(source, /不(?:实现|执行)[^\n]*(?:host bootstrap|宿主启动|宿主探测)/i);
});

test("NextStep Skill 将 source-validate 限定为只读 candidate 消费者", async () => {
  const source = await readFile(SKILL_PATH, "utf8");
  assert.match(source, /stdin[^\n]*fixture[^\n]*candidate/i);
  assert.match(source, /一份[^\n]*JCS[^\n]*回执/);
  assert.match(source, /ARCHITECTURE_RISK_ASSESSMENT_ACCEPTED/);
  assert.match(source, /ARCHITECTURE_RISK_ASSESSMENT_REJECTED/);
  assert.match(source, /不得[^\n]*(?:修改|移动)[^\n]*formal[^\n]*control/);
  assert.match(source, /不(?:冻结|扩大)[^\n]*P4[^\n]*(?:API|Schema)/i);
});
