import assert from "node:assert/strict";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir,
  mkdtemp,
  readFile,
  rename as nodeRename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createNodeWriteFileSystem,
  type NodeWriteFileSystemBinding,
} from "../../src/adapters/node/file-write.ts";

interface GuardedAtomicWriter {
  atomicWrite(
    relativePath: string,
    content: Uint8Array,
    guard: {
      readonly mode: "create" | "update";
      readonly before_digest: `sha256:${string}` | null;
    },
  ): Promise<void>;
}

function asGuardedWriter(value: unknown): GuardedAtomicWriter {
  return value as GuardedAtomicWriter;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => (error as { code?: unknown })?.code === expected;
}

test("create 在预检后出现竞争目标时执行 no-replace 且保留竞争者内容", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-create-race-"));
  const target = join(root, "docs", "result.md");
  await mkdir(join(root, "docs"));
  let injected = false;

  const injectCompetitor = async (installedPath: string): Promise<void> => {
    if (!injected && installedPath === target) {
      injected = true;
      await writeFile(target, "competitor", { flag: "wx" });
    }
  };
  const binding = {
    link: async (existingPath: string, newPath: string) => {
      await injectCompetitor(newPath);
      await nodeLink(existingPath, newPath);
    },
    rename: async (oldPath: string, newPath: string) => {
      await injectCompetitor(newPath);
      await nodeRename(oldPath, newPath);
    },
  } as unknown as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }),
      hasCode("EEXIST"),
    );
    assert.equal(injected, true);
    assert.equal(await readFile(target, "utf8"), "competitor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("父目录在预检后被替换为 symlink 时不会在项目根外落盘", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-parent-race-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nextstep-parent-race-outside-"));
  const parent = join(root, "docs");
  const target = join(parent, "result.md");
  const outsideTarget = join(outside, "result.md");
  await mkdir(parent);
  let injected = false;

  const binding = {
    lstat: async (path: string) => {
      if (!injected && path === target) {
        injected = true;
        await nodeRename(parent, join(root, "docs-original"));
        await symlink(outside, parent, "dir");
        const error = new Error("injected target absence") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return nodeLstat(path);
    },
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("docs/result.md", Buffer.from("must-stay-inside"), {
        mode: "create",
        before_digest: null,
      }),
      hasCode("WRITE_ACCESS_BLOCKED"),
    );
    assert.equal(injected, true);
    await assert.rejects(readFile(outsideTarget), hasCode("ENOENT"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
