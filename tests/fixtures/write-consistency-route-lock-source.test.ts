import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  resolveProjectContext,
  type ProjectRootProbe,
} from "../../src/domain/project-context.ts";

const POSITIVE_FIXTURES = [
  "community-workshop-write.json",
  "expense-reminder-write.json",
  "project-delivery-tool-write.json",
] as const;

interface PositiveFixture {
  readonly baseline: {
    readonly files: readonly { readonly path: string; readonly content: string }[];
  };
  readonly target_project: { readonly project_id: string };
}

function projectProbe(root: string, routeLock: string): ProjectRootProbe {
  const routeLockPath = `${root}/PROJECT_ROUTE_LOCK.md`;
  return {
    exists: (path) => path === root || path === routeLockPath,
    isDirectory: (path) => path === root,
    isSymbolicLink: () => false,
    isReadable: (path) => path === root || path === routeLockPath,
    isWritable: (path) => path === root || path === routeLockPath,
    realpath: (path) => path,
    readFileUtf8: (path) => {
      if (path !== routeLockPath) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return routeLock;
    },
  };
}

test("三份正向 fixture 的路线锁原文可直接解析为 S1.5，不依赖 synthetic 替换", async (t) => {
  for (const name of POSITIVE_FIXTURES) {
    await t.test(name, async () => {
      const fixture = JSON.parse(await readFile(resolve(
        process.cwd(),
        "tests/fixtures/write-consistency/positive",
        name,
      ), "utf8")) as PositiveFixture;
      const routeLock = fixture.baseline.files.find((entry) => entry.path === "PROJECT_ROUTE_LOCK.md");
      assert.ok(routeLock, `${name} 必须包含 PROJECT_ROUTE_LOCK.md`);

      const root = `/fixtures/${fixture.target_project.project_id}`;
      const context = resolveProjectContext({
        workspace_roots: [root],
        requested_project: fixture.target_project.project_id,
        explicit_canonical_root: root,
      }, projectProbe(root, routeLock.content));

      assert.deepEqual(context.stage, {
        lifecycle_stage: "S5 / P5",
        stage_name: "V1 / M1.2 / S1.5",
        milestone_number: "M1.2",
        stage_source: "PROJECT_ROUTE_LOCK.md",
      });
    });
  }
});
