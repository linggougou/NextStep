import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  AdoptionInspectSourceError,
  readAdoptionInspectSource,
} from "../../../src/adapters/node/adoption-inspect-source.ts";
import { createAdoptionCandidate } from "../../../src/domain/adoption-candidate.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-inspect-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await mkdir(resolve(root, "docs/exec-plans/active"), { recursive: true });
  await mkdir(resolve(root, ".codex"), { recursive: true });
  await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "# route\n\n当前阶段：S5 / M1\n");
  await writeFile(resolve(root, "docs/exec-plans/active/current.md"), "# active plan\n");
  await writeFile(resolve(root, ".codex/verification-report.md"), "# verification\n\n未验证。\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  return root;
}

const options = (projectRoot: string) => ({
  projectRoot,
  routeLockPath: "PROJECT_ROUTE_LOCK.md",
  activePlanPath: "docs/exec-plans/active/current.md",
  evidencePaths: [".codex/verification-report.md"],
});

const fixedClock = { now: () => new Date("2026-08-30T09:00:00.000Z") };

test("非法项目根、clock 与 source role 在任何 Git 读取前 fail closed", async () => {
  await assert.rejects(
    () => readAdoptionInspectSource(options("relative/project"), fixedClock),
    (error: unknown) => {
      assert.ok(error instanceof AdoptionInspectSourceError);
      assert.equal(error.code, "INVALID_PROJECT_ROOT");
      return true;
    },
  );
  await assert.rejects(
    () => readAdoptionInspectSource(options(resolve(tmpdir(), "missing-adoption-root")), fixedClock),
    AdoptionInspectSourceError,
  );

  const root = await repository();
  try {
    await assert.rejects(
      () => readAdoptionInspectSource(options(root), { now: () => new Date(Number.NaN) }),
      AdoptionInspectSourceError,
    );
    await assert.rejects(
      () => readAdoptionInspectSource({ ...options(root), evidencePaths: [] }, fixedClock),
      AdoptionInspectSourceError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("只从候选 HEAD blobs 生成稳定 source，且对象库、refs、index、工作树零写入", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const before = {
    head: git(root, "rev-parse", "HEAD"),
    refs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
    status: git(root, "status", "--porcelain=v2", "--untracked-files=all"),
    objects: git(root, "count-objects", "-v"),
    index: await readFile(resolve(root, ".git/index")),
  };

  const first = await readAdoptionInspectSource(options(root), fixedClock);
  const second = await readAdoptionInspectSource(options(root), fixedClock);
  assert.deepEqual(first, second);
  assert.equal(first.namespace_status, "PROJECT_NOT_ADOPTED");
  assert.equal(first.candidate_head_oid, before.head);
  assert.equal(createAdoptionCandidate(first).candidate_digest, createAdoptionCandidate(second).candidate_digest);
  assert.equal(first.route_lock.path, "PROJECT_ROUTE_LOCK.md");
  assert.equal(first.evidence_sources[0]?.classification, "unknown");

  assert.deepEqual({
    head: git(root, "rev-parse", "HEAD"),
    refs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
    status: git(root, "status", "--porcelain=v2", "--untracked-files=all"),
    objects: git(root, "count-objects", "-v"),
    index: await readFile(resolve(root, ".git/index")),
  }, before);
});

test("工作树文本、staged、untracked、缺失 blob 与越界路径全部 fail closed", async (context) => {
  const dirty = await repository();
  context.after(() => rm(dirty, { recursive: true, force: true }));
  await writeFile(resolve(dirty, "PROJECT_ROUTE_LOCK.md"), "# mutable worktree impostor\n");
  await assert.rejects(() => readAdoptionInspectSource(options(dirty), fixedClock), AdoptionInspectSourceError);

  const staged = await repository();
  context.after(() => rm(staged, { recursive: true, force: true }));
  await writeFile(resolve(staged, "new.txt"), "staged\n");
  git(staged, "add", "new.txt");
  await assert.rejects(() => readAdoptionInspectSource(options(staged), fixedClock), AdoptionInspectSourceError);

  const untracked = await repository();
  context.after(() => rm(untracked, { recursive: true, force: true }));
  await writeFile(resolve(untracked, "new.txt"), "untracked\n");
  await assert.rejects(() => readAdoptionInspectSource(options(untracked), fixedClock), AdoptionInspectSourceError);

  const missing = await repository();
  context.after(() => rm(missing, { recursive: true, force: true }));
  await assert.rejects(
    () => readAdoptionInspectSource({ ...options(missing), activePlanPath: "docs/missing.md" }, fixedClock),
    AdoptionInspectSourceError,
  );
  await assert.rejects(
    () => readAdoptionInspectSource({ ...options(missing), activePlanPath: "../outside.md" }, fixedClock),
    AdoptionInspectSourceError,
  );
  await assert.rejects(
    () => readAdoptionInspectSource({ ...options(missing), activePlanPath: "README.md" }, fixedClock),
    AdoptionInspectSourceError,
  );
});

test("single ref、extra-only 与 pair+extra 分类稳定且绝不自动补齐", async (context) => {
  const single = await repository();
  context.after(() => rm(single, { recursive: true, force: true }));
  git(single, "update-ref", "refs/nextstep/formal", git(single, "rev-parse", "HEAD"));
  await assert.rejects(() => readAdoptionInspectSource(options(single), fixedClock), (error: unknown) => {
    assert.ok(error instanceof AdoptionInspectSourceError);
    assert.equal(error.code, "REF_PAIR_INCOMPLETE");
    assert.deepEqual(error.missing_refs, ["refs/nextstep/control"]);
    return true;
  });

  const extra = await repository();
  context.after(() => rm(extra, { recursive: true, force: true }));
  git(extra, "update-ref", "refs/nextstep/extra", git(extra, "rev-parse", "HEAD"));
  await assert.rejects(() => readAdoptionInspectSource(options(extra), fixedClock), (error: unknown) => {
    assert.ok(error instanceof AdoptionInspectSourceError);
    assert.equal(error.code, "ADOPTION_SOURCE_CONFLICT");
    return true;
  });

  const pairExtra = await repository();
  context.after(() => rm(pairExtra, { recursive: true, force: true }));
  const head = git(pairExtra, "rev-parse", "HEAD");
  for (const ref of ["formal", "control", "extra"]) git(pairExtra, "update-ref", `refs/nextstep/${ref}`, head);
  await assert.rejects(() => readAdoptionInspectSource(options(pairExtra), fixedClock), AdoptionInspectSourceError);
});

test("ignored 真源遮蔽、symlink blob、多 worktree 与敏感 blob 均拒绝", async (context) => {
  const ignored = await repository();
  context.after(() => rm(ignored, { recursive: true, force: true }));
  await writeFile(resolve(ignored, ".gitignore"), "docs/ignored-plan.md\n");
  git(ignored, "add", ".gitignore");
  git(ignored, "commit", "-qm", "ignore policy");
  await writeFile(resolve(ignored, "docs/ignored-plan.md"), "shadow\n");
  await assert.rejects(
    () => readAdoptionInspectSource({ ...options(ignored), activePlanPath: "docs/ignored-plan.md" }, fixedClock),
    AdoptionInspectSourceError,
  );

  const symlink = await repository();
  context.after(() => rm(symlink, { recursive: true, force: true }));
  await rm(resolve(symlink, "docs/exec-plans/active/current.md"));
  await import("node:fs/promises").then(({ symlink: createSymlink }) =>
    createSymlink("../../../PROJECT_ROUTE_LOCK.md", resolve(symlink, "docs/exec-plans/active/current.md"))
  );
  git(symlink, "add", "docs/exec-plans/active/current.md");
  git(symlink, "commit", "-qm", "symlink plan");
  await assert.rejects(() => readAdoptionInspectSource(options(symlink), fixedClock), AdoptionInspectSourceError);

  const multi = await repository();
  context.after(() => rm(multi, { recursive: true, force: true }));
  const other = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-other-"));
  context.after(() => rm(other, { recursive: true, force: true }));
  await rm(other, { recursive: true, force: true });
  git(multi, "worktree", "add", "--detach", other, "HEAD");
  await assert.rejects(() => readAdoptionInspectSource(options(multi), fixedClock), AdoptionInspectSourceError);

  const sensitive = await repository();
  context.after(() => rm(sensitive, { recursive: true, force: true }));
  await writeFile(resolve(sensitive, ".codex/verification-report.md"), "access_token=abcdefghijklmno\n");
  git(sensitive, "add", ".codex/verification-report.md");
  git(sensitive, "commit", "-qm", "sensitive evidence");
  await assert.rejects(() => readAdoptionInspectSource(options(sensitive), fixedClock), AdoptionInspectSourceError);
});

test("HEAD、blob、namespace 与 worktree-list 在双读之间变化统一返回 stale", async (context) => {
  const cases: Array<(root: string) => Promise<void>> = [
    async (root) => {
      await writeFile(resolve(root, "PROJECT_ROUTE_LOCK.md"), "# changed route\n");
      git(root, "add", "PROJECT_ROUTE_LOCK.md");
      git(root, "commit", "-qm", "head and blob drift");
    },
    async (root) => {
      git(root, "update-ref", "refs/nextstep/formal", git(root, "rev-parse", "HEAD"));
    },
    async (root) => {
      const other = await mkdtemp(resolve(tmpdir(), "nextstep-adoption-drift-worktree-"));
      await rm(other, { recursive: true, force: true });
      context.after(() => rm(other, { recursive: true, force: true }));
      git(root, "worktree", "add", "--detach", other, "HEAD");
    },
  ];
  for (const mutate of cases) {
    const root = await repository();
    context.after(() => rm(root, { recursive: true, force: true }));
    await assert.rejects(
      () => readAdoptionInspectSource(options(root), fixedClock, { beforeRecheck: () => mutate(root) }),
      (error: unknown) => {
        assert.ok(error instanceof AdoptionInspectSourceError);
        assert.equal(error.code, "ADOPTION_CANDIDATE_STALE");
        return true;
      },
    );
  }
});

test("adapter 源码不包含 ref 写入、fetch、checkout、commit 或工作树正文读取", async () => {
  const source = await readFile(resolve(process.cwd(), "src/adapters/node/adoption-inspect-source.ts"), "utf8");
  assert.doesNotMatch(source, /"(?:update-ref|fetch|checkout|commit)"|\b(?:writeFile|appendFile|readFile)\b/);
  assert.match(source, /cat-file/);
  assert.match(source, /ls-tree/);
  assert.match(source, /for-each-ref/);
});
