#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "0.2.0-alpha";
const BASE_COMMANDS = {
  status: "project-status.js",
  "requirement-intake": "requirement-intake.js",
  "requirement-freeze": "requirement-freeze.js",
  "product-definition": "product-definition.js",
  "interaction-prototype": "interaction-prototype.js",
  "carrier-decision": "carrier-decision.js",
  "acceptance-profile": "acceptance-profile.js",
  "write-consistency": "write-consistency.js",
  "source-validate": "source-validate.js",
  "version-chain": "version-chain.js",
  "major-milestone": "major-milestone.js",
  "small-milestone": "small-milestone.js",
  "execution-packet": "execution-packet.js",
} as const;
const COMMANDS = Object.freeze({
  ...BASE_COMMANDS,
  ...(existsSync(fileURLToPath(new URL("adoption-inspect.js", import.meta.url)))
    ? { "adoption-inspect": "adoption-inspect.js" as const }
    : {}),
});

const HELP = [
  `NextStep ${VERSION}`,
  "Usage: nextstep <command> [args]",
  "Commands:",
  ...Object.keys(COMMANDS).map((command) => `  ${command}`),
  "",
].join("\n");

interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface NextStepRuntime {
  readonly writeOutput: (value: string) => void;
  readonly writeDiagnostic: (value: string) => void;
  readonly runChild: (entry: string, args: readonly string[]) => Promise<ChildResult>;
  readonly forwardSignal: (signal: NodeJS.Signals) => void;
}

function reject(runtime: NextStepRuntime): number {
  runtime.writeDiagnostic("NextStep command rejected\n");
  return 1;
}

export async function runNextStep(
  argv: readonly string[],
  runtime: NextStepRuntime,
): Promise<number> {
  const [command, ...args] = argv;
  if (command === undefined || (command === "--help" && args.length === 0)) {
    runtime.writeOutput(HELP);
    return 0;
  }
  if (command === "--version" && args.length === 0) {
    runtime.writeOutput(`${VERSION}\n`);
    return 0;
  }
  const entry = COMMANDS[command as keyof typeof COMMANDS];
  if (entry === undefined) return reject(runtime);

  try {
    const result = await runtime.runChild(entry, args);
    if (result.signal !== null) {
      runtime.forwardSignal(result.signal);
      return 1;
    }
    return result.code ?? 1;
  } catch {
    return reject(runtime);
  }
}

const nodeRuntime: NextStepRuntime = {
  writeOutput: (value) => process.stdout.write(value),
  writeDiagnostic: (value) => process.stderr.write(value),
  runChild: (entry, args) => new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(entry, import.meta.url)), ...args], {
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectResult);
    child.once("exit", (code, signal) => resolveResult({ code, signal }));
  }),
  forwardSignal: process.kill.bind(process, process.pid),
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
) {
  process.exitCode = await runNextStep(process.argv.slice(2), nodeRuntime);
}
