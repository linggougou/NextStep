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
import { isAbsolute, resolve, sep } from "node:path";
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

interface ParentAnchor {
  readonly lexical_parent: string;
  readonly canonical_parent: string;
  readonly target_name: string;
}

interface AnchoredParent extends ParentAnchor {
  assertIdentity(): Promise<void>;
}

let cwdMutationQueue: Promise<void> = Promise.resolve();

async function serializeCwdMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = cwdMutationQueue;
  let release!: () => void;
  cwdMutationQueue = new Promise<void>((resolveQueue) => {
    release = resolveQueue;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
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

  async function assertCanonicalRootAndParents(relativePath: string): Promise<ParentAnchor> {
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
      return {
        lexical_parent: parent,
        canonical_parent: expectedCanonicalParent,
        target_name: relativePath.split("/").at(-1)!,
      };
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

  async function withAnchoredParent<T>(
    relativePath: string,
    anchor: ParentAnchor,
    operation: (anchored: AnchoredParent) => Promise<T>,
  ): Promise<T> {
    return serializeCwdMutation(async () => {
      const previousCwd = process.cwd();
      let primaryError: unknown;

      const assertIdentity = async (): Promise<void> => {
        try {
          const observed = await binding.realpath(".");
          if (observed !== anchor.canonical_parent) {
            fail("WRITE_ACCESS_BLOCKED", `Write parent identity changed: ${relativePath}`);
          }
        } catch (error) {
          if (error instanceof WriteTransactionError) {
            throw error;
          }
          fail("WRITE_ACCESS_BLOCKED", `Cannot verify anchored write parent for ${relativePath}: ${errnoOf(error)}`);
        }
      };

      try {
        try {
          process.chdir(anchor.lexical_parent);
        } catch (error) {
          fail("WRITE_ACCESS_BLOCKED", `Cannot anchor write parent for ${relativePath}: ${errnoOf(error)}`);
        }
        await assertIdentity();
        return await operation({ ...anchor, assertIdentity });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        try {
          process.chdir(previousCwd);
        } catch (restoreError) {
          if (primaryError !== undefined && typeof primaryError === "object" && primaryError !== null) {
            Object.assign(primaryError, { cwd_restore_error: errnoOf(restoreError) });
          } else {
            fail("WRITE_ACCESS_BLOCKED", `Cannot restore process cwd after writing ${relativePath}: ${errnoOf(restoreError)}`);
          }
        }
      }
    });
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

  function siblingRecoveryPath(relativePath: string, recoveryName: string): string {
    const parentSegments = relativePath.split("/").slice(0, -1);
    return parentSegments.length === 0 ? recoveryName : `${parentSegments.join("/")}/${recoveryName}`;
  }

  async function pathExists(path: string): Promise<boolean> {
    try {
      await binding.lstat(path);
      return true;
    } catch (error) {
      if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
        return false;
      }
      throw error;
    }
  }

  async function restoreRecoveryNoReplace(recoveryName: string, targetName: string): Promise<boolean> {
    if (!(await pathExists(recoveryName))) {
      return true;
    }
    if (await pathExists(targetName)) {
      return false;
    }
    try {
      await binding.link(recoveryName, targetName);
      await binding.unlink(recoveryName);
      return !(await pathExists(recoveryName)) && await pathExists(targetName);
    } catch {
      return false;
    }
  }

  async function attachRecoveryPath(
    error: unknown,
    relativePath: string,
    recoveryName: string,
  ): Promise<void> {
    try {
      if (await pathExists(recoveryName) && typeof error === "object" && error !== null) {
        Object.assign(error, { recovery_path: siblingRecoveryPath(relativePath, recoveryName) });
      }
    } catch {
      // The primary failure remains authoritative when recovery inspection itself fails.
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
      const anchor = await assertCanonicalRootAndParents(relativePath);
      const existingMode = await assertTargetMatchesGuard(resolved, relativePath, guard);

      await withAnchoredParent(relativePath, anchor, async ({ target_name: targetName, assertIdentity }) => {
        const tempName = `${targetName}.nextstep-tmp-${randomBytes(8).toString("hex")}`;
        let handle: FileHandle | undefined;
        try {
          if (guard.mode === "update") {
            await assertTargetMatchesGuard(targetName, relativePath, guard);
          }

          handle = await binding.open(tempName, "wx", existingMode ?? 0o644);
          await assertIdentity();
          await handle.writeFile(content);
          await binding.fsync(handle.fd);
          await handle.close();
          handle = undefined;
          await assertIdentity();

          if (guard.mode === "create") {
            await binding.link(tempName, targetName);
            await assertIdentity();
            await binding.unlink(tempName);
          } else {
            const recoveryName = `${targetName}.nextstep-recovery-${randomBytes(8).toString("hex")}`;
            let recoveryCreated = false;
            try {
              await assertTargetMatchesGuard(targetName, relativePath, guard);
              await binding.rename(targetName, recoveryName);
              recoveryCreated = true;
              await assertIdentity();

              const recovered = await binding.readFile(recoveryName);
              if (digestBytes(recovered) !== guard.before_digest) {
                throw mutationError("ESTALE", `Update target changed at the installation boundary: ${relativePath}`);
              }

              await binding.link(tempName, targetName);
              await assertIdentity();
              await assertInstalledContent(targetName, relativePath, content);
              await binding.unlink(recoveryName);
              if (await pathExists(recoveryName)) {
                fail("WRITE_ACCESS_BLOCKED", `Update recovery cleanup failed: ${relativePath}`);
              }
              recoveryCreated = false;
              await binding.unlink(tempName);
            } catch (error) {
              if (recoveryCreated) {
                const restored = await restoreRecoveryNoReplace(recoveryName, targetName);
                recoveryCreated = !restored;
              }
              if (recoveryCreated) {
                await attachRecoveryPath(error, relativePath, recoveryName);
              }
              throw error;
            }
          }

          await assertIdentity();
          await assertInstalledContent(targetName, relativePath, content);
          await fsyncDirectory(".");
        } catch (error) {
          if (handle !== undefined) {
            try {
              await handle.close();
            } catch {
              // Closing before cleanup must not mask the write failure.
            }
          }
          try {
            await binding.unlink(tempName);
          } catch {
            // Temp file cleanup is best-effort; the write failure is the primary signal.
          }
          throw error;
        }
      });
    },

    async removeCreated(relativePath: string, expectedCurrentDigest?: Sha256Digest): Promise<void> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      const anchor = await assertCanonicalRootAndParents(relativePath);
      let expectedDigest = expectedCurrentDigest;

      // Formal rollback always supplies the post-write digest. The fallback only
      // preserves the frozen one-argument low-level contract and is revalidated
      // after acquiring the anchored mutation boundary.
      if (expectedDigest === undefined) {
        try {
          const stats = await binding.lstat(resolved);
          if (stats.isSymbolicLink() || !stats.isFile()) {
            fail("WRITE_ACCESS_BLOCKED", `Refusing to remove a non-file target: ${relativePath}`);
          }
          expectedDigest = digestBytes(await binding.readFile(resolved));
        } catch (error) {
          if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
            return;
          }
          throw error;
        }
      }

      await withAnchoredParent(relativePath, anchor, async ({ target_name: targetName, assertIdentity }) => {
        let stats: Awaited<ReturnType<NodeWriteFileSystemBinding["lstat"]>>;
        try {
          stats = await binding.lstat(targetName);
        } catch (error) {
          if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
            throw mutationError("ENOENT", `Created target disappeared before rollback: ${relativePath}`);
          }
          throw error;
        }
        if (stats.isSymbolicLink() || !stats.isFile()) {
          fail("WRITE_ACCESS_BLOCKED", `Refusing to remove a non-file target: ${relativePath}`);
        }
        if (digestBytes(await binding.readFile(targetName)) !== expectedDigest) {
          throw mutationError("ESTALE", `Created target no longer matches rollback digest: ${relativePath}`);
        }

        const recoveryName = `${targetName}.nextstep-recovery-${randomBytes(8).toString("hex")}`;
        let recoveryCreated = false;
        try {
          await binding.rename(targetName, recoveryName);
          recoveryCreated = true;
          await assertIdentity();
          if (digestBytes(await binding.readFile(recoveryName)) !== expectedDigest) {
            throw mutationError("ESTALE", `Created target changed at the removal boundary: ${relativePath}`);
          }
          await binding.unlink(recoveryName);
          if (await pathExists(recoveryName)) {
            fail("WRITE_ACCESS_BLOCKED", `Removal verification failed: ${relativePath}`);
          }
          recoveryCreated = false;
          await assertIdentity();
          await fsyncDirectory(".");
        } catch (error) {
          if (recoveryCreated) {
            const restored = await restoreRecoveryNoReplace(recoveryName, targetName);
            recoveryCreated = !restored;
          }
          if (recoveryCreated) {
            await attachRecoveryPath(error, relativePath, recoveryName);
          }
          throw error;
        }
      });
    },
  };
}
