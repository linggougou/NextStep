import { createHash, randomBytes } from "node:crypto";
import { fsync as fsyncCallback } from "node:fs";
import {
  access as nodeAccess,
  link as nodeLink,
  lstat as nodeLstat,
  open as nodeOpen,
  readFile as nodeReadFile,
  realpath as nodeRealpath,
  rename as nodeRename,
  unlink as nodeUnlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  WriteTransactionError,
  type WriteFileSystemPort,
  type WriteTargetProbe,
} from "../../domain/write-transaction.ts";
import type { Sha256Digest } from "../../domain/content-digest.ts";
import { createNodeFsProbeAdapter } from "./fs-probe.ts";

export interface NodeWriteFileSystemBinding {
  lstat(path: string): Promise<{ isFile(): boolean; isSymbolicLink(): boolean; isDirectory(): boolean; readonly mode: number }>;
  access(path: string, mode?: number): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  open(path: string, flags: string, mode: number): Promise<FileHandle>;
  fsync(fd: number): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  realpath(path: string): Promise<string>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface NodeWriteFileSystemOptions {
  readonly project_root: string;
  readonly binding?: Partial<NodeWriteFileSystemBinding>;
}

export interface NodeWriteMutationGuard {
  readonly mode: "create" | "update";
  readonly before_digest: Sha256Digest | null;
}

function fail(code: "INVALID_WRITE_PLAN" | "WRITE_ACCESS_BLOCKED", message: string): never {
  throw new WriteTransactionError(code, message);
}

function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "unknown";
}

function mutationError(code: "EEXIST" | "ENOENT" | "ESTALE", message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function digestBytes(content: Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function isWithinRoot(projectRoot: string, path: string): boolean {
  return path === projectRoot || path.startsWith(projectRoot.endsWith(sep) ? projectRoot : projectRoot + sep);
}

export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  if (!isAbsolute(projectRoot)) {
    fail("INVALID_WRITE_PLAN", "Project root must be an absolute path");
  }
  if (relativePath === ".") {
    return projectRoot;
  }
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\u0000") ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    relativePath.split("/").some((segment) => segment === ".." || segment === "." || segment === "")
  ) {
    fail("WRITE_ACCESS_BLOCKED", `Unsafe relative write path: ${relativePath}`);
  }
  const resolved = resolve(projectRoot, relativePath);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot.endsWith(sep) ? projectRoot : projectRoot + sep)) {
    fail("WRITE_ACCESS_BLOCKED", `Write path escapes the project root: ${relativePath}`);
  }
  return resolved;
}

