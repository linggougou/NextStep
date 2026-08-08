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

export function assertCommandPolicy(invocation: unknown): Readonly<CommandInvocation> {
  const snapshot = snapshotJsonValue(invocation);
  if (
    !isPlainRecord(snapshot) ||
    Object.keys(snapshot).length !== 2 ||
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
