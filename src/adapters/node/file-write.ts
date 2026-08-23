import { createHash, randomBytes } from "node:crypto";
import { fsync as fsyncCallback, lstatSync, unlinkSync } from "node:fs";
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
import { isAbsolute, relative as pathRelative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  WriteTransactionError,
  type WriteFileSystemPort,
  type WriteTargetProbe,
} from "../../domain/write-transaction.ts";
import type { Sha256Digest } from "../../domain/content-digest.ts";
import { createNodeFsProbeAdapter } from "./fs-probe.ts";

export interface NodeWriteFileSystemBinding {
  lstat(path: string): Promise<{
    isFile(): boolean;
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    readonly mode: number;
    readonly dev?: number;
    readonly ino?: number;
  }>;
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
  readonly canonical_root: string;
  readonly lexical_parent: string;
  readonly canonical_parent: string;
  readonly target_name: string;
}

interface AnchoredParent extends ParentAnchor {
  assertIdentity(): Promise<void>;
}

interface DirectoryIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly digest: Sha256Digest;
  readonly content: Buffer;
}

interface FileObjectProof {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly digest?: Sha256Digest;
}

interface CleanupContext {
  root_error?: WriteTransactionError & {
    recovery_path_unavailable?: string;
    cause?: unknown;
  };
}

interface PersistedRecovery {
  readonly name: string;
  readonly proof: FileIdentity;
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

async function directoryIdentity(path: string): Promise<DirectoryIdentity> {
  const stats = await nodeLstat(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    fail("WRITE_ACCESS_BLOCKED", `Cannot preserve cwd directory identity: ${path}`);
  }
  return { dev: stats.dev, ino: stats.ino };
}

function sameDirectoryIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
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
        canonical_root: canonicalRoot,
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
      const previousCanonicalCwd = await nodeRealpath(".");
      const previousIdentity = await directoryIdentity(".");
      const startedInAnchor = previousCanonicalCwd === anchor.canonical_parent;
      let primaryError: unknown;

      if (!startedInAnchor && isWithinRoot(anchor.canonical_parent, previousCanonicalCwd)) {
        fail("WRITE_ACCESS_BLOCKED", `Cannot safely restore a cwd nested below the write parent: ${relativePath}`);
      }

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
        if (!startedInAnchor) {
          try {
            process.chdir(anchor.lexical_parent);
          } catch (error) {
            fail("WRITE_ACCESS_BLOCKED", `Cannot anchor write parent for ${relativePath}: ${errnoOf(error)}`);
          }
        }
        await assertIdentity();
        return await operation({ ...anchor, assertIdentity });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        try {
          if (startedInAnchor) {
            const currentIdentity = await directoryIdentity(".");
            if (!sameDirectoryIdentity(currentIdentity, previousIdentity)) {
              fail("WRITE_ACCESS_BLOCKED", `Anchored cwd identity changed while writing ${relativePath}`);
            }
          } else {
            const lexicalIdentity = await directoryIdentity(previousCwd);
            const lexicalCanonical = await nodeRealpath(previousCwd);
            if (
              lexicalCanonical !== previousCanonicalCwd ||
              !sameDirectoryIdentity(lexicalIdentity, previousIdentity)
            ) {
              fail("WRITE_ACCESS_BLOCKED", `Cannot safely restore changed cwd identity after writing ${relativePath}`);
            }
            process.chdir(previousCwd);
            const restoredIdentity = await directoryIdentity(".");
            if (!sameDirectoryIdentity(restoredIdentity, previousIdentity)) {
              fail("WRITE_ACCESS_BLOCKED", `Restored cwd identity does not match after writing ${relativePath}`);
            }
          }
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

  function rootMembershipError(
    context: CleanupContext,
    reason: "anchor-outside-canonical-root" | "anchor-root-membership-unavailable",
    cause: unknown,
  ): WriteTransactionError & { recovery_path_unavailable?: string; cause?: unknown } {
    if (context.root_error !== undefined) {
      return context.root_error;
    }
    const blocked = new WriteTransactionError(
      "WRITE_ACCESS_BLOCKED",
      "Anchored cleanup parent is not verifiably inside the canonical project root",
    ) as WriteTransactionError & { recovery_path_unavailable?: string; cause?: unknown };
    blocked.recovery_path_unavailable = reason;
    blocked.cause = cause;
    context.root_error = blocked;
    return blocked;
  }

  async function assertLiveCleanupRoot(
    context: CleanupContext,
    anchor: ParentAnchor,
    cause: unknown,
  ): Promise<string> {
    if (context.root_error !== undefined) {
      throw context.root_error;
    }
    let liveParent: string;
    try {
      liveParent = await nodeRealpath(".");
    } catch (error) {
      throw rootMembershipError(context, "anchor-root-membership-unavailable", error);
    }
    if (!isWithinRoot(anchor.canonical_root, liveParent)) {
      throw rootMembershipError(context, "anchor-outside-canonical-root", cause);
    }
    return liveParent;
  }

  async function restoreRecoveryNoReplace(
    recoveryName: string,
    targetName: string,
    expectedDigest: Sha256Digest,
    relativePath: string,
    anchor: ParentAnchor,
    context: CleanupContext,
    primaryError: unknown,
  ): Promise<boolean> {
    if (!(await pathExists(recoveryName))) {
      return true;
    }
    if (await pathExists(targetName)) {
      return false;
    }
    try {
      const stats = await binding.lstat(recoveryName);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        return false;
      }
      await assertLiveCleanupRoot(context, anchor, primaryError);
      await binding.link(recoveryName, targetName);
      await cleanupOwnedBasename(recoveryName, expectedDigest, relativePath, anchor, context);
      return !(await pathExists(recoveryName)) && await pathExists(targetName);
    } catch {
      return false;
    }
  }

