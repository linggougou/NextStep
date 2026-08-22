import { snapshotJsonValue } from "./canonical-json.ts";
import { isPlainRecord } from "./value-guards.ts";

const READONLY_COMMANDS = new Set([
  "gate-evaluate",
  "project-resolve",
  "source-validate",
]);

const MUTATING_COMMANDS = new Set([
  "candidate-build",
  "formal-promote",
  "packet-build",
  "registry-transition",
  "snapshot-materialize",
]);

export interface CommandInvocation {
  readonly command: string;
  readonly dry_run: boolean;
}

export type WriteCommandActorRole = "main-conversation-agent" | "integration-agent" | "execution-agent";

export interface WriteCommandInvocation {
  readonly command: "write-transaction";
  readonly dry_run: boolean;
  readonly actor_role: WriteCommandActorRole;
  readonly explicit_confirmation: boolean;
}

export function assertCommandPolicy(invocation: unknown): Readonly<CommandInvocation> {
  const snapshot = snapshotJsonValue(invocation);
  if (
    !isPlainRecord(snapshot) ||
    Object.keys(snapshot).length !== 2 ||
    !Object.hasOwn(snapshot, "command") ||
    !Object.hasOwn(snapshot, "dry_run") ||
    typeof snapshot.command !== "string" ||
    typeof snapshot.dry_run !== "boolean"
  ) {
    throw new TypeError("Invalid command invocation");
  }

  const command = snapshot.command;
  const dryRun = snapshot.dry_run;

  if (!READONLY_COMMANDS.has(command)) {
    if (!MUTATING_COMMANDS.has(command)) {
      throw new TypeError(`Unknown command policy: ${command}`);
    }

    if (dryRun !== true) {
      throw new Error(`Mutating command requires dry-run: ${command}`);
    }
  }

  return snapshot as unknown as Readonly<CommandInvocation>;
}

/**
 * S1.5 的写入能力与 P4 逻辑命令分开校验：调用方角色是进程内能力，
 * 不能由 stdin/参数自述。主对话永远不能触盘；execution 只能预览；
 * integration 的正式写入还必须持有显式确认结果。
 */
export function assertWriteCommandPolicy(invocation: unknown): Readonly<WriteCommandInvocation> {
  const snapshot = snapshotJsonValue(invocation);
  if (
    !isPlainRecord(snapshot) ||
    Object.keys(snapshot).length !== 4 ||
    !Object.hasOwn(snapshot, "command") ||
    !Object.hasOwn(snapshot, "dry_run") ||
    !Object.hasOwn(snapshot, "actor_role") ||
    !Object.hasOwn(snapshot, "explicit_confirmation") ||
    snapshot.command !== "write-transaction" ||
    typeof snapshot.dry_run !== "boolean" ||
    (snapshot.actor_role !== "main-conversation-agent" &&
      snapshot.actor_role !== "integration-agent" &&
      snapshot.actor_role !== "execution-agent") ||
    typeof snapshot.explicit_confirmation !== "boolean"
  ) {
    throw new TypeError("Invalid S1.5 write command invocation");
  }

  if (snapshot.actor_role === "main-conversation-agent") {
    throw new Error("Main conversation agent has no project write/read capability");
  }
  if (!snapshot.dry_run && snapshot.actor_role !== "integration-agent") {
    throw new Error("Write commit requires the integration-agent role");
  }
  if (!snapshot.dry_run && !snapshot.explicit_confirmation) {
    throw new Error("Write commit requires explicit confirmation");
  }

  return snapshot as unknown as Readonly<WriteCommandInvocation>;
}
