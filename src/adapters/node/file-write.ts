import { randomBytes } from "node:crypto";
import { fsync as fsyncCallback } from "node:fs";
import {
  access as nodeAccess,
  lstat as nodeLstat,
  open as nodeOpen,
  readFile as nodeReadFile,
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
import { createNodeFsProbeAdapter } from "./fs-probe.ts";

export interface NodeWriteFileSystemBinding {
  lstat(path: string): Promise<{ isFile(): boolean; isSymbolicLink(): boolean; isDirectory(): boolean; readonly mode: number }>;
  access(path: string, mode?: number): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  open(path: string, flags: string, mode: number): Promise<FileHandle>;
  fsync(fd: number): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface NodeWriteFileSystemOptions {
  readonly project_root: string;
  readonly binding?: Partial<NodeWriteFileSystemBinding>;
}

function fail(code: "INVALID_WRITE_PLAN" | "WRITE_ACCESS_BLOCKED", message: string): never {
  throw new WriteTransactionError(code, message);
}

function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "unknown";
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

    async atomicWrite(relativePath: string, content: Uint8Array): Promise<void> {
      const resolved = resolveProjectPath(projectRoot, relativePath);
      let existingMode: number | null = null;
      try {
        const stats = await binding.lstat(resolved);
        if (stats.isSymbolicLink()) {
          fail("WRITE_ACCESS_BLOCKED", `Refusing to write through a symlink: ${relativePath}`);
        }
        if (stats.isDirectory()) {
          fail("WRITE_ACCESS_BLOCKED", `Refusing to overwrite a directory: ${relativePath}`);
        }
        existingMode = stats.mode & 0o777;
      } catch (error) {
        if (error instanceof WriteTransactionError) {
          throw error;
        }
        if (errnoOf(error) !== "ENOENT" && errnoOf(error) !== "ENOTDIR") {
          throw error;
        }
      }

      const tempPath = `${resolved}.nextstep-tmp-${randomBytes(8).toString("hex")}`;
      let handle: FileHandle | undefined;
      try {
        handle = await binding.open(tempPath, "wx", existingMode ?? 0o644);
        await handle.write(content);
        await binding.fsync(handle.fd);
        await handle.close();
        handle = undefined;
        await binding.rename(tempPath, resolved);
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