  async function recoveryError(
    error: unknown,
    candidateName: string,
    anchor: ParentAnchor,
    context: CleanupContext,
    proof?: FileObjectProof | null,
  ): Promise<unknown> {
    let targetError = typeof error === "object" && error !== null
      ? error as NodeJS.ErrnoException & { recovery_path?: string; recovery_path_unavailable?: string }
      : new Error(String(error)) as NodeJS.ErrnoException & {
          recovery_path?: string;
          recovery_path_unavailable?: string;
        };
    let liveParent: string;
    try {
      liveParent = await assertLiveCleanupRoot(context, anchor, error);
    } catch (rootError) {
      return rootError;
    }
    if (proof === null) {
      delete targetError.recovery_path;
      targetError.recovery_path_unavailable = "candidate-proof-unavailable";
      return targetError;
    }
    try {
      const candidateIdentity = await readTrustedFileIdentity(candidateName);
      if (
        proof !== undefined &&
        (
          candidateIdentity.dev !== proof.dev ||
          candidateIdentity.ino !== proof.ino ||
          (proof.digest !== undefined && candidateIdentity.digest !== proof.digest)
        )
      ) {
        delete targetError.recovery_path;
        targetError.recovery_path_unavailable = "candidate-identity-changed";
        return targetError;
      }
      const parentProjection = pathRelative(anchor.canonical_root, liveParent);
      const recoveryPath = parentProjection.length === 0
        ? candidateName
        : `${parentProjection.split(sep).join("/")}/${candidateName}`;
      if (resolve(anchor.canonical_root, recoveryPath) !== resolve(liveParent, candidateName)) {
        delete targetError.recovery_path;
        targetError.recovery_path_unavailable = "candidate-roundtrip-mismatch";
        return targetError;
      }
      targetError.recovery_path = recoveryPath;
      delete targetError.recovery_path_unavailable;
      return targetError;
    } catch {
      delete targetError.recovery_path;
      targetError.recovery_path_unavailable = "candidate-unavailable";
      return targetError;
    }
  }

  function mergeRecoveryMetadata(primaryError: unknown, locatorError: unknown): void {
    if (
      typeof primaryError !== "object" ||
      primaryError === null ||
      typeof locatorError !== "object" ||
      locatorError === null ||
      "recovery_path" in primaryError
    ) {
      return;
    }
    const recoveryPath = (locatorError as { recovery_path?: unknown }).recovery_path;
    const unavailable = (locatorError as { recovery_path_unavailable?: unknown }).recovery_path_unavailable;
    if (typeof recoveryPath === "string") {
      Object.assign(primaryError, { recovery_path: recoveryPath });
      delete (primaryError as { recovery_path_unavailable?: string }).recovery_path_unavailable;
    } else if (typeof unavailable === "string" && !("recovery_path_unavailable" in primaryError)) {
      Object.assign(primaryError, { recovery_path_unavailable: unavailable });
    }
  }

