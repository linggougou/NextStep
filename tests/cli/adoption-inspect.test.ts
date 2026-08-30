import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";

const cli = resolve(process.cwd(), "dist/src/cli/adoption-inspect.js");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-cli-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await mkdir(resolve(root, "docs/exec-plans/active"), { recursive: true });
  await mkdir(resolve(root, ".codex"), { recursive: true });
  await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "# route\n");
  await writeFile(resolve(root, "docs/exec-plans/active/current.md"), "# plan\n");
  await writeFile(resolve(root, ".codex/verification-report.md"), "# verification\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  return root;
}

function args(root: string, extra: readonly string[] = []): string[] {
  return [
    "--project-root", root,
    "--route-lock", "PROJECT_ROUTE_LOCK.md",
    "--active-plan", "docs/exec-plans/active/current.md",
    "--verification-summary", ".codex/verification-report.md",
    ...extra,
  ];
}

function run(cliArgs: readonly string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...cliArgs], { stdio: ["ignore", "pipe", "pipe"] });
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

test("CLI 输出 PROJECT_NOT_ADOPTED 的一份 JCS 候选、阶段建议、未知门禁与零写入说明", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const before = {
    head: git(root, "rev-parse", "HEAD"),
    refs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
    status: git(root, "status", "--porcelain=v2", "--untracked-files=all"),
    objects: git(root, "count-objects", "-v"),
  };
  const result = await run(args(root));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const receipt: any = parseCanonicalJsonBytes(Buffer.from(result.stdout));
  assert.equal(canonicalizeJson(receipt), result.stdout);
  assert.equal(receipt.code, "PROJECT_NOT_ADOPTED");
  assert.equal(receipt.ok, true);
  assert.equal(receipt.data.zero_writes, true);
  assert.equal(receipt.data.next_trusted_action, "review-candidate-in-trusted-host");
  assert.equal(receipt.data.candidate.proposed_projection.stage.value, null);
  assert.equal(receipt.data.candidate.proposed_projection.stage.classification, "unknown");
  assert.doesNotMatch(result.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual({
    head: git(root, "rev-parse", "HEAD"),
    refs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
    status: git(root, "status", "--porcelain=v2", "--untracked-files=all"),
    objects: git(root, "count-objects", "-v"),
  }, before);
});

test("CLI 用 previous candidate 确定性复核，源变化时保留旧摘要并返回 replacement", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const auditRoot = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-audit-"));
  context.after(() => rm(auditRoot, { recursive: true, force: true }));
  const first = await run(args(root));
  const firstReceipt: any = parseCanonicalJsonBytes(Buffer.from(first.stdout));
  const candidatePath = resolve(auditRoot, "candidate.jcs.json");
  await writeFile(candidatePath, canonicalizeJson(firstReceipt.data.candidate));
  const priorBytes = await readFile(candidatePath);
  const repeated = await run(args(root, ["--previous-candidate-file", candidatePath]));
  assert.equal(repeated.code, 0, repeated.stderr);
  const repeatedReceipt: any = parseCanonicalJsonBytes(Buffer.from(repeated.stdout));
  assert.deepEqual(repeatedReceipt.data.candidate, firstReceipt.data.candidate);
  assert.equal(repeatedReceipt.data.candidate_digest, firstReceipt.data.candidate_digest);

  await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "# changed route\n");
  git(root, "add", "PROJECT_ROUTE_LOCK.md");
  git(root, "commit", "-qm", "route drift");
  const stale = await run(args(root, ["--previous-candidate-file", candidatePath]));
  assert.equal(stale.code, 1);
  const staleReceipt: any = parseCanonicalJsonBytes(Buffer.from(stale.stdout));
  assert.equal(staleReceipt.code, "ADOPTION_CANDIDATE_STALE");
  assert.equal(staleReceipt.data.stale_candidate_digest, firstReceipt.data.candidate_digest);
  assert.notEqual(staleReceipt.data.replacement_candidate.candidate_digest, firstReceipt.data.candidate_digest);
  assert.deepEqual(await readFile(candidatePath), priorBytes);
});

test("CLI 对 single ref、extra ref、写参数与相对根给出稳定无敏感值回执", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));

  git(root, "update-ref", "refs/nextstep/formal", git(root, "rev-parse", "HEAD"));
  const incomplete = await run(args(root));
  assert.equal(incomplete.code, 1);
  assert.equal((parseCanonicalJsonBytes(Buffer.from(incomplete.stdout)) as any).code, "REF_PAIR_INCOMPLETE");
  git(root, "update-ref", "-d", "refs/nextstep/formal");
  git(root, "update-ref", "refs/nextstep/extra", git(root, "rev-parse", "HEAD"));
  const conflict = await run(args(root));
  assert.equal(conflict.code, 1);
  assert.equal((parseCanonicalJsonBytes(Buffer.from(conflict.stdout)) as any).code, "ADOPTION_SOURCE_CONFLICT");

  for (const rejectedArgs of [
    ["--project-root", "relative"],
    args(root, ["--commit"]),
    args(root, ["--write"]),
    args(root, ["--force"]),
  ]) {
    const rejected = await run(rejectedArgs);
    assert.equal(rejected.code, 1);
    assert.equal((parseCanonicalJsonBytes(Buffer.from(rejected.stdout)) as any).ok, false);
    assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /update-ref|private-chat|bearer-secret/);
  }
});

test("CLI 源码没有 ref 写入、网络、数据库、daemon 或可信确认入口", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(resolve(process.cwd(), "src/cli/adoption-inspect.ts"), "utf8")
  );
  assert.doesNotMatch(source, /update-ref|--commit|--write|--force|fetch\(|https?:|database|daemon|user[_-]?action|confirmation[_-]?envelope/i);
});
