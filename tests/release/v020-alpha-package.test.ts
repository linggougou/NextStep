import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";

const publicCliFiles = [
  "nextstep",
  "project-status",
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

const packageFiles = [
  "dist/src/adapters/**/*.js",
  "dist/src/domain/**/*.js",
  ...publicCliFiles.map((name) => `dist/src/cli/${name}.js`),
  "dist/schemas/v1/**/*.json",
  "dist/schemas/v2/product-definition.schema.json",
  "skills/nextstep/SKILL.md",
  "skills/nextstep/agents/openai.yaml",
  "README.md",
  "examples/quickstart/version-chain.json",
  "docs/releases/v0.2.0-alpha.md",
] as const;

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], options: {
  readonly cwd?: string;
  readonly input?: string;
} = {}): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolveResult({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(options.input ?? "");
  });
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(path));
}

test("alpha package metadata 固定 private/UNLICENSED/bin/files 且不扩依赖或生命周期", async () => {
  const metadata = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as any;
  assert.equal(metadata.version, "0.2.0-alpha");
  assert.equal(metadata.private, true);
  assert.equal(metadata.license, "UNLICENSED");
  assert.deepEqual(metadata.bin, { nextstep: "dist/src/cli/nextstep.js" });
  assert.deepEqual(metadata.files, packageFiles);
  assert.equal("main" in metadata, false);
  assert.equal("exports" in metadata, false);
  for (const name of ["prepack", "prepare", "postinstall", "prepublish", "prepublishOnly"]) {
    assert.equal(name in metadata.scripts, false, name);
  }
  assert.deepEqual(metadata.dependencies, { ajv: "8.20.0" });
  assert.deepEqual(metadata.devDependencies, {
    "@types/node": "24.13.3",
    "es-module-lexer": "2.3.1",
    typescript: "7.0.2",
  });
});

test("真实 tgz 仅含显式运行时闭包，并可离线临时安装与 smoke", async (context) => {
  const packagingRoot = await mkdtemp(resolve(tmpdir(), "nextstep-alpha-pack-"));
  const consumerRoot = await mkdtemp(resolve(tmpdir(), "nextstep-alpha-consumer-"));
  context.after(async () => {
    await Promise.all([
      rm(packagingRoot, { recursive: true, force: true }),
      rm(consumerRoot, { recursive: true, force: true }),
    ]);
  });

  const packed = await run("corepack", [
    "pnpm",
    "pack",
    "--pack-destination",
    packagingRoot,
  ], { cwd: process.cwd() });
  assert.equal(packed.code, 0, packed.stderr);
  const tarball = resolve(packagingRoot, "nextstep-0.2.0-alpha.tgz");
  assert.equal((await stat(tarball)).isFile(), true);
  const tarList = await run("tar", ["-tzf", tarball]);
  assert.equal(tarList.code, 0, tarList.stderr);
  const entries = tarList.stdout.trim().split("\n").sort();
  assert.equal(entries.includes("package/package.json"), true);
  assert.equal(entries.includes("package/dist/schemas/v2/product-definition.schema.json"), true);
  for (const name of publicCliFiles) {
    assert.equal(entries.includes(`package/dist/src/cli/${name}.js`), true, name);
  }
  for (const entry of entries) {
    assert.match(entry, /^package\/(?:package\.json|README\.md|dist\/src\/(?:adapters|domain)\/.+\.js|dist\/src\/cli\/(?:nextstep|project-status|requirement-intake|requirement-freeze|product-definition|interaction-prototype|carrier-decision|acceptance-profile|write-consistency|source-validate|version-chain|major-milestone|small-milestone|execution-packet)\.js|dist\/schemas\/v1\/.+\.json|dist\/schemas\/v2\/product-definition\.schema\.json|skills\/nextstep\/(?:SKILL\.md|agents\/openai\.yaml)|examples\/quickstart\/version-chain\.json|docs\/releases\/v0\.2\.0-alpha\.md)$/);
    assert.doesNotMatch(entry, /dist\/src\/cli\/(?:contract-probe|project-value-validation)\.js|\.d\.ts|\.map$|^package\/src\/|^package\/tests\/|^package\/\.codex\/|^package\/\.git\//);
  }
  const bytes = await readFile(tarball);
  assert.match(createHash("sha256").update(bytes).digest("hex"), /^[0-9a-f]{64}$/);

  await writeFile(resolve(consumerRoot, "package.json"), JSON.stringify({
    name: "nextstep-alpha-consumer",
    private: true,
    version: "0.0.0",
  }));
  const installed = await run("corepack", [
    "pnpm",
    "add",
    "--offline",
    "--ignore-scripts",
    tarball,
  ], { cwd: consumerRoot });
  assert.equal(installed.code, 0, installed.stderr);

  const installedRoot = resolve(consumerRoot, "node_modules/nextstep");
  const installedCli = resolve(consumerRoot, "node_modules/.bin/nextstep");
  await assertMissing(resolve(installedRoot, "dist/src/cli/contract-probe.js"));
  await assertMissing(resolve(installedRoot, "dist/src/cli/project-value-validation.js"));
  const version = await run(installedCli, ["--version"], { cwd: consumerRoot });
  assert.deepEqual(version, { code: 0, stdout: "0.2.0-alpha\n", stderr: "" });
  const help = await run(installedCli, ["--help"], { cwd: consumerRoot });
  assert.equal(help.code, 0, help.stderr);
  assert.equal(help.stdout.match(/^  [a-z][a-z-]*$/gm)?.length, 13);
  assert.doesNotMatch(help.stdout, /contract-probe|project-value-validation/);

  const quickstart = await readFile(resolve(installedRoot, "examples/quickstart/version-chain.json"), "utf8");
  const accepted = await run(installedCli, ["version-chain"], {
    cwd: consumerRoot,
    input: quickstart,
  });
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.stderr, "");
  assert.equal((JSON.parse(accepted.stdout) as any).code, "VERSION_CHAIN_ACCEPTED");

  const secret = "installed-secret-that-must-not-appear";
  for (const command of ["unknown", "contract-probe", "project-value-validation", "../version-chain"]) {
    const rejected = await run(installedCli, [command, secret], {
      cwd: consumerRoot,
      input: secret,
    });
    assert.equal(rejected.code, 1, command);
    assert.equal(rejected.stdout, "");
    assert.equal(rejected.stderr, "NextStep command rejected\n");
    assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, new RegExp(secret));
  }

  const trusted = await run(installedCli, ["write-consistency", "--commit"], {
    cwd: consumerRoot,
    input: JSON.stringify({ authorization: secret }),
  });
  assert.equal(trusted.code, 1);
  assert.doesNotMatch(`${trusted.stdout}${trusted.stderr}`, new RegExp(secret));
  assert.equal(basename(tarball), "nextstep-0.2.0-alpha.tgz");
});
