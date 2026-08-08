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
    Object.getOwnPropertyNames(invocation).length !== 2 ||
    Object.getOwnPropertySymbols(invocation).length !== 0
  ) {
    throw new TypeError("Invalid command invocation");
  }

  const commandDescriptor = Object.getOwnPropertyDescriptor(invocation, "command");
  const dryRunDescriptor = Object.getOwnPropertyDescriptor(invocation, "dry_run");
  if (
    !commandDescriptor ||
    !("value" in commandDescriptor) ||
    !commandDescriptor.enumerable ||
    typeof commandDescriptor.value !== "string" ||
    !dryRunDescriptor ||
    !("value" in dryRunDescriptor) ||
    !dryRunDescriptor.enumerable ||
    typeof dryRunDescriptor.value !== "boolean"
  ) {
    throw new TypeError("Invalid command invocation");
  }

  const command = commandDescriptor.value;
  const dryRun = dryRunDescriptor.value;

  if (READONLY_COMMANDS.has(command)) {
    return;
  }

  if (!MUTATING_COMMANDS.has(command)) {
    throw new TypeError(`Unknown command policy: ${command}`);
  }

  if (dryRun !== true) {
    throw new Error(`Mutating command requires dry-run: ${command}`);
  }
}
import { isPlainRecord } from "./value-guards.ts";
