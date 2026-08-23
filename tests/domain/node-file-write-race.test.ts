import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir,
  mkdtemp,
  open as nodeOpen,
  readFile,
  realpath as nodeRealpath,
  readdir,
  rename as nodeRename,
  rm,
  symlink,
  unlink,
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
  removeCreated(relativePath: string, expectedDigest: `sha256:${string}`): Promise<void>;
}

function asGuardedWriter(value: unknown): GuardedAtomicWriter {
  return value as GuardedAtomicWriter;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => (error as { code?: unknown })?.code === expected;
}

function digest(content: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

test("create 在预检后出现竞争目标时执行 no-replace 且保留竞争者内容", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-create-race-"));
  const target = join(root, "docs", "result.md");
  await mkdir(join(root, "docs"));
  let injected = false;

  const injectCompetitor = async (installedPath: string): Promise<void> => {
    if (!injected && (installedPath === target || installedPath === "result.md")) {
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
    assert.deepEqual(await readdir(join(root, "docs")), ["result.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update 在最终安装前重读 before_digest 并拒绝中途内容漂移", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-update-race-"));
  const target = join(root, "result.md");
  await writeFile(target, "before");
  let injected = false;

  const binding = {
    readFile: async (path: string) => {
      const observed = await readFile(path);
      if (!injected && path === target) {
        injected = true;
        await writeFile(target, "competitor");
      }
      return observed;
    },
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }),
      hasCode("ESTALE"),
    );
    assert.equal(injected, true);
    assert.equal(await readFile(target, "utf8"), "competitor");
    assert.deepEqual(await readdir(root), ["result.md"]);
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

test("显式 guard 对畸形结构与初始 create/update 冲突全部 fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-guard-contract-"));
  await writeFile(join(root, "existing.md"), "before");

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root }));
    for (const guard of [
      { mode: "delete", before_digest: null },
      { mode: "create", before_digest: digest("before") },
      { mode: "update", before_digest: null },
      { mode: "update", before_digest: "sha256:not-hex" },
    ]) {
      await assert.rejects(
        fileSystem.atomicWrite("new.md", Buffer.from("nextstep"), guard as never),
        hasCode("INVALID_WRITE_PLAN"),
      );
    }

    await assert.rejects(
      fileSystem.atomicWrite("existing.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }),
      hasCode("EEXIST"),
    );
    await assert.rejects(
      fileSystem.atomicWrite("missing.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }),
      hasCode("ENOENT"),
    );
    await assert.rejects(
      fileSystem.atomicWrite("existing.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("other"),
      }),
      hasCode("ESTALE"),
    );
    assert.equal(await readFile(join(root, "existing.md"), "utf8"), "before");
    assert.deepEqual(await readdir(root), ["existing.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("规范父路径解析漂移时在创建 temp 前拒绝写入", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-canonical-parent-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nextstep-canonical-parent-outside-"));
  const parent = join(root, "docs");
  await mkdir(parent);
  const binding = {
    realpath: async (path: string) => path === parent ? outside : nodeRealpath(path),
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }),
      hasCode("WRITE_ACCESS_BLOCKED"),
    );
    assert.deepEqual(await readdir(parent), []);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("规范 root 与父路径的 symlink、非目录和解析故障均映射访问阻塞", async (t) => {
  await t.test("root symlink", async () => {
    const container = await mkdtemp(join(tmpdir(), "nextstep-root-symlink-"));
    const realRoot = join(container, "real");
    const alias = join(container, "alias");
    await mkdir(realRoot);
    await symlink(realRoot, alias, "dir");
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: alias }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("x"), { mode: "create", before_digest: null }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
    } finally {
      await rm(container, { recursive: true, force: true });
    }
  });

  await t.test("root 非目录", async () => {
    const container = await mkdtemp(join(tmpdir(), "nextstep-root-file-"));
    const rootFile = join(container, "root-file");
    await writeFile(rootFile, "not-a-directory");
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: rootFile }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("x"), { mode: "create", before_digest: null }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
    } finally {
      await rm(container, { recursive: true, force: true });
    }
  });

  await t.test("父路径非目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-parent-file-"));
    await writeFile(join(root, "docs"), "not-a-directory");
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root }));
      await assert.rejects(
        fileSystem.atomicWrite("docs/result.md", Buffer.from("x"), { mode: "create", before_digest: null }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("root realpath 故障", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-root-realpath-fault-"));
    const binding = {
      realpath: async () => {
        const error = new Error("injected realpath fault") as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      },
    } as Partial<NodeWriteFileSystemBinding>;
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("x"), { mode: "create", before_digest: null }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("最终 readback 缺失或内容漂移时拒绝成功并清理 temp", async (t) => {
  await t.test("readback 内容漂移", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-readback-drift-"));
    const target = join(root, "result.md");
    const binding = {
      readFile: async (path: string) => path === target || path === "result.md" ? Buffer.from("drifted") : readFile(path),
    } as Partial<NodeWriteFileSystemBinding>;
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }),
        hasCode("ESTALE"),
      );
      assert.equal(await readFile(target, "utf8"), "nextstep");
      assert.deepEqual(await readdir(root), ["result.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("readback 前目标消失", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-readback-missing-"));
    const target = join(root, "result.md");
    let targetChecks = 0;
    const binding = {
      lstat: async (path: string) => {
        if ((path === target || path === "result.md") && ++targetChecks === 2) {
          await unlink(target);
          const error = new Error("injected readback disappearance") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }
        return nodeLstat(path);
      },
    } as Partial<NodeWriteFileSystemBinding>;
    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }),
        hasCode("ENOENT"),
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("最终安装对象被替换为 symlink 或目录时拒绝 readback", async (t) => {
  for (const replacement of ["symlink", "directory"] as const) {
    await t.test(replacement, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-readback-${replacement}-`));
      const target = join(root, "result.md");
      const outside = join(root, "outside.md");
      await writeFile(outside, "outside");
      let targetChecks = 0;
      const binding = {
        lstat: async (path: string) => {
          if ((path === target || path === "result.md") && ++targetChecks === 2) {
            await unlink(target);
            if (replacement === "symlink") {
              await symlink(outside, target);
            } else {
              await mkdir(target);
            }
          }
          return nodeLstat(path);
        },
      } as Partial<NodeWriteFileSystemBinding>;
      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        await assert.rejects(
          fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
            mode: "create",
            before_digest: null,
          }),
          hasCode("WRITE_ACCESS_BLOCKED"),
        );
        assert.equal(await readFile(outside, "utf8"), "outside");
        assert.ok((await readdir(root)).every((entry) => !entry.includes(".nextstep-tmp-")));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("update 在最终安装入口出现竞争写入时保留竞争者且拒绝覆盖", async () => {
  const root = await mkdtemp(join(tmpdir(), "nextstep-update-install-race-"));
  const target = join(root, "result.md");
  await writeFile(target, "before");
  let injected = false;
  const binding = {
    rename: async (oldPath: string, newPath: string) => {
      if (!injected) {
        injected = true;
        await writeFile(target, "competitor");
      }
      await nodeRename(oldPath, newPath);
    },
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }),
      (error: unknown) => ["EEXIST", "ESTALE"].includes((error as { code?: string })?.code ?? ""),
    );
    assert.equal(injected, true);
    assert.equal(await readFile(target, "utf8"), "competitor");
    assert.ok((await readdir(root)).every((entry) => !entry.includes(".nextstep-tmp-")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("最后父路径复核后替换 symlink 时 temp 在任意时刻都不落到根外", async () => {
  const originalCwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "nextstep-temp-anchor-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nextstep-temp-anchor-outside-"));
  const parent = join(root, "docs");
  const originalParent = join(root, "docs-original");
  await mkdir(parent);
  let injected = false;
  const outsideSnapshots: string[][] = [];
  const binding = {
    open: async (path: string, flags: string, mode: number) => {
      if (!injected && flags === "wx") {
        injected = true;
        await nodeRename(parent, originalParent);
        await symlink(outside, parent, "dir");
      }
      const handle = await nodeOpen(path, flags, mode);
      if (flags === "wx") {
        outsideSnapshots.push(await readdir(outside));
      }
      return handle;
    },
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    await assert.rejects(
      fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }),
      hasCode("WRITE_ACCESS_BLOCKED"),
    );
    assert.equal(injected, true);
    assert.deepEqual(outsideSnapshots, [[]]);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("removeCreated 的父目录被替换为 symlink 时绝不删除根外竞争者", async () => {
  const originalCwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "nextstep-remove-anchor-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nextstep-remove-anchor-outside-"));
  const parent = join(root, "docs");
  const originalParent = join(root, "docs-original");
  const target = join(parent, "result.md");
  await mkdir(parent);
  await writeFile(target, "owned");
  await writeFile(join(outside, "result.md"), "outside-competitor");
  let injected = false;

  const injectParentSwap = async (): Promise<void> => {
    if (!injected) {
      injected = true;
      await nodeRename(parent, originalParent);
      await symlink(outside, parent, "dir");
    }
  };
  const binding = {
    rename: async (oldPath: string, newPath: string) => {
      await injectParentSwap();
      await nodeRename(oldPath, newPath);
    },
    unlink: async (path: string) => {
      await injectParentSwap();
      await unlink(path);
    },
  } as Partial<NodeWriteFileSystemBinding>;

  try {
    const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
    try {
      await fileSystem.removeCreated("docs/result.md", digest("owned"));
    } catch (error) {
      assert.equal(
        ["WRITE_ACCESS_BLOCKED", "EEXIST", "ESTALE"].includes((error as { code?: string })?.code ?? ""),
        true,
      );
    }
    assert.equal(injected, true);
    assert.equal(await readFile(join(outside, "result.md"), "utf8"), "outside-competitor");
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("update 的 no-replace 恢复路径与 remove 摘要归属均 fail closed", async (t) => {
  await t.test("update 安装位被竞争者占据时保留竞争者与可恢复旧对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-update-recovery-"));
    const target = join(root, "docs", "result.md");
    await mkdir(join(root, "docs"));
    await writeFile(target, "before");
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!injected && newPath === "result.md") {
          injected = true;
          await writeFile(target, "competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "EEXIST");
      assert.match(error?.recovery_path ?? "", /^docs\/result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(target, "utf8"), "competitor");
      const entries = await readdir(join(root, "docs"));
      const recovery = entries.find((entry) => entry.includes(".nextstep-recovery-"));
      assert.ok(recovery);
      assert.equal(await readFile(join(root, "docs", recovery), "utf8"), "before");
      assert.ok(entries.every((entry) => !entry.includes(".nextstep-tmp-")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("remove 在 quarantine 复核漂移时恢复摘要匹配对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-remove-recheck-"));
    const target = join(root, "result.md");
    await writeFile(target, "owned");
    const binding = {
      readFile: async (path: string) => path.includes(".nextstep-recovery-")
        ? Buffer.from("drifted")
        : readFile(path),
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.removeCreated("result.md", digest("owned")),
        hasCode("ESTALE"),
      );
      assert.equal(await readFile(target, "utf8"), "owned");
      assert.deepEqual(await readdir(root), ["result.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("remove 对缺失、摘要漂移和成功删除分别给出确定性结果", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-remove-digest-"));
    const target = join(root, "result.md");
    await writeFile(target, "competitor");

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root }));
      await assert.rejects(fileSystem.removeCreated("missing.md", digest("owned")), hasCode("ENOENT"));
      await assert.rejects(fileSystem.removeCreated("result.md", digest("owned")), hasCode("ESTALE"));
      assert.equal(await readFile(target, "utf8"), "competitor");
      await fileSystem.removeCreated("result.md", digest("competitor"));
      await assert.rejects(readFile(target), hasCode("ENOENT"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("cwd 锚定后的 realpath 故障在创建 temp 前阻塞", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-anchor-realpath-"));
    const binding = {
      realpath: async (path: string) => {
        if (path === ".") {
          const error = new Error("injected anchored realpath fault") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
        return nodeRealpath(path);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), { mode: "create", before_digest: null }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("update 的 recovery 清理无效时保留恢复对象并拒绝成功", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-cleanup-"));
    const target = join(root, "result.md");
    await writeFile(target, "before");
    const binding = {
      unlink: async (path: string) => {
        if (!path.includes(".nextstep-recovery-")) {
          await unlink(path);
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(target, "utf8"), "nextstep");
      assert.equal((await readdir(root)).filter((entry) => entry.includes(".nextstep-recovery-")).length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("remove 的 legacy 与显式摘要入口都拒绝非文件对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-remove-nonfile-"));
    await mkdir(join(root, "legacy-dir"));
    await mkdir(join(root, "explicit-dir"));

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root }));
      await assert.rejects(
        fileSystem.removeCreated("legacy-dir", digest("unused")),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
      const legacyWriter = fileSystem as unknown as { removeCreated(path: string): Promise<void> };
      await assert.rejects(legacyWriter.removeCreated("explicit-dir"), hasCode("WRITE_ACCESS_BLOCKED"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("恢复生命周期的最晚竞态保留 cwd 身份、竞争者与可定位对象", async (t) => {
  await t.test("调用 cwd 是目标父目录时路径替换后仍恢复原目录身份", async () => {
    const suiteCwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), "nextstep-cwd-identity-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-cwd-identity-outside-"));
    const parent = join(root, "docs");
    const originalParent = join(root, "docs-original");
    await mkdir(parent);
    let injected = false;
    const binding = {
      open: async (path: string, flags: string, mode: number) => {
        if (!injected && flags === "wx") {
          injected = true;
          await nodeRename(parent, originalParent);
          await symlink(outside, parent, "dir");
        }
        return nodeOpen(path, flags, mode);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      process.chdir(parent);
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
      assert.equal(injected, true);
      assert.equal(await nodeRealpath("."), await nodeRealpath(originalParent));
      assert.notEqual(await nodeRealpath("."), await nodeRealpath(outside));
      assert.deepEqual(await readdir(outside), []);
    } finally {
      process.chdir(suiteCwd);
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  for (const operation of ["update", "remove"] as const) {
    await t.test(`${operation} 在 unlink(recovery) 入口改写对象时保留竞争者`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-${operation}-recovery-race-`));
      const target = join(root, "result.md");
      await writeFile(target, operation === "update" ? "before" : "owned");
      let injected = false;
      const binding = {
        unlink: async (path: string) => {
          if (!injected && path.includes(".nextstep-recovery-")) {
            injected = true;
            await writeFile(path, "competitor");
          }
          await unlink(path);
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const outcome = operation === "update"
          ? fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
              mode: "update",
              before_digest: digest("before"),
            })
          : fileSystem.removeCreated("result.md", digest("owned"));
        const error = await outcome.then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
        );
        assert.equal(error?.code, "ESTALE");
        assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
        assert.equal(injected, true);
        assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "competitor");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  await t.test("update 安装后 target 在 recovery 清理入口漂移时保留 before 对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-update-target-cleanup-race-"));
    const target = join(root, "result.md");
    await writeFile(target, "before");
    let injected = false;
    const binding = {
      unlink: async (path: string) => {
        if (!injected && path.includes(".nextstep-recovery-")) {
          injected = true;
          await writeFile("result.md", "competitor");
        }
        await unlink(path);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(target, "utf8"), "competitor");
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "before");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const mode of ["create", "update"] as const) {
    await t.test(`${mode} 的 temp unlink 持续 EPERM 时返回可定位 recovery_path`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-${mode}-temp-cleanup-`));
      const target = join(root, "docs", "result.md");
      await mkdir(join(root, "docs"));
      if (mode === "update") {
        await writeFile(target, "before");
      }
      const binding = {
        unlink: async (path: string) => {
          if (path.includes(".nextstep-tmp-")) {
            const error = new Error("injected persistent temp cleanup failure") as NodeJS.ErrnoException;
            error.code = "EPERM";
            throw error;
          }
          await unlink(path);
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), mode === "create"
          ? { mode: "create", before_digest: null }
          : { mode: "update", before_digest: digest("before") }).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
        );
        assert.equal(error?.code, "EPERM");
        assert.match(error?.recovery_path ?? "", /^docs\/result\.md\.nextstep-tmp-/);
        assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "nextstep");
        if (mode === "update") {
          const recovery = (await readdir(join(root, "docs")))
            .find((entry) => entry.includes(".nextstep-recovery-"));
          assert.ok(recovery);
          assert.equal(await readFile(join(root, "docs", recovery), "utf8"), "before");
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  await t.test("调用 cwd 位于目标父目录子树时在写入前 fail closed", async () => {
    const suiteCwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), "nextstep-nested-cwd-root-"));
    const parent = join(root, "docs");
    const nested = join(parent, "nested");
    await mkdir(nested, { recursive: true });

    try {
      process.chdir(nested);
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root }));
      await assert.rejects(
        fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }),
        hasCode("WRITE_ACCESS_BLOCKED"),
      );
      assert.deepEqual(await readdir(parent), ["nested"]);
    } finally {
      process.chdir(suiteCwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("temp 在 cleanup 预检时变成目录则保留对象并返回定位路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-temp-type-race-"));
    let injected = false;
    const binding = {
      lstat: async (path: string) => {
        if (!injected && path.includes(".nextstep-tmp-")) {
          injected = true;
          await unlink(path);
          await mkdir(path);
        }
        return nodeLstat(path);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-tmp-/);
      assert.equal((await nodeLstat(join(root, error!.recovery_path!))).isDirectory(), true);
      assert.equal(await readFile(join(root, "result.md"), "utf8"), "nextstep");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("首选 recovery 被占据时保留占据者并使用 no-replace 备用路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-fallback-"));
    await writeFile(join(root, "result.md"), "owned");
    let unlinkInjected = false;
    let preferredOccupied = false;
    const binding = {
      unlink: async (path: string) => {
        if (!unlinkInjected && path.includes(".nextstep-recovery-")) {
          unlinkInjected = true;
          await writeFile(path, "mutated-at-unlink");
        }
        await unlink(path);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (
          unlinkInjected &&
          !preferredOccupied &&
          flags === "wx" &&
          path.includes(".nextstep-recovery-") &&
          !path.includes(".nextstep-recovered-")
        ) {
          preferredOccupied = true;
          await writeFile(path, "preferred-occupant", { flag: "wx" });
        }
        return nodeOpen(path, flags, mode);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /\.nextstep-recovery-.*\.nextstep-recovered-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "mutated-at-unlink");
      const preferred = (await readdir(root))
        .find((entry) => entry.includes(".nextstep-recovery-") && !entry.includes(".nextstep-recovered-"));
      assert.ok(preferred);
      assert.equal(await readFile(join(root, preferred), "utf8"), "preferred-occupant");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("temp cleanup 的目录项与打开对象身份不一致时拒绝删除", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-temp-identity-race-"));
    const binding = {
      lstat: async (path: string) => {
        const stats = await nodeLstat(path);
        if (!path.includes(".nextstep-tmp-")) {
          return stats;
        }
        return {
          isFile: () => stats.isFile(),
          isSymbolicLink: () => stats.isSymbolicLink(),
          isDirectory: () => stats.isDirectory(),
          mode: stats.mode,
          dev: stats.dev + 1,
          ino: stats.ino,
        };
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-tmp-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "nextstep");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("竞争 recovery 重建 fsync 失败时仍保留并定位已写对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-persist-fsync-"));
    await writeFile(join(root, "result.md"), "owned");
    let unlinkInjected = false;
    let recoveryOpened = false;
    const binding = {
      unlink: async (path: string) => {
        if (!unlinkInjected && path.includes(".nextstep-recovery-")) {
          unlinkInjected = true;
          await writeFile(path, "competitor");
        }
        await unlink(path);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (unlinkInjected && flags === "wx" && path.includes(".nextstep-recovery-")) {
          recoveryOpened = true;
        }
        return nodeOpen(path, flags, mode);
      },
      fsync: async (fd: number) => {
        if (recoveryOpened) {
          const error = new Error("injected recovery fsync failure") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
        const handle = await nodeOpen(".", "r");
        try {
          assert.notEqual(fd, handle.fd);
        } finally {
          await handle.close();
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "EIO");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "competitor");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
