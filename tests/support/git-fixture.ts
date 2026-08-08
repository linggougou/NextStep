import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export interface TemporaryGitFixture {
  readonly initialCommit: string;
  readonly path: string;
  cleanup(): Promise<void>;
}

export interface CreateTemporaryGitFixtureOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly removeDirectory?: (directory: string) => Promise<void>;
}

function createIsolatedGitEnvironment(
  inheritedEnvironment: NodeJS.ProcessEnv,
  templateDirectory: string,
): NodeJS.ProcessEnv {
  const environment = { ...inheritedEnvironment };

  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) {
      delete environment[key];
    }
  }

  return {
    ...environment,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TEMPLATE_DIR: templateDirectory,
  };
}

async function runGit(
  directory: string,
  environment: NodeJS.ProcessEnv,
  ...args: string[]
): Promise<string> {
  const { stdout } = await execFile("git", ["-C", directory, ...args], {
    env: environment,
  });
  return stdout.trim();
}

export async function createTemporaryGitFixture(
  options: CreateTemporaryGitFixtureOptions = {},
): Promise<TemporaryGitFixture> {
  const root = await mkdtemp(join(tmpdir(), "nextstep-git-fixture-"));
  const path = join(root, "repository");
  const templateDirectory = join(root, "template");
  const environment = createIsolatedGitEnvironment(
    options.environment ?? process.env,
    templateDirectory,
  );
  const removeDirectory = options.removeDirectory ?? ((directory: string) =>
    rm(directory, { force: true, recursive: true }));

  try {
    await Promise.all([
      mkdir(path, { recursive: true }),
      mkdir(templateDirectory, { recursive: true }),
    ]);
    await runGit(
      path,
      environment,
      "init",
      "--initial-branch=fixture-main",
      `--template=${templateDirectory}`,
    );
    await runGit(path, environment, "config", "user.name", "NextStep Test");
    await runGit(path, environment, "config", "user.email", "nextstep-test@example.invalid");
    await writeFile(join(path, "README.md"), "# NextStep fixture\n", "utf8");
    await runGit(path, environment, "add", "README.md");
    await runGit(path, environment, "commit", "--quiet", "-m", "Create fixture");

    const initialCommit = await runGit(path, environment, "rev-parse", "HEAD");
    let cleaned = false;

    return {
      initialCommit,
      path,
      async cleanup(): Promise<void> {
        if (!cleaned) {
          await removeDirectory(root);
          cleaned = true;
        }
      },
    };
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}
