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

export function assertCommandPolicy(invocation: unknown): void {
  if (
    !isPlainRecord(invocation) ||
    Object.keys(invocation).length !== 2 ||
    typeof invocation.command !== "string" ||
    typeof invocation.dry_run !== "boolean"
  ) {
    throw new TypeError("Invalid command invocation");
  }

  if (READONLY_COMMANDS.has(invocation.command)) {
    return;
  }

  if (!MUTATING_COMMANDS.has(invocation.command)) {
    throw new TypeError(`Unknown command policy: ${invocation.command}`);
  }

  if (invocation.dry_run !== true) {
    throw new Error(`Mutating command requires dry-run: ${invocation.command}`);
  }
}
import { isPlainRecord } from "./value-guards.ts";
