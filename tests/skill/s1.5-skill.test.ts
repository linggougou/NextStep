import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";

test("NextStep Skill 固定 S1.5 阶段、职责、确认与失败不提升边界", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  for (const expected of [
    /V1\s*\/\s*M1\.2\s*\/\s*S1\.5/,
    /main conversation|主对话/i,
    /integration agent|集成 Agent/i,
    /dry-run/i,
    /explicit confirmation|显式确认/i,
    /WRITE_CONFLICT_REJECTED/,
    /WRITE_PARTIAL_BLOCKED/,
    /WRITE_ACCESS_BLOCKED/,
    /不得.*formal|formal.*不得/i,
    /fixture.*manual-isolated consumer contract/is,
  ]) assert.match(skill, expected);
});

test("S1.5 集成保持既有 S1.2 Frozen Requirement 的 RFC8785 digest 字节稳定", async () => {
  const fixture = JSON.parse(await readFile(
    resolve(process.cwd(), "tests/fixtures/product-definition/community-workshop.json"),
    "utf8",
  )) as {
    readonly frozen_requirement: unknown;
    readonly product_definition: { readonly frozen_requirement: unknown };
  };
  assert.equal(
    canonicalizeJson(fixture.frozen_requirement),
    canonicalizeJson(fixture.product_definition.frozen_requirement),
  );
  assert.equal(
    digestJson(fixture.frozen_requirement),
    "sha256:21a0f7ce08ed8cbd5a4d7a8dbc1d21629c6c77b6927e66bd27c128d22532f58a",
  );
});
