import { constants as fsConstants } from "node:fs";
import { access as nodeAccess, lstat as nodeLstat } from "node:fs/promises";

export interface PathProbe {
  readonly exists: boolean;
  readonly kind: "file" | "directory" | "symlink" | "other" | "missing";
  readonly symlink: boolean;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly mode: number | null;
}

export interface FsProbeBinding {
  lstat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    readonly mode: number;
  }>;
  access(path: string, mode?: number): Promise<void>;
}

export interface FsProbeAdapter {
  probe(absolutePath: string): Promise<PathProbe>;
}

function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "unknown";
}

async function checkAccess(
  binding: FsProbeBinding,
  absolutePath: string,
  mode: number,
): Promise<boolean> {
  try {
    await binding.access(absolutePath, mode);
    return true;
  } catch {
    return false;
  }
}

export function createNodeFsProbeAdapter(bindingOverride: Partial<FsProbeBinding> = {}): FsProbeAdapter {
  const binding: FsProbeBinding = {
    lstat: nodeLstat,
    access: nodeAccess,
    ...bindingOverride,
  };

  return {
    async probe(absolutePath: string): Promise<PathProbe> {
      let stats: Awaited<ReturnType<FsProbeBinding["lstat"]>>;
      try {
        stats = await binding.lstat(absolutePath);
      } catch (error) {
        if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") {
          return { exists: false, kind: "missing", symlink: false, readable: false, writable: false, mode: null };
        }
        throw error;
      }

      if (stats.isSymbolicLink()) {
        return { exists: true, kind: "symlink", symlink: true, readable: false, writable: false, mode: stats.mode & 0o777 };
      }

      const kind = stats.isFile() ? "file" : stats.isDirectory() ? "directory" : "other";
      const [readable, writable] = await Promise.all([
        checkAccess(binding, absolutePath, fsConstants.R_OK),
        checkAccess(binding, absolutePath, fsConstants.W_OK),
      ]);
      return { exists: true, kind, symlink: false, readable, writable, mode: stats.mode & 0o777 };
    },
  };
}
