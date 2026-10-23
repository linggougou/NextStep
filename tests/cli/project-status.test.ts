import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { readAdoptionInspectSource } from "../../src/adapters/node/adoption-inspect-source.ts";
import { activateAdoption } from "../../src/adapters/node/adoption-ref-store.ts";
import { createAdoptionCandidate } from "../../src/domain/adoption-candidate.ts";
import { createAdoptionConfirmationView, verifyAdoptionConfirmation } from "../../src/domain/adopted-baseline.ts";

const cli = resolve(process.cwd(), "dist/src/cli/project-status.js");
const fixturePath = resolve(process.cwd(), "tests/fixtures/project-status/available-source.json");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repository(extraRefs: readonly string[] = []): Promise<string> {
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
  fixture.registry.tasks[2].dispatch_claim.lease_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  await writeFile(resolve(root, "checkpoint.json"), JSON.stringify(fixture.checkpoint));
  await writeFile(resolve(root, "registry.json"), JSON.stringify(fixture.registry));
  git(root, "add", "checkpoint.json", "registry.json");
  git(root, "commit", "-qm", "control");
  const control = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/nextstep/control", control);
  for (const ref of extraRefs) {
    git(root, "update-ref", ref, control);
  }
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
  assert.equal((projection as any).freshness, "current");
  assert.equal(git(root, "status", "--porcelain"), before);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-that-must-not-appear|private-chat|\bclaim\b|\bfence\b/);
});

test("CLI 在已知 evidence 子命名空间存在时仍返回 available", async (context) => {
  const root = await repository([
    "refs/nextstep/evidence/automated-test",
    "refs/nextstep/evidence/user-signoff",
  ]);
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await run(["--project-root", root]);
  assert.equal(result.code, 0, result.stderr);
  const projection = parseCanonicalJsonBytes(Buffer.from(result.stdout)) as any;
  assert.equal(projection.status, "available");
  assert.equal(projection.source.kind, "native");
  assert.equal(result.stderr, "");
});

test("CLI 对未知 nextstep 子命名空间继续 fail closed", async (context) => {
  const root = await repository(["refs/nextstep/unknown/mutating-surface"]);
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await run(["--project-root", root]);
  assert.notEqual(result.code, 0);
  const projection = parseCanonicalJsonBytes(Buffer.from(result.stdout)) as any;
  assert.equal(projection.status, "unavailable");
  assert.deepEqual(projection.unavailable_reasons, ["adoption-source-conflict"]);
  assert.equal(result.stderr, "PROJECT_STATUS_UNAVAILABLE:adoption-source-conflict\n");
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

test("CLI 对 adopted baseline 返回 available/null 正式结论，且无公开写参数", async (context) => {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-status-adopted-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await mkdir(resolve(root, "docs/exec-plans/active"), { recursive: true });
  await mkdir(resolve(root, ".codex"), { recursive: true });
  await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "route\n");
  await writeFile(resolve(root, "docs/exec-plans/active/current.md"), "plan\n");
  await writeFile(resolve(root, ".codex/verification-report.md"), "evidence\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  const candidate = createAdoptionCandidate(await readAdoptionInspectSource({
    projectRoot: root,
    routeLockPath: "PROJECT_ROUTE_LOCK.md",
    activePlanPath: "docs/exec-plans/active/current.md",
    evidencePaths: [".codex/verification-report.md"],
  }, { now: () => new Date("2026-08-30T09:00:00.000Z") }));
  const adoptedProjection = { stage: "S5", milestone: "M1", scope: "existing-project-baseline" } as const;
  const confirmationView = createAdoptionConfirmationView(candidate, adoptedProjection);
  const verifier = {
    verifier_kind: "trusted-host" as const,
    verify: () => true,
    reconstructConfirmationView: () => confirmationView,
  };
  const confirmation = verifyAdoptionConfirmation(candidate, {
    candidate_digest: candidate.candidate_digest,
    confirmation_view: confirmationView,
    displayed_view_digest: confirmationView.view_digest,
    user_action_ref: "cli-host-action",
    session_identity: `sha256:${"b".repeat(64)}`,
    verifier_identity: "trusted-host-v1",
    verified_at_trusted: "2026-08-30T09:01:00.000Z",
    expires_at_trusted: "2026-08-30T09:10:00.000Z",
    nonce_or_replay_key: "cli-nonce",
    decision: "confirm",
  }, verifier, () => new Date("2026-08-30T09:02:00.000Z"));
  await activateAdoption({
    projectRoot: root, candidate, confirmation,
    roles: { candidate_actor_id: "inspect", activation_actor_id: "host", independent_acceptance_actor_id: "review" },
    projection: adoptedProjection,
    now: () => new Date("2026-08-30T09:03:00.000Z"),
  });
  const accepted = await run(["--project-root", root]);
  assert.equal(accepted.code, 0, accepted.stderr);
  const projection = parseCanonicalJsonBytes(Buffer.from(accepted.stdout)) as any;
  assert.equal(projection.status, "available");
  assert.equal(projection.latest_formal_conclusion, null);
  assert.equal(projection.source.kind, "adopted-baseline");
  for (const flag of ["--commit", "--rollback", "--force"]) {
    const rejected = await run(["--project-root", root, flag]);
    assert.notEqual(rejected.code, 0);
  }
});