export function createNodeWriteFileSystem(options: NodeWriteFileSystemOptions): WriteFileSystemPort {
  const projectRoot = options.project_root;
  const binding: NodeWriteFileSystemBinding = {
    lstat: nodeLstat,
    access: nodeAccess,
    readFile: nodeReadFile,
    open: nodeOpen,
    fsync: promisify(fsyncCallback),
    link: nodeLink,
    realpath: nodeRealpath,
    rename: nodeRename,
    unlink: nodeUnlink,
    ...options.binding,
  };
  const probeAdapter = createNodeFsProbeAdapter({
    lstat: binding.lstat,
    access: binding.access,
  });

  async function fsyncDirectory(directory: string): Promise<void> {
    let handle: FileHandle | undefined;
    try {
      handle = await binding.open(directory, "r", 0);
      await binding.fsync(handle.fd);
    } catch {
      // Directory durability sync is best-effort; rename atomicity already guards consistency.
    } finally {
      if (handle !== undefined) {
        try {
          await handle.close();
        } catch {
          // Closing a best-effort directory handle must not mask write outcomes.
        }
      }
    }
  }

  function assertGuard(guard: NodeWriteMutationGuard): NodeWriteMutationGuard {
    if (
      (guard.mode !== "create" && guard.mode !== "update") ||
      (guard.mode === "create" && guard.before_digest !== null) ||
      (guard.mode === "update" &&
        (typeof guard.before_digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(guard.before_digest)))
    ) {
      fail("INVALID_WRITE_PLAN", "Atomic write requires a valid mutation guard");
    }
    return guard;
  }

  async function assertCanonicalRootAndParents(relativePath: string): Promise<void> {
    const lexicalRoot = resolve(projectRoot);
    try {
      const rootStats = await binding.lstat(projectRoot);
      if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
        fail("WRITE_ACCESS_BLOCKED", "Project root must be a real directory");
      }
      const canonicalRoot = await binding.realpath(projectRoot);

      let parent = lexicalRoot;
      let expectedCanonicalParent = canonicalRoot;
      for (const segment of relativePath.split("/").slice(0, -1)) {
        parent = resolve(parent, segment);
        expectedCanonicalParent = resolve(expectedCanonicalParent, segment);
        const stats = await binding.lstat(parent);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          fail("WRITE_ACCESS_BLOCKED", `Write parent must be a real directory: ${relativePath}`);
        }
        const canonicalParent = await binding.realpath(parent);
        if (canonicalParent !== expectedCanonicalParent || !isWithinRoot(canonicalRoot, canonicalParent)) {
          fail("WRITE_ACCESS_BLOCKED", `Write parent escapes the canonical project root: ${relativePath}`);
        }
      }
    } catch (error) {
      if (error instanceof WriteTransactionError) {
        throw error;
      }
      fail(
        "WRITE_ACCESS_BLOCKED",
        `Cannot validate canonical project root and parents for ${relativePath}: ${errnoOf(error)}`,
      );
    }
  }

  async function assertTargetMatchesGuard(
    resolved: string,
    relativePath: string,
    guard: NodeWriteMutationGuard,
  ): Promise<number | null> {
    let stats: Awaited<ReturnType<NodeWriteFileSystemBinding["lstat"]>>;
    try {
      stats = await binding.lstat(resolved);
    } catch (error) {
      if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
        if (guard.mode === "update") {
          throw mutationError("ENOENT", `Update target disappeared: ${relativePath}`);
        }
        return null;
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      fail("WRITE_ACCESS_BLOCKED", `Refusing to write through a symlink: ${relativePath}`);
    }
    if (!stats.isFile()) {
      fail("WRITE_ACCESS_BLOCKED", `Refusing to overwrite a non-file target: ${relativePath}`);
    }
    if (guard.mode === "create") {
      throw mutationError("EEXIST", `Create target already exists: ${relativePath}`);
    }

    const current = await binding.readFile(resolved);
    if (digestBytes(current) !== guard.before_digest) {
      throw mutationError("ESTALE", `Update target no longer matches before_digest: ${relativePath}`);
    }
    return stats.mode & 0o777;
  }

  async function inferLegacyGuard(resolved: string, relativePath: string): Promise<NodeWriteMutationGuard> {
    let stats: Awaited<ReturnType<NodeWriteFileSystemBinding["lstat"]>>;
    try {
      stats = await binding.lstat(resolved);
    } catch (error) {
      if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
        return Object.freeze({ mode: "create", before_digest: null });
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      fail("WRITE_ACCESS_BLOCKED", `Refusing to write through a symlink: ${relativePath}`);
    }
    if (!stats.isFile()) {
      fail("WRITE_ACCESS_BLOCKED", `Refusing to overwrite a non-file target: ${relativePath}`);
    }
    const current = await binding.readFile(resolved);
    return Object.freeze({ mode: "update", before_digest: digestBytes(current) });
  }

  async function assertInstalledContent(
    resolved: string,
    relativePath: string,
    content: Uint8Array,
  ): Promise<void> {
    let stats: Awaited<ReturnType<NodeWriteFileSystemBinding["lstat"]>>;
    try {
      stats = await binding.lstat(resolved);
    } catch (error) {
      if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
        throw mutationError("ENOENT", `Installed target disappeared before read-back: ${relativePath}`);
      }
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
      fail("WRITE_ACCESS_BLOCKED", `Installed target is not a regular file: ${relativePath}`);
    }
    const installed = await binding.readFile(resolved);
    if (digestBytes(installed) !== digestBytes(content)) {
      throw mutationError("ESTALE", `Installed target failed read-back verification: ${relativePath}`);
    }
  }

  return {
    async probe(relativePath: string): Promise<WriteTargetProbe> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      const probe = await probeAdapter.probe(resolved);
      return { exists: probe.exists, kind: probe.kind, symlink: probe.symlink, readable: probe.readable, writable: probe.writable };
    },

    async readContent(relativePath: string): Promise<Uint8Array> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      return binding.readFile(resolved);
    },

    async atomicWrite(
      relativePath: string,
      content: Uint8Array,
      mutationGuard?: NodeWriteMutationGuard,
    ): Promise<void> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      // The domain execution and rollback paths always supply an explicit guard. This
      // fallback preserves older low-level callers while still snapshotting their
      // mutation boundary and enforcing the same final no-replace / digest checks.
      const guard = mutationGuard === undefined
        ? await inferLegacyGuard(resolved, relativePath)
        : assertGuard(mutationGuard);
      await assertCanonicalRootAndParents(relativePath);
      const existingMode = await assertTargetMatchesGuard(resolved, relativePath, guard);

      const tempPath = `${resolved}.nextstep-tmp-${randomBytes(8).toString("hex")}`;
      let handle: FileHandle | undefined;
      try {
        await assertCanonicalRootAndParents(relativePath);
        handle = await binding.open(tempPath, "wx", existingMode ?? 0o644);
        await handle.writeFile(content);
        await binding.fsync(handle.fd);
        await handle.close();
        handle = undefined;

        await assertCanonicalRootAndParents(relativePath);
        if (guard.mode === "create") {
          await binding.link(tempPath, resolved);
          await binding.unlink(tempPath);
        } else {
          await assertTargetMatchesGuard(resolved, relativePath, guard);
          await binding.rename(tempPath, resolved);
        }

        await assertCanonicalRootAndParents(relativePath);
        await assertInstalledContent(resolved, relativePath, content);
        await fsyncDirectory(dirname(resolved));
      } catch (error) {
        if (handle !== undefined) {
          try {
            await handle.close();
          } catch {
            // Closing before cleanup must not mask the write failure.
          }
        }
        try {
          await binding.unlink(tempPath);
        } catch {
          // Temp file cleanup is best-effort; the write failure is the primary signal.
        }
        throw error;
      }
    },

    async removeCreated(relativePath: string): Promise<void> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      try {
        await binding.unlink(resolved);
      } catch (error) {
        if (errnoOf(error) !== "ENOENT") {
          throw error;
        }
      }
      const probe = await probeAdapter.probe(resolved);
      if (probe.exists) {
        fail("WRITE_ACCESS_BLOCKED", `Removal verification failed: ${relativePath}`);
      }
    },
  };
}
