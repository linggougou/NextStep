import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  ProjectStatusSourceError,
  readProjectStatusSource,
} from "../../../src/adapters/node/project-status-source.ts";

const fixturePath = resolve(process.cwd(), "tests/fixtures/project-status/available-source.json");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repository(options: { multiParent?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "nextstep-status-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "NextStep Test");
  git(root, "config", "user.email", "nextstep@example.invalid");
  await writeFile(resolve(root, "seed"), "formal\n");
  git(root, "add", "seed");
  git(root, "commit", "-qm", "formal");
  const formal = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/nextstep/formal", formal);

  git(root, "commit", "--allow-empty", "-qm", "control parent");
  const parent = git(root, "rev-parse", "HEAD");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as any;
  fixture.checkpoint.formal_oid = formal;
  fixture.checkpoint.control_parent_oid = parent;
  await writeFile(resolve(root, "checkpoint.json"), JSON.stringify(fixture.checkpoint));
  await writeFile(resolve(root, "registry.json"), JSON.stringify(fixture.registry));
  git(root, "add", "checkpoint.json", "registry.json");
  git(root, "commit", "-qm", "control");
  let control = git(root, "rev-parse", "HEAD");
  if (options.multiParent) {
    const tree = git(root, "rev-parse", `${control}^{tree}`);
    const secondParent = git(root, "commit-tree", `${formal}^{tree}`, "-p", formal, "-m", "other");
    control = git(root, "commit-tree", tree, "-p", parent, "-p", secondParent, "-m", "merge control");
  }
  git(root, "update-ref", "refs/nextstep/control", control);
  return root;
}

test("adapter 用 Git plumbing 双读固定 refs、唯一父和两个 blob，且运行零写入", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const fixtureBefore = await readFile(fixturePath);
  const before = {
    formal: git(root, "rev-parse", "refs/nextstep/formal"),
    control: git(root, "rev-parse", "refs/nextstep/control"),
    status: git(root, "status", "--porcelain"),
  };

  const source = await readProjectStatusSource(root, new Date("2026-08-26T05:00:00Z"));
  assert.equal(source.formal_oid, before.formal);
  assert.equal(source.control_oid, before.control);
  assert.equal(source.control_parent_oid, git(root, "rev-parse", `${before.control}^`));
  assert.match(source.checkpoint_blob_oid, /^[a-f0-9]{40}$/);
  assert.match(source.registry_blob_oid, /^[a-f0-9]{40}$/);
  assert.equal(source.observed_at, "2026-08-26T05:00:00.000Z");

  const after = {
    formal: git(root, "rev-parse", "refs/nextstep/formal"),
    control: git(root, "rev-parse", "refs/nextstep/control"),
    status: git(root, "status", "--porcelain"),
  };
  assert.deepEqual(after, before);
  assert.deepEqual(await readFile(fixturePath), fixtureBefore);
});

test("adapter 拒绝相对项目根、缺 ref 与 control 多父", async (context) => {
  await assert.rejects(() => readProjectStatusSource("relative/path"), ProjectStatusSourceError);

  const missing = await mkdtemp(resolve(tmpdir(), "nextstep-status-missing-"));
  context.after(() => rm(missing, { recursive: true, force: true }));
  git(missing, "init", "-q");
  await assert.rejects(() => readProjectStatusSource(missing), ProjectStatusSourceError);

  const multiParent = await repository({ multiParent: true });
  context.after(() => rm(multiParent, { recursive: true, force: true }));
  await assert.rejects(() => readProjectStatusSource(multiParent), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "INVALID_CONTROL_COMMIT");
    return true;
  });
});