  async function readOpenFile(handle: FileHandle): Promise<Buffer> {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw mutationError("ESTALE", "Cleanup object is no longer a regular file");
    }
    const content = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < content.length) {
      const { bytesRead } = await handle.read(content, offset, content.length - offset, offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    return content.subarray(0, offset);
  }

  async function readTrustedFileIdentity(name: string): Promise<FileIdentity> {
    const handle = await nodeOpen(name, "r", 0);
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        throw mutationError("ESTALE", `Cleanup object is not a regular file: ${name}`);
      }
      const content = await readOpenFile(handle);
      return {
        dev: stats.dev,
        ino: stats.ino,
        mode: stats.mode & 0o777,
        digest: digestBytes(content),
        content,
      };
    } finally {
      await handle.close();
    }
  }

  async function proofFromHandle(handle: FileHandle, name: string): Promise<FileObjectProof> {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw mutationError("ESTALE", `Newly created object is not a regular file: ${name}`);
    }
    return { dev: stats.dev, ino: stats.ino, mode: stats.mode & 0o777 };
  }

  function matchesFileProof(identity: FileIdentity, proof: FileObjectProof): boolean {
    return identity.dev === proof.dev &&
      identity.ino === proof.ino &&
      (proof.digest === undefined || identity.digest === proof.digest);
  }

  async function completeNamedProof(
    name: string,
    proof: FileObjectProof,
  ): Promise<FileObjectProof> {
    try {
      const identity = await readTrustedFileIdentity(name);
      return matchesFileProof(identity, proof) ? identity : proof;
    } catch {
      return proof;
    }
  }

  async function readTrustedFileIdentityOrUndefined(name: string): Promise<FileIdentity | undefined> {
    try {
      return await readTrustedFileIdentity(name);
    } catch (error) {
      if (
        errnoOf(error) === "ENOENT" ||
        errnoOf(error) === "ENOTDIR" ||
        errnoOf(error) === "ESTALE"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  function sameFileIdentity(left: FileIdentity | undefined, right: FileIdentity): boolean {
    return left !== undefined &&
      left.dev === right.dev &&
      left.ino === right.ino &&
      left.digest === right.digest;
  }

  async function assertTrustedDigest(name: string, expectedDigest: Sha256Digest): Promise<void> {
    const identity = await readTrustedFileIdentity(name);
    if (identity.digest !== expectedDigest) {
      throw mutationError("ESTALE", `Trusted target digest changed: ${name}`);
    }
  }

  async function persistRecoveryNoReplace(
    preferredName: string,
    content: Uint8Array,
    relativePath: string,
    anchor: ParentAnchor,
    context: CleanupContext,
    mode = 0o600,
  ): Promise<PersistedRecovery> {
    const candidates = [
      preferredName,
      `${preferredName}.nextstep-recovered-${randomBytes(8).toString("hex")}`,
    ];
    for (const candidate of candidates) {
      let handle: FileHandle | undefined;
      let candidateWasCreated = false;
      let candidateProof: FileObjectProof | undefined;
      try {
        await assertLiveCleanupRoot(context, anchor, `fallback-open:${relativePath}`);
        handle = await binding.open(candidate, "wx", mode);
        candidateWasCreated = true;
        candidateProof = await proofFromHandle(handle, candidate);
        await assertLiveCleanupRoot(context, anchor, `fallback-created:${relativePath}`);
        await handle.writeFile(content);
        await binding.fsync(handle.fd);
        await handle.close();
        handle = undefined;
        const installedProof = await readTrustedFileIdentity(candidate);
        if (
          candidateProof === undefined ||
          !matchesFileProof(installedProof, candidateProof) ||
          installedProof.digest !== digestBytes(content)
        ) {
          throw mutationError("ESTALE", `Persisted recovery object changed: ${relativePath}`);
        }
        return { name: candidate, proof: installedProof };
      } catch (error) {
        const locatorProof = candidateProof === undefined
          ? undefined
          : await completeNamedProof(candidate, candidateProof);
        if (handle !== undefined) {
          try {
            await handle.close();
          } catch {
            // The persistence failure remains authoritative.
          }
        }
        if (candidateWasCreated) {
          throw await recoveryError(error, candidate, anchor, context, locatorProof ?? null);
        }
        if (errnoOf(error) !== "EEXIST") {
          throw error;
        }
      }
    }
    throw mutationError("EEXIST", `Cannot persist a no-replace recovery object for ${relativePath}`);
  }

  async function cleanupOwnedBasename(
    name: string,
    expectedDigest: Sha256Digest,
    relativePath: string,
    anchor: ParentAnchor,
    context: CleanupContext,
    expectedProof?: FileObjectProof | null,
    postLinkInvariant?: () => Promise<void>,
  ): Promise<Buffer> {
    let originalHandle: FileHandle | undefined;
    try {
      await assertLiveCleanupRoot(context, anchor, `cleanup-open:${relativePath}`);
      originalHandle = await nodeOpen(name, "r", 0);
      const originalStats = await originalHandle.stat();
      const originalContent = await readOpenFile(originalHandle);
      const originalIdentity: FileIdentity = {
        dev: originalStats.dev,
        ino: originalStats.ino,
        mode: originalStats.mode & 0o777,
        digest: digestBytes(originalContent),
        content: originalContent,
      };
      if (
        !originalStats.isFile() ||
        originalIdentity.digest !== expectedDigest ||
        expectedProof === null ||
        (expectedProof !== undefined && !matchesFileProof(originalIdentity, expectedProof))
      ) {
        const error = mutationError("ESTALE", `Cleanup object proof changed: ${relativePath}`);
        const locatorProof = expectedProof === undefined ? originalIdentity : expectedProof;
        throw await recoveryError(error, name, anchor, context, locatorProof);
      }

      const quarantineName = `${name}.nextstep-quarantine-${randomBytes(8).toString("hex")}`;
      let linkError: unknown;
      try {
        await assertLiveCleanupRoot(context, anchor, `quarantine-link:${relativePath}`);
        await binding.link(name, quarantineName);
      } catch (error) {
        linkError = error;
      }

      const nameIdentity = await readTrustedFileIdentityOrUndefined(name);
      const quarantineIdentity = await readTrustedFileIdentityOrUndefined(quarantineName);
      const nameMatches = sameFileIdentity(nameIdentity, originalIdentity);
      const quarantineMatches = sameFileIdentity(quarantineIdentity, originalIdentity);

      if (linkError !== undefined) {
        if (quarantineMatches) {
          throw await recoveryError(linkError, quarantineName, anchor, context, quarantineIdentity);
        }
        if (nameMatches) {
          throw await recoveryError(linkError, name, anchor, context, nameIdentity);
        }
        const fallback = await persistRecoveryNoReplace(
          name,
          originalContent,
          relativePath,
          anchor,
          context,
          originalIdentity.mode,
        );
        const error = mutationError("ESTALE", `Cleanup link failed after pathname replacement: ${relativePath}`);
        throw await recoveryError(error, fallback.name, anchor, context, fallback.proof);
      }
      if (!nameMatches || !quarantineMatches) {
        const error = mutationError("ESTALE", `Cleanup pathname changed around hardlink: ${relativePath}`);
        if (quarantineMatches) {
          throw await recoveryError(error, quarantineName, anchor, context, quarantineIdentity);
        }
        if (nameMatches) {
          throw await recoveryError(error, name, anchor, context, nameIdentity);
        }
        const fallback = await persistRecoveryNoReplace(
          name,
          originalContent,
          relativePath,
          anchor,
          context,
          originalIdentity.mode,
        );
        throw await recoveryError(error, fallback.name, anchor, context, fallback.proof);
      }

      try {
        const liveParent = await assertLiveCleanupRoot(context, anchor, `post-link:${relativePath}`);
        if (liveParent !== anchor.canonical_parent) {
          fail("WRITE_ACCESS_BLOCKED", `Cleanup parent identity changed: ${relativePath}`);
        }
        if (postLinkInvariant !== undefined) {
          await postLinkInvariant();
        }
      } catch (error) {
        throw await recoveryError(error, quarantineName, anchor, context, quarantineIdentity);
      }

      const finalNameIdentity = await readTrustedFileIdentityOrUndefined(name);
      const finalQuarantineIdentity = await readTrustedFileIdentityOrUndefined(quarantineName);
      if (
        !sameFileIdentity(finalNameIdentity, originalIdentity) ||
        !sameFileIdentity(finalQuarantineIdentity, originalIdentity)
      ) {
        const error = mutationError("ESTALE", `Cleanup pathname changed before trusted unlink: ${relativePath}`);
        if (sameFileIdentity(finalQuarantineIdentity, originalIdentity)) {
          throw await recoveryError(error, quarantineName, anchor, context, finalQuarantineIdentity);
        }
        if (sameFileIdentity(finalNameIdentity, originalIdentity)) {
          throw await recoveryError(error, name, anchor, context, finalNameIdentity);
        }
        const fallback = await persistRecoveryNoReplace(
          name,
          originalContent,
          relativePath,
          anchor,
          context,
          originalIdentity.mode,
        );
        throw await recoveryError(error, fallback.name, anchor, context, fallback.proof);
      }

      try {
        await assertLiveCleanupRoot(context, anchor, `trusted-unlink:${relativePath}`);
        const syncNameStats = lstatSync(name);
        const syncQuarantineStats = lstatSync(quarantineName);
        if (
          !syncNameStats.isFile() ||
          !syncQuarantineStats.isFile() ||
          syncNameStats.dev !== originalIdentity.dev ||
          syncNameStats.ino !== originalIdentity.ino ||
          syncQuarantineStats.dev !== originalIdentity.dev ||
          syncQuarantineStats.ino !== originalIdentity.ino
        ) {
          throw mutationError("ESTALE", `Cleanup identity changed in trusted unlink window: ${relativePath}`);
        }
        unlinkSync(name);
        unlinkSync(quarantineName);
      } catch (error) {
        throw await recoveryError(error, quarantineName, anchor, context, finalQuarantineIdentity);
      }
      return originalContent;
    } finally {
      if (originalHandle !== undefined) {
        try {
          await originalHandle.close();
        } catch {
          // Closing a cleanup proof handle must not mask the primary outcome.
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
      const contentDigest = digestBytes(content);
      const anchor = await assertCanonicalRootAndParents(relativePath);
      const existingMode = await assertTargetMatchesGuard(resolved, relativePath, guard);

      await withAnchoredParent(relativePath, anchor, async ({ target_name: targetName, assertIdentity }) => {
        const tempName = `${targetName}.nextstep-tmp-${randomBytes(8).toString("hex")}`;
        const cleanupContext: CleanupContext = {};
        let handle: FileHandle | undefined;
        let tempWasCreated = false;
        let tempProof: FileObjectProof | undefined;
        try {
          if (guard.mode === "update") {
            await assertTargetMatchesGuard(targetName, relativePath, guard);
          }

          await assertLiveCleanupRoot(cleanupContext, anchor, `temp-open:${relativePath}`);
          handle = await binding.open(tempName, "wx", existingMode ?? 0o644);
          tempWasCreated = true;
          tempProof = await proofFromHandle(handle, tempName);
          await assertLiveCleanupRoot(cleanupContext, anchor, `temp-created:${relativePath}`);
          await assertIdentity();
          await handle.writeFile(content);
          await binding.fsync(handle.fd);
          await handle.close();
          handle = undefined;
          await assertIdentity();

          if (guard.mode === "create") {
            await assertLiveCleanupRoot(cleanupContext, anchor, `create-install:${relativePath}`);
            await binding.link(tempName, targetName);
            await assertIdentity();
            await assertInstalledContent(targetName, relativePath, content);
            await cleanupOwnedBasename(
              tempName,
              contentDigest,
              relativePath,
              anchor,
              cleanupContext,
              tempProof,
              () => assertTrustedDigest(targetName, contentDigest),
            );
          } else {
            const recoveryName = `${targetName}.nextstep-recovery-${randomBytes(8).toString("hex")}`;
            let recoveryCreated = false;
            let recoveryCleanupStarted = false;
            try {
              await assertTargetMatchesGuard(targetName, relativePath, guard);
              await assertLiveCleanupRoot(cleanupContext, anchor, `update-recovery:${relativePath}`);
              await binding.rename(targetName, recoveryName);
              recoveryCreated = true;
              await assertIdentity();

              const recovered = await binding.readFile(recoveryName);
              if (digestBytes(recovered) !== guard.before_digest) {
                throw mutationError("ESTALE", `Update target changed at the installation boundary: ${relativePath}`);
              }

              await assertLiveCleanupRoot(cleanupContext, anchor, `update-install:${relativePath}`);
              await binding.link(tempName, targetName);
              await assertIdentity();
              await assertInstalledContent(targetName, relativePath, content);
              await cleanupOwnedBasename(
                tempName,
                contentDigest,
                relativePath,
                anchor,
                cleanupContext,
                tempProof,
                () => assertTrustedDigest(targetName, contentDigest),
              );
              await assertTrustedDigest(targetName, contentDigest);

              recoveryCleanupStarted = true;
              await cleanupOwnedBasename(
                recoveryName,
                guard.before_digest,
                relativePath,
                anchor,
                cleanupContext,
                undefined,
                () => assertTrustedDigest(targetName, contentDigest),
              );
              recoveryCleanupStarted = false;
              recoveryCreated = false;
            } catch (error) {
              if (recoveryCreated && !recoveryCleanupStarted) {
                const restored = await restoreRecoveryNoReplace(
                  recoveryName,
                  targetName,
                  guard.before_digest!,
                  relativePath,
                  anchor,
                  cleanupContext,
                  error,
                );
                recoveryCreated = !restored;
              }
              if (
                recoveryCreated &&
                typeof error === "object" &&
                error !== null &&
                !("recovery_path" in error) &&
                !("recovery_path_unavailable" in error)
              ) {
                throw await recoveryError(error, recoveryName, anchor, cleanupContext);
              }
              throw error;
            }
          }

          await fsyncDirectory(".");
        } catch (error) {
          if (tempProof !== undefined) {
            tempProof = await completeNamedProof(tempName, tempProof);
          }
          if (handle !== undefined) {
            try {
              await handle.close();
            } catch {
              // Closing before cleanup must not mask the write failure.
            }
          }
          try {
            if (await pathExists(tempName)) {
              await cleanupOwnedBasename(
                tempName,
                contentDigest,
                relativePath,
                anchor,
                cleanupContext,
                tempWasCreated ? tempProof ?? null : undefined,
              );
            } else if (tempWasCreated) {
              const locatorError = await recoveryError(
                mutationError("ESTALE", `Primary temporary object became unavailable: ${relativePath}`),
                tempName,
                anchor,
                cleanupContext,
                tempProof ?? null,
              );
              mergeRecoveryMetadata(error, locatorError);
            }
          } catch (cleanupError) {
            mergeRecoveryMetadata(error, cleanupError);
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

      if (expectedCurrentDigest === undefined && options.binding?.unlink !== undefined) {
        fail("WRITE_ACCESS_BLOCKED", `Legacy removal cannot trust an overridden unlink binding: ${relativePath}`);
      }

      await withAnchoredParent(relativePath, anchor, async ({ target_name: targetName, assertIdentity }) => {
        const cleanupContext: CleanupContext = {};
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
        let recoveryCleanupStarted = false;
        try {
          await assertLiveCleanupRoot(cleanupContext, anchor, `remove-recovery:${relativePath}`);
          await binding.rename(targetName, recoveryName);
          recoveryCreated = true;
          await assertIdentity();
          if (digestBytes(await binding.readFile(recoveryName)) !== expectedDigest) {
            throw mutationError("ESTALE", `Created target changed at the removal boundary: ${relativePath}`);
          }
          recoveryCleanupStarted = true;
          await cleanupOwnedBasename(
            recoveryName,
            expectedDigest,
            relativePath,
            anchor,
            cleanupContext,
          );
          recoveryCleanupStarted = false;
          recoveryCreated = false;
          await fsyncDirectory(".");
        } catch (error) {
          if (recoveryCreated && !recoveryCleanupStarted) {
            const restored = await restoreRecoveryNoReplace(
              recoveryName,
              targetName,
              expectedDigest,
              relativePath,
              anchor,
              cleanupContext,
              error,
            );
            recoveryCreated = !restored;
          }
          if (
            recoveryCreated &&
            typeof error === "object" &&
            error !== null &&
            !("recovery_path" in error) &&
            !("recovery_path_unavailable" in error)
          ) {
            throw await recoveryError(error, recoveryName, anchor, cleanupContext);
          }
          throw error;
        }
      });
    },
  };
}
