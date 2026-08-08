import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { createTemporaryGitFixture } from "./git-fixture.ts";

const execFile = promisify(execFileCallback);

async function readNextStepRefs(repositoryRoot: string): Promise<string> {
  const { stdout } = await execFile("git", [
    "-C",
    repositoryRoot,
    "for-each-ref",
    "--format=%(refname) %(objectname)",
    "refs/nextstep/formal",
    "refs/nextstep/control",
  ]);
  return stdout;
}

async function readRepositorySnapshot(repositoryRoot: string): Promise<{
  readonly head: string;
  readonly refs: string;
  readonly status: string;
}> {
  const [{ stdout: head }, { stdout: status }, refs] = await Promise.all([
    execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]),
    execFile("git", ["-C", repositoryRoot, "status", "--porcelain=v1"]),
    readNextStepRefs(repositoryRoot),
  ]);

  return { head, refs, status };
}

test("temporary Git fixture is initialized, cleanly removed, and leaves the current repository unchanged", async () => {
  const repositoryRoot = process.cwd();
  const before = await readRepositorySnapshot(repositoryRoot);
  const fixture = await createTemporaryGitFixture();

  try {
    const { stdout: status } = await execFile("git", [
      "-C",
      fixture.path,
      "status",
      "--porcelain",
    ]);
    const { stdout: head } = await execFile("git", [
      "-C",
      fixture.path,
      "rev-parse",
      "HEAD",
    ]);

    assert.equal(status, "");
    assert.equal(head.trim(), fixture.initialCommit);
    assert.notEqual(fixture.path, repositoryRoot);
  } finally {
    await fixture.cleanup();
  }

  await assert.rejects(access(fixture.path));
  assert.deepEqual(await readRepositorySnapshot(repositoryRoot), before);
});

test("temporary Git fixture ignores inherited system/global configuration and template hooks", async () => {
  const contaminationRoot = await mkdtemp(join(tmpdir(), "nextstep-git-contamination-"));
  const templateDirectory = join(contaminationRoot, "template");
  const hookDirectory = join(templateDirectory, "hooks");
  const configurationPath = join(contaminationRoot, "gitconfig");
  await mkdir(hookDirectory, { recursive: true });
  await writeFile(join(hookDirectory, "pre-commit"), "#!/bin/sh\nexit 1\n", "utf8");
  await writeFile(
    configurationPath,
    `[init]\n\ttemplateDir = ${templateDirectory}\n[user]\n\tname = Contaminating User\n`,
    "utf8",
  );

  const fixture = await createTemporaryGitFixture({
    environment: {
      ...process.env,
      GIT_CONFIG_GLOBAL: configurationPath,
      GIT_CONFIG_SYSTEM: configurationPath,
      GIT_TEMPLATE_DIR: templateDirectory,
    },
  });

  try {
    await assert.rejects(access(join(fixture.path, ".git", "hooks", "pre-commit")));
    const { stdout } = await execFile("git", [
      "-C",
      fixture.path,
      "config",
      "--show-origin",
      "--get",
      "user.name",
    ]);
    assert.match(stdout, /\.git\/config/);
    assert.doesNotMatch(stdout, /Contaminating User/);
  } finally {
    await fixture.cleanup();
    await rm(contaminationRoot, { force: true, recursive: true });
  }
});

test("temporary Git fixture removes inherited Git path redirection variables", async () => {
  const externalRoot = await mkdtemp(join(tmpdir(), "nextstep-git-external-"));
  const redirectedGitDirectory = join(externalRoot, "redirected.git");
  const redirectedWorktree = join(externalRoot, "redirected-worktree");
  const redirectedIndex = join(externalRoot, "redirected.index");
  const redirectedObjects = join(externalRoot, "objects");

  const fixture = await createTemporaryGitFixture({
    environment: {
      ...process.env,
      GIT_DIR: redirectedGitDirectory,
      GIT_WORK_TREE: redirectedWorktree,
      GIT_INDEX_FILE: redirectedIndex,
      GIT_OBJECT_DIRECTORY: redirectedObjects,
      GIT_CONFIG_PARAMETERS: "'core.bare=true'",
    },
  });

  try {
    const { stdout } = await execFile("git", [
      "-C",
      fixture.path,
      "rev-parse",
      "--git-dir",
    ]);
    assert.equal(stdout.trim(), ".git");
    await assert.rejects(access(redirectedGitDirectory));
    await assert.rejects(access(redirectedWorktree));
    await assert.rejects(access(redirectedIndex));
    await assert.rejects(access(redirectedObjects));
  } finally {
    await fixture.cleanup();
    await rm(externalRoot, { force: true, recursive: true });
  }
});

test("temporary Git fixture cleanup can be retried after a deletion failure", async () => {
  let deleteAttempts = 0;
  const fixture = await createTemporaryGitFixture({
    removeDirectory: async (directory) => {
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        throw new Error("injected cleanup failure");
      }
      await rm(directory, { force: true, recursive: true });
    },
  });

  await assert.rejects(fixture.cleanup(), /injected cleanup failure/);
  await access(fixture.path);
  await fixture.cleanup();

  assert.equal(deleteAttempts, 2);
  await assert.rejects(access(fixture.path));
});