test("namespace 为空、单 ref、extra-only 与 pair+extra 返回精确分类", async (context) => {
  const empty = await mkdtemp(resolve(tmpdir(), "nextstep-status-namespace-"));
  context.after(() => rm(empty, { recursive: true, force: true }));
  git(empty, "init", "-q");
  git(empty, "config", "user.name", "NextStep Test");
  git(empty, "config", "user.email", "nextstep@example.invalid");
  git(empty, "commit", "--allow-empty", "-qm", "seed");
  await assert.rejects(() => readProjectStatusSource(empty), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "PROJECT_NOT_ADOPTED");
    return true;
  });
  const head = git(empty, "rev-parse", "HEAD");
  git(empty, "update-ref", "refs/nextstep/formal", head);
  await assert.rejects(() => readProjectStatusSource(empty), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "REF_PAIR_INCOMPLETE");
    return true;
  });
  git(empty, "update-ref", "-d", "refs/nextstep/formal");
  git(empty, "update-ref", "refs/nextstep/extra", head);
  await assert.rejects(() => readProjectStatusSource(empty), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "ADOPTION_SOURCE_CONFLICT");
    return true;
  });
  git(empty, "update-ref", "refs/nextstep/formal", head);
  git(empty, "update-ref", "refs/nextstep/control", head);
  await assert.rejects(() => readProjectStatusSource(empty), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "ADOPTION_SOURCE_CONFLICT");
    return true;
  });
});

test("adapter 源码不含 checkout/fetch/commit/update-ref/缓存或 Markdown 扫描", async () => {
  const source = await readFile(resolve(process.cwd(), "src/adapters/node/project-status-source.ts"), "utf8");
  assert.doesNotMatch(source, /\b(?:checkout|fetch|update-ref)\b|cache|Markdown|\.md\b/);
  assert.equal(source.match(/await readRefPair\(projectRoot\)/g)?.length, 2);
});

test("adapter 拒绝非法 clock、非提交 formal、缺 blob 与畸形 JSON", async (context) => {
  await assert.rejects(
    () => readProjectStatusSource(resolve(tmpdir(), "missing"), new Date(Number.NaN)),
    ProjectStatusSourceError,
  );

  const nonCommit = await repository();
  context.after(() => rm(nonCommit, { recursive: true, force: true }));
  const blob = execFileSync("git", ["-C", nonCommit, "hash-object", "-w", "--stdin"], {
    encoding: "utf8",
    input: "not a formal commit",
  }).trim();
  git(nonCommit, "update-ref", "refs/nextstep/formal", blob);
  await assert.rejects(() => readProjectStatusSource(nonCommit), ProjectStatusSourceError);

  const missingBlob = await repository();
  context.after(() => rm(missingBlob, { recursive: true, force: true }));
  await rm(resolve(missingBlob, "checkpoint.json"));
  git(missingBlob, "add", "-u");
  git(missingBlob, "commit", "-qm", "missing checkpoint");
  git(missingBlob, "update-ref", "refs/nextstep/control", git(missingBlob, "rev-parse", "HEAD"));
  await assert.rejects(() => readProjectStatusSource(missingBlob), ProjectStatusSourceError);

  const malformed = await repository();
  context.after(() => rm(malformed, { recursive: true, force: true }));
  await writeFile(resolve(malformed, "checkpoint.json"), "{");
  git(malformed, "add", "checkpoint.json");
  git(malformed, "commit", "-qm", "malformed checkpoint");
  git(malformed, "update-ref", "refs/nextstep/control", git(malformed, "rev-parse", "HEAD"));
  await assert.rejects(() => readProjectStatusSource(malformed), ProjectStatusSourceError);
});

test("带 adopted-baseline blob 的 control 必须以零父 genesis 为唯一父", async (context) => {
  const root = await repository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "adopted-baseline.json"), "{}");
  git(root, "add", "adopted-baseline.json");
  git(root, "commit", "-qm", "invalid adopted control");
  git(root, "update-ref", "refs/nextstep/control", git(root, "rev-parse", "HEAD"));
  await assert.rejects(() => readProjectStatusSource(root), (error: unknown) => {
    assert.ok(error instanceof ProjectStatusSourceError);
    assert.equal(error.code, "INVALID_CONTROL_COMMIT");
    return true;
  });
});
