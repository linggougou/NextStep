import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { runNextStep, type NextStepRuntime } from "../../src/cli/nextstep.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const compiledCli = resolve(process.cwd(), "dist/src/cli/nextstep.js");
const quickstart = resolve(process.cwd(), "examples/quickstart/version-chain.json");
const publicCommands = [
  "status",
  "requirement-intake",
  "requirement-freeze",
  "product-definition",
  "interaction-prototype",
  "carrier-decision",
  "acceptance-profile",
  "write-consistency",
  "source-validate",
  "version-chain",
  "major-milestone",
  "small-milestone",
  "execution-packet",
] as const;

interface ProcessResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  args: readonly string[],
  input = "",
  cli = compiledCli,
): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolveResult({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function statusRepository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-alpha-status-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  git(root, "commit", "--allow-empty", "-qm", "formal");
  const formal = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/nextstep/formal", formal);
  git(root, "commit", "--allow-empty", "-qm", "parent");
  const parent = git(root, "rev-parse", "HEAD");
  const fixture = JSON.parse(
    await readFile(resolve(process.cwd(), "tests/fixtures/project-status/available-source.json"), "utf8"),
  ) as any;
  fixture.checkpoint.formal_oid = formal;
  fixture.checkpoint.control_parent_oid = parent;
  fixture.checkpoint.version_signoffs.V1.formal_oid = formal;
  fixture.registry.tasks[2].dispatch_claim.lease_expires_at = new Date(
    Date.now() + 24 * 60 * 60 * 1_000,
  ).toISOString();
  await writeFile(resolve(root, "checkpoint.json"), JSON.stringify(fixture.checkpoint));
  await writeFile(resolve(root, "registry.json"), JSON.stringify(fixture.registry));
  git(root, "add", "checkpoint.json", "registry.json");
  git(root, "commit", "-qm", "control");
  git(root, "update-ref", "refs/nextstep/control", git(root, "rev-parse", "HEAD"));
  return root;
}

function fakeRuntime(
  runChild: NextStepRuntime["runChild"],
) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const signals: NodeJS.Signals[] = [];
  const runtime: NextStepRuntime = {
    runChild,
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    forwardSignal(signal) { signals.push(signal); },
  };
  return { runtime, output, diagnostics, signals };
}

test("调度核心覆盖 help/version/子进程退出、异常与 signal 的确定性边界", async () => {
  const calls: Array<{ entry: string; args: readonly string[] }> = [];
  const successful = fakeRuntime(async (entry, args) => {
    calls.push({ entry, args });
    return { code: 7, signal: null };
  });
  assert.equal(await runNextStep([], successful.runtime), 0);
  assert.equal(await runNextStep(["--help"], successful.runtime), 0);
  assert.equal(await runNextStep(["--version"], successful.runtime), 0);
  assert.equal(await runNextStep(["status", "--project-root", "/tmp/project"], successful.runtime), 7);
  assert.deepEqual(calls, [{ entry: "project-status.js", args: ["--project-root", "/tmp/project"] }]);

  for (const args of [["--help", "extra"], ["--version", "extra"], ["unknown"]]) {
    assert.equal(await runNextStep(args, successful.runtime), 1);
  }
  assert.equal(calls.length, 1);

  const failedSpawn = fakeRuntime(async () => { throw new Error("sensitive spawn detail"); });
  assert.equal(await runNextStep(["version-chain"], failedSpawn.runtime), 1);
  assert.deepEqual(failedSpawn.diagnostics, ["NextStep command rejected\n"]);

  const signalled = fakeRuntime(async () => ({ code: null, signal: "SIGTERM" }));
  assert.equal(await runNextStep(["version-chain"], signalled.runtime), 1);
  assert.deepEqual(signalled.signals, ["SIGTERM"]);

  const missingCode = fakeRuntime(async () => ({ code: null, signal: null }));
  assert.equal(await runNextStep(["version-chain"], missingCode.runtime), 1);
});

test("统一入口只展示冻结的 13 个公开命令，并固定 alpha 版本", async () => {
  const [withoutArgs, help, version] = await Promise.all([
    run([]),
    run(["--help"]),
    run(["--version"]),
  ]);

  for (const result of [withoutArgs, help]) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    for (const command of publicCommands) assert.match(result.stdout, new RegExp(`^  ${command}$`, "m"));
    assert.equal(result.stdout.match(/^  [a-z][a-z-]*$/gm)?.length, publicCommands.length);
    assert.doesNotMatch(result.stdout, /contract-probe|project-value-validation|\.git|refs\/nextstep|\//);
  }
  assert.equal(withoutArgs.stdout, help.stdout);
  assert.deepEqual(version, {
    code: 0,
    signal: null,
    stdout: "0.2.0-alpha\n",
    stderr: "",
  });
});

test("version-chain 通过统一入口保持 canonical JCS、stderr 与退出码", async () => {
  const input = await readFile(quickstart, "utf8");
  const result = await run(["version-chain"], input);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  const receipt = parseCanonicalJsonBytes(Buffer.from(result.stdout, "utf8")) as Record<string, unknown>;
  assert.equal(canonicalizeJson(receipt), result.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "VERSION_CHAIN_ACCEPTED");
});

test("status 参数逐项透传，并保留成功与失败退出码", async (context) => {
  const root = await statusRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const accepted = await run(["status", "--project-root", root]);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.stderr, "");
  assert.equal((parseCanonicalJsonBytes(Buffer.from(accepted.stdout)) as any).status, "available");

  const rejected = await run(["status", "--project-root", "relative"]);
  assert.equal(rejected.code, 1);
  assert.equal((parseCanonicalJsonBytes(Buffer.from(rejected.stdout)) as any).status, "unavailable");
});

test("未知、内部、大小写与路径形态命令 fail closed 且不回显敏感值", async () => {
  const secret = "secret-value-that-must-not-appear";
  const absoluteAttempt = resolve(process.cwd(), "dist/src/cli/contract-probe.js");
  for (const command of [
    "unknown-command",
    "contract-probe",
    "project-value-validation",
    "VERSION-CHAIN",
    "../version-chain",
    "dist/src/cli/version-chain.js",
    absoluteAttempt,
  ]) {
    const result = await run([command, secret], secret);
    assert.equal(result.code, 1, command);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "NextStep command rejected\n");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /contract-probe|project-value-validation|dist\/src|\.git/);
  }
});

test("聚合器不会为可信写入命令注入 verifier 或文件系统 capability", async () => {
  const secret = "bearer-secret-that-must-not-appear";
  const result = await run(["write-consistency", "--commit"], canonicalizeJson({
    authorization: secret,
  }));
  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret, "i"));
  assert.match(result.stderr, /blocked|rejected/i);
});
