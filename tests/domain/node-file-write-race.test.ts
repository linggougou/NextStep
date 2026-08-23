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

  await t.test("update cleanup 不调用可注入的 binding.unlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-cleanup-"));
    const target = join(root, "result.md");
    await writeFile(target, "before");
    let unlinkCalls = 0;
    const binding = {
      unlink: async () => {
        unlinkCalls += 1;
        throw new Error("binding.unlink must not be used");
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "update",
        before_digest: digest("before"),
      });
      assert.equal(unlinkCalls, 0);
      assert.equal(await readFile(target, "utf8"), "nextstep");
      assert.deepEqual(await readdir(root), ["result.md"]);
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
    await t.test(`${operation} cleanup 不调用可注入的 binding.unlink`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-${operation}-recovery-race-`));
      const target = join(root, "result.md");
      await writeFile(target, operation === "update" ? "before" : "owned");
      let unlinkCalls = 0;
      const binding = {
        unlink: async () => {
          unlinkCalls += 1;
          throw new Error("binding.unlink must not be used");
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        if (operation === "update") {
          await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
              mode: "update",
              before_digest: digest("before"),
            });
          assert.equal(await readFile(target, "utf8"), "nextstep");
        } else {
          await fileSystem.removeCreated("result.md", digest("owned"));
          await assert.rejects(readFile(target), hasCode("ENOENT"));
        }
        assert.equal(unlinkCalls, 0);
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
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (
          !injected &&
          existingPath.includes(".nextstep-recovery-") &&
          newPath.includes(".nextstep-quarantine-")
        ) {
          injected = true;
          await writeFile(target, "competitor");
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
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(target, "utf8"), "competitor");
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "before");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const mode of ["create", "update"] as const) {
    await t.test(`${mode} 的 temp quarantine link 返回 EPERM 时定位已绑定对象`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-${mode}-temp-cleanup-`));
      const target = join(root, "docs", "result.md");
      await mkdir(join(root, "docs"));
      if (mode === "update") {
        await writeFile(target, "before");
      }
      const binding = {
        link: async (existingPath: string, newPath: string) => {
          await nodeLink(existingPath, newPath);
          if (existingPath.includes(".nextstep-tmp-") && newPath.includes(".nextstep-quarantine-")) {
            const error = new Error("injected persistent temp cleanup failure") as NodeJS.ErrnoException;
            error.code = "EPERM";
            throw error;
          }
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
        assert.match(error?.recovery_path ?? "", /^docs\/result\.md\.nextstep-tmp-.*\.nextstep-quarantine-/);
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

  await t.test("temp 在 quarantine link 前变成目录时从打开句柄保留 fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-temp-type-race-"));
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await unlink(existingPath);
          await mkdir(existingPath);
        }
        await nodeLink(existingPath, newPath);
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
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-tmp-.*\.nextstep-recovered-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "nextstep");
      assert.equal(injected, true);
      assert.equal(await readFile(join(root, "result.md"), "utf8"), "nextstep");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("首选 recovery 被占据时保留占据者并使用 no-replace 备用路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-fallback-"));
    await writeFile(join(root, "result.md"), "owned");
    let linkInjected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (
          !linkInjected &&
          existingPath.includes(".nextstep-recovery-") &&
          newPath.includes(".nextstep-quarantine-")
        ) {
          linkInjected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "preferred-occupant", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
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
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "owned");
      assert.equal(linkInjected, true);
      const preferred = (await readdir(root))
        .find((entry) => entry.includes(".nextstep-recovery-") && !entry.includes(".nextstep-recovered-"));
      assert.ok(preferred);
      assert.equal(await readFile(join(root, preferred), "utf8"), "preferred-occupant");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("temp quarantine 后原名身份变化时定位 hardlink 对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-temp-identity-race-"));
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "competitor", { flag: "wx" });
        }
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
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-tmp-.*\.nextstep-quarantine-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "nextstep");
      assert.equal(injected, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("竞争 recovery 重建 fsync 失败时仍保留并定位已写对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-recovery-persist-fsync-"));
    await writeFile(join(root, "result.md"), "owned");
    let linkInjected = false;
    let recoveryOpened = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (
          !linkInjected &&
          existingPath.includes(".nextstep-recovery-") &&
          newPath.includes(".nextstep-quarantine-")
        ) {
          linkInjected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (linkInjected && flags === "wx" && path.includes(".nextstep-recovered-")) {
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
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-.*\.nextstep-recovered-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "owned");
      assert.equal(linkInjected, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("hardlink-quarantine cleanup 绑定真实对象且 locator 不指向旧词法路径", async (t) => {
  await t.test("link 已完成后替换原名时保留竞争者并以 quarantine 定位事务对象", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-quarantine-post-link-"));
    await writeFile(join(root, "result.md"), "owned");
    let injected = false;
    let bindingUnlinkCalls = 0;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "competitor", { flag: "wx" });
        }
      },
      unlink: async () => {
        bindingUnlinkCalls += 1;
        const error = new Error("binding.unlink must not be a trusted cleanup primitive") as NodeJS.ErrnoException;
        error.code = "EUNTRUSTED";
        throw error;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /\.nextstep-quarantine-/);
      assert.equal(injected, true);
      assert.equal(bindingUnlinkCalls, 0);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "owned");
      const competitor = (await readdir(root))
        .find((entry) => entry.includes(".nextstep-recovery-") && !entry.includes(".nextstep-quarantine-"));
      assert.ok(competitor);
      assert.equal(await readFile(join(root, competitor), "utf8"), "competitor");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("替换原名后才 link 时保留两份竞争者并从原始句柄创建 fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-quarantine-pre-link-"));
    await writeFile(join(root, "result.md"), "owned");
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /\.nextstep-(?:recovered|fallback)-/);
      assert.equal(injected, true);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "owned");
      const entries = await readdir(root);
      const quarantine = entries.find((entry) => entry.includes(".nextstep-quarantine-"));
      const currentName = entries.find((entry) => entry.includes(".nextstep-recovery-") && entry !== quarantine);
      assert.ok(quarantine);
      assert.ok(currentName);
      assert.equal(await readFile(join(root, quarantine), "utf8"), "competitor");
      assert.equal(await readFile(join(root, currentName), "utf8"), "competitor");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("update 的 recovery hardlink 返回前 target 漂移时保留 before quarantine", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-quarantine-update-invariant-"));
    const target = join(root, "result.md");
    await writeFile(target, "before");
    let injected = false;
    let bindingUnlinkCalls = 0;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (
          !injected &&
          existingPath.includes(".nextstep-recovery-") &&
          newPath.includes(".nextstep-quarantine-")
        ) {
          injected = true;
          await writeFile("result.md", "competitor");
        }
      },
      unlink: async () => {
        bindingUnlinkCalls += 1;
        const error = new Error("binding.unlink must not run") as NodeJS.ErrnoException;
        error.code = "EUNTRUSTED";
        throw error;
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
      assert.match(error?.recovery_path ?? "", /\.nextstep-quarantine-/);
      assert.equal(injected, true);
      assert.equal(bindingUnlinkCalls, 0);
      assert.equal(await readFile(target, "utf8"), "competitor");
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "before");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("父目录根内改名后 recovery_path 使用实时 anchored parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-live-locator-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-live-locator-outside-"));
    const parent = join(root, "docs");
    const movedParent = join(root, "docs-original");
    await mkdir(parent);
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await nodeRename(parent, movedParent);
          await symlink(outside, parent, "dir");
          const error = new Error("injected post-link parent move") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "EIO");
      assert.match(error?.recovery_path ?? "", /^docs-original\//);
      assert.equal(injected, true);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "nextstep");
      assert.deepEqual(await readdir(outside), []);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  await t.test("anchored parent 移到 canonical root 外时保留对象且不伪造 recovery_path", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-outside-locator-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-outside-locator-parent-"));
    const parent = join(root, "docs");
    const movedParent = join(outside, "docs-moved");
    await mkdir(parent);
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await nodeRename(parent, movedParent);
          const error = new Error("injected root escape after quarantine link") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "anchor-outside-canonical-root");
      assert.equal(injected, true);
      assert.ok((await readdir(movedParent)).some((entry) => entry.includes(".nextstep-")));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  await t.test("cleanup 打开对象的摘要与归属摘要不一致时保留原名并定位", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-cleanup-digest-drift-"));
    await writeFile(join(root, "result.md"), "owned");
    const binding = {
      rename: async (oldPath: string, newPath: string) => {
        await nodeRename(oldPath, newPath);
        await writeFile(newPath, "drifted");
      },
      readFile: async (path: string) => path.includes(".nextstep-recovery-")
        ? Buffer.from("owned")
        : readFile(path),
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
      );
      assert.equal(error?.code, "ESTALE");
      assert.match(error?.recovery_path ?? "", /^result\.md\.nextstep-recovery-/);
      assert.equal(await readFile(join(root, error!.recovery_path!), "utf8"), "drifted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const openFailure of ["access", "exhausted"] as const) {
    await t.test(`fallback no-replace open ${openFailure} 时 fail closed`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-fallback-open-${openFailure}-`));
      await writeFile(join(root, "result.md"), "owned");
      let cleanupLinkInjected = false;
      const binding = {
        link: async (existingPath: string, newPath: string) => {
          if (!cleanupLinkInjected && newPath.includes(".nextstep-quarantine-")) {
            cleanupLinkInjected = true;
            await unlink(existingPath);
            await writeFile(existingPath, "competitor", { flag: "wx" });
          }
          await nodeLink(existingPath, newPath);
        },
        open: async (path: string, flags: string, mode: number) => {
          if (cleanupLinkInjected && flags === "wx" && path.includes(".nextstep-recovered-")) {
            if (openFailure === "exhausted") {
              await writeFile(path, "candidate-occupant", { flag: "wx" });
              return nodeOpen(path, flags, mode);
            }
            const error = new Error("injected fallback access failure") as NodeJS.ErrnoException;
            error.code = "EACCES";
            throw error;
          }
          return nodeOpen(path, flags, mode);
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException,
        );
        assert.equal(error?.code, openFailure === "exhausted" ? "EEXIST" : "EACCES");
        assert.equal(cleanupLinkInjected, true);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  for (const stage of ["write", "write-close", "fsync", "verify"] as const) {
    await t.test(`fallback ${stage} 失败时 recovery_path 指向实际 candidate`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-fallback-${stage}-`));
      await writeFile(join(root, "result.md"), "owned");
      let cleanupLinkInjected = false;
      let candidatePath: string | undefined;
      let injectedHandle: Awaited<ReturnType<typeof nodeOpen>> | undefined;
      const binding = {
        link: async (existingPath: string, newPath: string) => {
          if (!cleanupLinkInjected && newPath.includes(".nextstep-quarantine-")) {
            cleanupLinkInjected = true;
            await unlink(existingPath);
            await writeFile(existingPath, "competitor", { flag: "wx" });
          }
          await nodeLink(existingPath, newPath);
        },
        open: async (path: string, flags: string, mode: number) => {
          const handle = await nodeOpen(path, flags, mode);
          if (!cleanupLinkInjected || flags !== "wx") {
            return handle;
          }
          candidatePath = path;
          if (stage === "write-close") {
            injectedHandle = handle;
          }
          return new Proxy(handle, {
            get(targetHandle, property) {
              if (property === "writeFile" && (stage === "write" || stage === "write-close")) {
                return async () => {
                  await targetHandle.writeFile("partial-fallback");
                  const error = new Error("injected fallback write failure") as NodeJS.ErrnoException;
                  error.code = "EIO";
                  throw error;
                };
              }
              if (property === "close" && stage === "write-close") {
                return async () => {
                  const error = new Error("injected fallback close failure") as NodeJS.ErrnoException;
                  error.code = "EIO";
                  throw error;
                };
              }
              if (property === "close" && stage === "verify") {
                return async () => {
                  await targetHandle.close();
                  await writeFile(path, "verify-drift");
                };
              }
              const value = Reflect.get(targetHandle, property, targetHandle) as unknown;
              return typeof value === "function" ? value.bind(targetHandle) : value;
            },
          });
        },
        fsync: async () => {
          if (stage === "fsync" && candidatePath !== undefined) {
            const error = new Error("injected fallback fsync failure") as NodeJS.ErrnoException;
            error.code = "EIO";
            throw error;
          }
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path?: string },
        );
        assert.ok(candidatePath);
        assert.equal(error?.recovery_path, candidatePath);
        assert.equal(await nodeLstat(join(root, candidatePath)).then(() => true), true);
      } finally {
        if (injectedHandle !== undefined) {
          await injectedHandle.close();
        }
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("attempt8 locator 身份与 rootEscaped 熔断", async (t) => {
  await t.test("primary temp 的 wx 返回前名称被替换时不把竞争者报告为 recovery_path", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-primary-open-replace-"));
    let injected = false;
    let replacedPath = "";
    const binding = {
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (!injected && flags === "wx" && path.includes(".nextstep-tmp-")) {
          injected = true;
          replacedPath = path;
          await unlink(path);
          await writeFile(path, "primary-competitor", { flag: "wx" });
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(injected, true);
      assert.equal(error?.code, "ESTALE");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-identity-changed");
      assert.equal(await readFile(join(root, replacedPath), "utf8"), "primary-competitor");
      assert.equal(await readFile(join(root, "result.md"), "utf8"), "primary-competitor");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("fallback candidate 的 wx 返回前名称被替换时不把竞争者报告为 recovery_path", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-fallback-open-replace-"));
    await writeFile(join(root, "result.md"), "owned");
    let cleanupLinkInjected = false;
    let fallbackOpenInjected = false;
    let fallbackPath = "";
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!cleanupLinkInjected && newPath.includes(".nextstep-quarantine-")) {
          cleanupLinkInjected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "cleanup-competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (
          cleanupLinkInjected &&
          !fallbackOpenInjected &&
          flags === "wx" &&
          path.includes(".nextstep-recovered-")
        ) {
          fallbackOpenInjected = true;
          fallbackPath = path;
          await unlink(path);
          await writeFile(path, "fallback-competitor", { flag: "wx" });
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(cleanupLinkInjected, true);
      assert.equal(fallbackOpenInjected, true);
      assert.equal(error?.code, "ESTALE");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-identity-changed");
      assert.equal(await readFile(join(root, fallbackPath), "utf8"), "fallback-competitor");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("fallback candidate 的 wx 返回前名称消失时明确报告 candidate-unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-fallback-open-missing-"));
    await writeFile(join(root, "result.md"), "owned");
    let cleanupLinkInjected = false;
    let fallbackOpenInjected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!cleanupLinkInjected && newPath.includes(".nextstep-quarantine-")) {
          cleanupLinkInjected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "cleanup-competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (
          cleanupLinkInjected &&
          !fallbackOpenInjected &&
          flags === "wx" &&
          path.includes(".nextstep-recovered-")
        ) {
          fallbackOpenInjected = true;
          await unlink(path);
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(cleanupLinkInjected, true);
      assert.equal(fallbackOpenInjected, true);
      assert.equal(error?.code, "ENOENT");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("fallback wx 已创建但无法取得 regular 身份证明时 fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-fallback-proof-unavailable-"));
    await writeFile(join(root, "result.md"), "owned");
    let cleanupLinkInjected = false;
    let proofInjected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!cleanupLinkInjected && newPath.includes(".nextstep-quarantine-")) {
          cleanupLinkInjected = true;
          await unlink(existingPath);
          await writeFile(existingPath, "cleanup-competitor", { flag: "wx" });
        }
        await nodeLink(existingPath, newPath);
      },
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (
          cleanupLinkInjected &&
          !proofInjected &&
          flags === "wx" &&
          path.includes(".nextstep-recovered-")
        ) {
          proofInjected = true;
          return new Proxy(handle, {
            get(targetHandle, property) {
              if (property === "stat") {
                return async () => ({ isFile: () => false });
              }
              const value = Reflect.get(targetHandle, property, targetHandle) as unknown;
              return typeof value === "function" ? value.bind(targetHandle) : value;
            },
          });
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(cleanupLinkInjected, true);
      assert.equal(proofInjected, true);
      assert.equal(error?.code, "ESTALE");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-proof-unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("首轮 cleanup 将 parent 移到 root 外后 outer catch 不再产生目录项副作用", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-root-escape-fuse-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-root-escape-fuse-outside-"));
    const parent = join(root, "docs");
    const movedParent = join(outside, "docs-moved");
    await mkdir(parent);
    let escaped = false;
    let afterEscapeLinkCalls = 0;
    let firstFailureEntries: string[] = [];
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (escaped) {
          afterEscapeLinkCalls += 1;
          await nodeLink(existingPath, newPath);
          return;
        }
        await nodeLink(existingPath, newPath);
        if (newPath.includes(".nextstep-quarantine-")) {
          await nodeRename(parent, movedParent);
          escaped = true;
          firstFailureEntries = (await readdir(movedParent)).sort();
          const error = new Error("injected first cleanup root escape") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "anchor-outside-canonical-root");
      assert.equal(afterEscapeLinkCalls, 0);
      assert.deepEqual((await readdir(movedParent)).sort(), firstFailureEntries);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  for (const operation of ["update", "remove"] as const) {
    await t.test(`${operation} recovery cleanup 根外熔断后不恢复或继续清理`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-${operation}-escape-fuse-root-`));
      const outside = await mkdtemp(join(tmpdir(), `nextstep-${operation}-escape-fuse-outside-`));
      const parent = join(root, "docs");
      const movedParent = join(outside, "docs-moved");
      await mkdir(parent);
      await writeFile(join(parent, "result.md"), operation === "update" ? "before" : "owned");
      let escaped = false;
      let afterEscapeLinkCalls = 0;
      let firstFailureEntries: string[] = [];
      const binding = {
        link: async (existingPath: string, newPath: string) => {
          if (escaped) {
            afterEscapeLinkCalls += 1;
            await nodeLink(existingPath, newPath);
            return;
          }
          await nodeLink(existingPath, newPath);
          if (
            existingPath.includes(".nextstep-recovery-") &&
            newPath.includes(".nextstep-quarantine-")
          ) {
            await nodeRename(parent, movedParent);
            escaped = true;
            firstFailureEntries = (await readdir(movedParent)).sort();
            const error = new Error("injected recovery cleanup root escape") as NodeJS.ErrnoException;
            error.code = "EIO";
            throw error;
          }
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const outcome = operation === "update"
          ? fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
              mode: "update",
              before_digest: digest("before"),
            })
          : fileSystem.removeCreated("docs/result.md", digest("owned"));
        const error = await outcome.then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path_unavailable?: string },
        );
        assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
        assert.equal(error?.recovery_path_unavailable, "anchor-outside-canonical-root");
        assert.equal(afterEscapeLinkCalls, 0);
        assert.deepEqual((await readdir(movedParent)).sort(), firstFailureEntries);
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    });
  }

  await t.test("update restore 入口发现 parent 根外后熔断且不 link", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-restore-escape-fuse-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-restore-escape-fuse-outside-"));
    const parent = join(root, "docs");
    const movedParent = join(outside, "docs-moved");
    await mkdir(parent);
    await writeFile(join(parent, "result.md"), "before");
    let escaped = false;
    let afterEscapeLinkCalls = 0;
    let firstFailureEntries: string[] = [];
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (escaped) {
          afterEscapeLinkCalls += 1;
          await nodeLink(existingPath, newPath);
          return;
        }
        if (newPath === "result.md" && existingPath.includes(".nextstep-tmp-")) {
          await nodeRename(parent, movedParent);
          escaped = true;
          firstFailureEntries = (await readdir(movedParent)).sort();
          const error = new Error("injected install root escape") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
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
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path_unavailable?: string },
      );
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.equal(error?.recovery_path_unavailable, "anchor-outside-canonical-root");
      assert.equal(afterEscapeLinkCalls, 0);
      assert.deepEqual((await readdir(movedParent)).sort(), firstFailureEntries);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  await t.test("fallback 入口发现 parent 根外后熔断且不 open(wx)", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-fallback-escape-fuse-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-fallback-escape-fuse-outside-"));
    const parent = join(root, "docs");
    const movedParent = join(outside, "docs-moved");
    await mkdir(parent);
    await writeFile(join(parent, "result.md"), "owned");
    let escaped = false;
    let afterEscapeWxCalls = 0;
    let firstFailureEntries: string[] = [];
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        if (!escaped && newPath.includes(".nextstep-quarantine-")) {
          await unlink(existingPath);
          await writeFile(existingPath, "competitor", { flag: "wx" });
          await nodeRename(parent, movedParent);
          escaped = true;
          await nodeLink(existingPath, newPath);
          firstFailureEntries = (await readdir(movedParent)).sort();
          return;
        }
        await nodeLink(existingPath, newPath);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (escaped && flags === "wx") {
          afterEscapeWxCalls += 1;
        }
        return nodeOpen(path, flags, mode);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.removeCreated("docs/result.md", digest("owned")).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path_unavailable?: string },
      );
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.equal(error?.recovery_path_unavailable, "anchor-outside-canonical-root");
      assert.equal(afterEscapeWxCalls, 0);
      assert.deepEqual((await readdir(movedParent)).sort(), firstFailureEntries);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test("attempt9 primary unavailable 与稳定覆盖余量", async (t) => {
  for (const mode of ["create", "update"] as const) {
    await t.test(`${mode} primary wx 返回前原名消失时保留 firstError 并报告 unavailable`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-primary-missing-${mode}-`));
      const target = join(root, "result.md");
      if (mode === "update") {
        await writeFile(target, "before");
      }
      const firstCause = { stage: `${mode}-install` };
      let firstError: (NodeJS.ErrnoException & { cause?: unknown; transaction_state?: string }) | undefined;
      let tempUnlinked = false;
      const binding = {
        open: async (path: string, flags: string, fileMode: number) => {
          const handle = await nodeOpen(path, flags, fileMode);
          if (!tempUnlinked && flags === "wx" && path.includes(".nextstep-tmp-")) {
            tempUnlinked = true;
            await unlink(path);
          }
          return handle;
        },
        link: async (existingPath: string, newPath: string) => {
          try {
            await nodeLink(existingPath, newPath);
          } catch (error) {
            if (newPath === "result.md" && existingPath.includes(".nextstep-tmp-")) {
              firstError = error as NodeJS.ErrnoException & { cause?: unknown; transaction_state?: string };
              firstError.cause = firstCause;
              firstError.transaction_state = "install-not-started";
            }
            throw error;
          }
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), mode === "create"
          ? { mode: "create", before_digest: null }
          : { mode: "update", before_digest: digest("before") }).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & {
            recovery_path?: string;
            recovery_path_unavailable?: string;
            transaction_state?: string;
          },
        );
        assert.equal(tempUnlinked, true);
        assert.ok(firstError);
        assert.equal(error, firstError);
        assert.equal(error?.code, "ENOENT");
        assert.equal(error?.cause, firstCause);
        assert.equal(error?.transaction_state, "install-not-started");
        assert.equal(error?.recovery_path, undefined);
        assert.equal(error?.recovery_path_unavailable, "candidate-unavailable");
        if (mode === "create") {
          await assert.rejects(readFile(target), hasCode("ENOENT"));
        } else {
          assert.equal(await readFile(target, "utf8"), "before");
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  await t.test("primary wx 已创建但 FileHandle 无 regular proof 时明确 proof-unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-primary-proof-unavailable-"));
    let injected = false;
    const binding = {
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (!injected && flags === "wx" && path.includes(".nextstep-tmp-")) {
          injected = true;
          return new Proxy(handle, {
            get(targetHandle, property) {
              if (property === "stat") {
                return async () => ({ isFile: () => false });
              }
              const value = Reflect.get(targetHandle, property, targetHandle) as unknown;
              return typeof value === "function" ? value.bind(targetHandle) : value;
            },
          });
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        },
      );
      assert.equal(injected, true);
      assert.equal(error?.code, "ESTALE");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-proof-unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("anchored cwd 被删除导致 live realpath 失败时单调熔断", async () => {
    const suiteCwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), "nextstep-live-realpath-missing-root-"));
    const outside = await mkdtemp(join(tmpdir(), "nextstep-live-realpath-missing-outside-"));
    const parent = join(root, "docs");
    const movedParent = join(outside, "docs-moved");
    await mkdir(parent);
    let injected = false;
    const binding = {
      link: async (existingPath: string, newPath: string) => {
        await nodeLink(existingPath, newPath);
        if (!injected && newPath.includes(".nextstep-quarantine-")) {
          injected = true;
          await nodeRename(parent, movedParent);
          await rm(movedParent, { recursive: true, force: true });
          const error = new Error("injected deleted anchored cwd") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("docs/result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & { recovery_path_unavailable?: string },
      );
      assert.equal(injected, true);
      assert.equal(error?.code, "WRITE_ACCESS_BLOCKED");
      assert.equal(error?.recovery_path_unavailable, "anchor-root-membership-unavailable");
    } finally {
      process.chdir(suiteCwd);
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  await t.test("显式 guard 对初始 lstat 故障、symlink 与目录目标 fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-initial-target-guards-"));
    const outside = join(root, "outside.md");
    await writeFile(outside, "outside");
    await symlink(outside, join(root, "link.md"));
    await mkdir(join(root, "directory"));
    const lstatError = new Error("injected target lstat failure") as NodeJS.ErrnoException;
    lstatError.code = "EIO";
    const binding = {
      lstat: async (path: string) => path === join(root, "fault.md") ? Promise.reject(lstatError) : nodeLstat(path),
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await assert.rejects(
        fileSystem.atomicWrite("fault.md", Buffer.from("nextstep"), {
          mode: "update",
          before_digest: digest("before"),
        }),
        (error: unknown) => error === lstatError,
      );
      for (const relativePath of ["link.md", "directory"] as const) {
        await assert.rejects(
          fileSystem.atomicWrite(relativePath, Buffer.from("nextstep"), {
            mode: "update",
            before_digest: digest("outside"),
          }),
          hasCode("WRITE_ACCESS_BLOCKED"),
        );
      }
      assert.equal(await readFile(outside, "utf8"), "outside");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("目录 fsync 后 close 失败不掩盖成功写入", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-directory-close-failure-"));
    let directoryHandle: Awaited<ReturnType<typeof nodeOpen>> | undefined;
    let closeInjected = false;
    const binding = {
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (path === "." && flags === "r") {
          directoryHandle = handle;
          return new Proxy(handle, {
            get(targetHandle, property) {
              if (property === "close") {
                return async () => {
                  closeInjected = true;
                  const error = new Error("injected directory close failure") as NodeJS.ErrnoException;
                  error.code = "EIO";
                  throw error;
                };
              }
              const value = Reflect.get(targetHandle, property, targetHandle) as unknown;
              return typeof value === "function" ? value.bind(targetHandle) : value;
            },
          });
        }
        return handle;
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      });
      assert.equal(closeInjected, true);
      assert.equal(await readFile(join(root, "result.md"), "utf8"), "nextstep");
    } finally {
      if (directoryHandle !== undefined) {
        await directoryHandle.close();
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("attempt10 open 未返回 proof 时禁止按 basename 推定归属", async (t) => {
  for (const replacement of ["created-empty", "same-content-competitor"] as const) {
    await t.test(`${replacement} 保留 firstError、目录项与 proof-unavailable`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-open-no-proof-${replacement}-`));
      const firstCause = { stage: `open-before-return:${replacement}` };
      const firstError = new Error(`injected open failure: ${replacement}`) as NodeJS.ErrnoException & {
        cause?: unknown;
        transaction_state?: string;
      };
      firstError.code = "EIO";
      firstError.cause = firstCause;
      firstError.transaction_state = "temp-open-uncertain";
      let injected = false;
      let primaryTempName: string | undefined;
      let entriesAtThrow: string[] = [];
      let cleanupLinkCalls = 0;
      let cleanupRenameCalls = 0;
      let cleanupUnlinkCalls = 0;
      let fallbackOpenCalls = 0;
      const binding = {
        open: async (path: string, flags: string, mode: number) => {
          if (!injected && flags === "wx" && path.includes(".nextstep-tmp-")) {
            const handle = await nodeOpen(path, flags, mode);
            await handle.close();
            injected = true;
            primaryTempName = path;
            if (replacement === "same-content-competitor") {
              await unlink(path);
              await writeFile(path, "nextstep", { flag: "wx" });
            }
            entriesAtThrow = (await readdir(".")).sort();
            throw firstError;
          }
          if (injected && flags === "wx") {
            fallbackOpenCalls += 1;
          }
          return nodeOpen(path, flags, mode);
        },
        link: async (existingPath: string, newPath: string) => {
          cleanupLinkCalls += 1;
          await nodeLink(existingPath, newPath);
        },
        rename: async (oldPath: string, newPath: string) => {
          cleanupRenameCalls += 1;
          await nodeRename(oldPath, newPath);
        },
        unlink: async (path: string) => {
          cleanupUnlinkCalls += 1;
          await unlink(path);
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & {
            recovery_path?: string;
            recovery_path_unavailable?: string;
            transaction_state?: string;
          },
        );
        assert.equal(injected, true);
        assert.ok(primaryTempName);
        assert.equal(error, firstError);
        assert.equal(error?.code, "EIO");
        assert.equal(error?.cause, firstCause);
        assert.equal(error?.transaction_state, "temp-open-uncertain");
        assert.equal(error?.recovery_path, undefined);
        assert.equal(error?.recovery_path_unavailable, "candidate-proof-unavailable");
        assert.deepEqual((await readdir(root)).sort(), entriesAtThrow);
        assert.equal(cleanupLinkCalls, 0);
        assert.equal(cleanupRenameCalls, 0);
        assert.equal(cleanupUnlinkCalls, 0);
        assert.equal(fallbackOpenCalls, 0);
        assert.equal(
          await readFile(join(root, primaryTempName), "utf8"),
          replacement === "created-empty" ? "" : "nextstep",
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("attempt11 openAttempted、proof 与 basename 真值表", async (t) => {
  for (const scenario of ["created-empty", "missing", "same-content-competitor", "native-eexist"] as const) {
    await t.test(`${scenario} attempted/noProof 零 basename query 与 cleanup`, async () => {
      const root = await mkdtemp(join(tmpdir(), `nextstep-open-truth-${scenario}-`));
      const firstCause = { stage: `open-attempted:${scenario}` };
      let firstError: (NodeJS.ErrnoException & { cause?: unknown; transaction_state?: string }) | undefined;
      let injected = false;
      let tempName: string | undefined;
      let entriesAtThrow: string[] = [];
      let tempLstatCalls = 0;
      let tempReadCalls = 0;
      let cleanupLinkCalls = 0;
      let cleanupRenameCalls = 0;
      let cleanupUnlinkCalls = 0;
      let fallbackOpenCalls = 0;
      const binding = {
        lstat: async (path: string) => {
          if (path.includes(".nextstep-tmp-")) {
            tempLstatCalls += 1;
          }
          return nodeLstat(path);
        },
        readFile: async (path: string) => {
          if (path.includes(".nextstep-tmp-")) {
            tempReadCalls += 1;
          }
          return readFile(path);
        },
        open: async (path: string, flags: string, mode: number) => {
          if (!injected && flags === "wx" && path.includes(".nextstep-tmp-")) {
            injected = true;
            tempName = path;
            if (scenario === "native-eexist") {
              await writeFile(path, "occupied", { flag: "wx" });
              try {
                return await nodeOpen(path, flags, mode);
              } catch (error) {
                firstError = error as NodeJS.ErrnoException & { cause?: unknown; transaction_state?: string };
              }
            } else {
              const handle = await nodeOpen(path, flags, mode);
              await handle.close();
              if (scenario === "missing") {
                await unlink(path);
              } else if (scenario === "same-content-competitor") {
                await unlink(path);
                await writeFile(path, "nextstep", { flag: "wx" });
              }
              firstError = new Error(`injected open failure: ${scenario}`) as NodeJS.ErrnoException & {
                cause?: unknown;
                transaction_state?: string;
              };
              firstError.code = "EIO";
            }
            firstError!.cause = firstCause;
            firstError!.transaction_state = "temp-open-uncertain";
            entriesAtThrow = (await readdir(".")).sort();
            throw firstError;
          }
          if (injected && flags === "wx") {
            fallbackOpenCalls += 1;
          }
          return nodeOpen(path, flags, mode);
        },
        link: async (existingPath: string, newPath: string) => {
          cleanupLinkCalls += 1;
          await nodeLink(existingPath, newPath);
        },
        rename: async (oldPath: string, newPath: string) => {
          cleanupRenameCalls += 1;
          await nodeRename(oldPath, newPath);
        },
        unlink: async (path: string) => {
          cleanupUnlinkCalls += 1;
          await unlink(path);
        },
      } as Partial<NodeWriteFileSystemBinding>;

      try {
        const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
        const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
          mode: "create",
          before_digest: null,
        }).then(
          () => undefined,
          (caught: unknown) => caught as NodeJS.ErrnoException & {
            recovery_path?: string;
            recovery_path_unavailable?: string;
            transaction_state?: string;
          },
        );
        assert.equal(injected, true);
        assert.ok(firstError);
        assert.ok(tempName);
        assert.equal(error, firstError);
        assert.equal(error?.code, scenario === "native-eexist" ? "EEXIST" : "EIO");
        assert.equal(error?.cause, firstCause);
        assert.equal(error?.transaction_state, "temp-open-uncertain");
        assert.equal(error?.recovery_path, undefined);
        assert.equal(error?.recovery_path_unavailable, "candidate-proof-unavailable");
        assert.equal(tempLstatCalls, 0);
        assert.equal(tempReadCalls, 0);
        assert.equal(cleanupLinkCalls, 0);
        assert.equal(cleanupRenameCalls, 0);
        assert.equal(cleanupUnlinkCalls, 0);
        assert.equal(fallbackOpenCalls, 0);
        assert.deepEqual((await readdir(root)).sort(), entriesAtThrow);
        if (scenario !== "missing") {
          assert.equal(
            await readFile(join(root, tempName), "utf8"),
            scenario === "created-empty" ? "" : scenario === "native-eexist" ? "occupied" : "nextstep",
          );
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  await t.test("open 未 attempted 的前置失败保持 exact error 且无 locator", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-open-not-attempted-"));
    const firstCause = { stage: "target-guard" };
    const firstError = new Error("injected pre-open target guard") as NodeJS.ErrnoException & {
      cause?: unknown;
      transaction_state?: string;
    };
    firstError.code = "EIO";
    firstError.cause = firstCause;
    firstError.transaction_state = "precondition";
    let wxOpenCalls = 0;
    let tempLstatCalls = 0;
    const binding = {
      lstat: async (path: string) => {
        if (path.includes(".nextstep-tmp-")) {
          tempLstatCalls += 1;
        }
        if (path === join(root, "result.md")) {
          throw firstError;
        }
        return nodeLstat(path);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (flags === "wx") {
          wxOpenCalls += 1;
        }
        return nodeOpen(path, flags, mode);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
          transaction_state?: string;
        },
      );
      assert.equal(error, firstError);
      assert.equal(error?.code, "EIO");
      assert.equal(error?.cause, firstCause);
      assert.equal(error?.transaction_state, "precondition");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, undefined);
      assert.equal(wxOpenCalls, 0);
      assert.equal(tempLstatCalls, 0);
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("FileHandle 返回但 proofFromHandle 失败时 close 后零 basename cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-proof-capture-failure-"));
    const firstCause = { stage: "proof-from-handle" };
    const firstError = new Error("injected handle stat failure") as NodeJS.ErrnoException & {
      cause?: unknown;
      transaction_state?: string;
    };
    firstError.code = "EIO";
    firstError.cause = firstCause;
    firstError.transaction_state = "proof-pending";
    let handleClosed = false;
    let tempName: string | undefined;
    let entriesAtFailure: string[] = [];
    let tempLstatCalls = 0;
    let cleanupLinkCalls = 0;
    const binding = {
      lstat: async (path: string) => {
        if (path.includes(".nextstep-tmp-")) {
          tempLstatCalls += 1;
        }
        return nodeLstat(path);
      },
      open: async (path: string, flags: string, mode: number) => {
        const handle = await nodeOpen(path, flags, mode);
        if (flags === "wx" && path.includes(".nextstep-tmp-")) {
          tempName = path;
          entriesAtFailure = (await readdir(".")).sort();
          return new Proxy(handle, {
            get(targetHandle, property) {
              if (property === "stat") {
                return async () => {
                  throw firstError;
                };
              }
              if (property === "close") {
                return async () => {
                  handleClosed = true;
                  await targetHandle.close();
                };
              }
              const value = Reflect.get(targetHandle, property, targetHandle) as unknown;
              return typeof value === "function" ? value.bind(targetHandle) : value;
            },
          });
        }
        return handle;
      },
      link: async (existingPath: string, newPath: string) => {
        cleanupLinkCalls += 1;
        await nodeLink(existingPath, newPath);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
          transaction_state?: string;
        },
      );
      assert.equal(error, firstError);
      assert.equal(error?.code, "EIO");
      assert.equal(error?.cause, firstCause);
      assert.equal(error?.transaction_state, "proof-pending");
      assert.equal(error?.recovery_path, undefined);
      assert.equal(error?.recovery_path_unavailable, "candidate-proof-unavailable");
      assert.equal(handleClosed, true);
      assert.equal(tempLstatCalls, 0);
      assert.equal(cleanupLinkCalls, 0);
      assert.deepEqual((await readdir(root)).sort(), entriesAtFailure);
      assert.equal(await readFile(join(root, tempName!), "utf8"), "");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("attempted/noProof 保留已有较优 recovery metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "nextstep-open-first-wins-"));
    const firstError = new Error("injected open failure with locator") as NodeJS.ErrnoException & {
      recovery_path?: string;
      recovery_path_unavailable?: string;
    };
    firstError.code = "EIO";
    firstError.recovery_path = "known/recovery.bin";
    let tempLstatCalls = 0;
    const binding = {
      lstat: async (path: string) => {
        if (path.includes(".nextstep-tmp-")) {
          tempLstatCalls += 1;
        }
        return nodeLstat(path);
      },
      open: async (path: string, flags: string, mode: number) => {
        if (flags === "wx" && path.includes(".nextstep-tmp-")) {
          const handle = await nodeOpen(path, flags, mode);
          await handle.close();
          throw firstError;
        }
        return nodeOpen(path, flags, mode);
      },
    } as Partial<NodeWriteFileSystemBinding>;

    try {
      const fileSystem = asGuardedWriter(createNodeWriteFileSystem({ project_root: root, binding }));
      const error = await fileSystem.atomicWrite("result.md", Buffer.from("nextstep"), {
        mode: "create",
        before_digest: null,
      }).then(
        () => undefined,
        (caught: unknown) => caught as typeof firstError,
      );
      assert.equal(error, firstError);
      assert.equal(error?.recovery_path, "known/recovery.bin");
      assert.equal(error?.recovery_path_unavailable, undefined);
      assert.equal(tempLstatCalls, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
