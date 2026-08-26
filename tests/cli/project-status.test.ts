import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const cli = resolve(process.cwd(), "dist/src/cli/project-status.js");
const fixturePath = resolve(process.cwd(), "tests/fixtures/project-status/available-source.json");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-status-cli-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  git(root, "commit", "--allow-empty", "-qm", "formal");
  const formal = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/nextstep/formal", formal);
  git(root, "commit", "--allow-empty", "-qm", "parent");
  const parent = git(root, "rev-parse", "HEAD");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
  fixture.checkpoint.formal_oid = formal;
  fixture.checkpoint.control_parent_oid = parent;
  fixture.checkpoint.version_signoffs.V1.formal_oid = formal;
  await writeFile(resolve(root, "checkpoint.json"), JSON.stringify(fixture.checkpoint));
  await writeFile(resolve(root, "registry.json"), JSON.stringify(fixture.registry));
  git(root, "add", "checkpoint.json", "registry.json");
  git(root, "commit", "-qm", "control");
  git(root, "update-ref", "refs/nextstep/control", git(root, "rev-parse", "HEAD"));
  return root;
}

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (value: Buffer) => stdout.push(value));
    child.stderr.on("data", (value: Buffer) => stderr.push(value));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

test("CLI 仅接受绝对 --project-root，成功 stdout 恰一份 JCS JSON", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const before = git(root, "status", "--porcelain");
  const result = await run(["--project-root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const projection = parseCanonicalJsonBytes(Buffer.from(result.stdout));
  assert.equal(canonicalizeJson(projection), result.stdout);
  assert.equal((projection as any).status, "available");
  assert.equal(git(root, "status", "--porcelain"), before);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-that-must-not-appear|private-chat|claim|fence/);
});

test("CLI 对缺参、相对路径、额外参数、ref override、write 与 fetch 均失败", async () => {
  for (const args of [
    [],
    ["--project-root", "relative"],
    ["--project-root", process.cwd(), "extra"],
    ["--project-root", process.cwd(), "--formal-ref", "HEAD"],
    ["--project-root", process.cwd(), "--write"],
    ["--project-root", process.cwd(), "--fetch"],
  ]) {
    const result = await run(args);
    assert.notEqual(result.code, 0, args.join(" "));
    assert.equal(result.stdout.split("\n").length, 1);
    const projection = parseCanonicalJsonBytes(Buffer.from(result.stdout));
    assert.equal((projection as any).status, "unavailable");
    assert.equal((projection as any).next_action, null);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-that-must-not-appear|private-chat/);
  }
});
