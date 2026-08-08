import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { init, parse } from "es-module-lexer";

const projectRoot = process.cwd();

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}

test("P5-M0 physical boundaries exist", async () => {
  for (const path of [
    "skills/nextstep/SKILL.md",
    "src/cli",
    "src/domain",
    "src/adapters/node",
    "schemas/v1",
    "tests/support",
  ]) {
    await assert.doesNotReject(access(resolve(projectRoot, path)), path);
  }
});

test("domain modules do not import adapters, CLI, or Codex integrations", async () => {
  await init;
  const domainRoot = resolve(projectRoot, "src/domain");
  const files = await listTypeScriptFiles(domainRoot);

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const [records] = parse(source);
    const imports = records.map(({ s: start, e: end }) => source.slice(start, end));
    assert.equal(
      imports.some((specifier) => /(?:^|\/)(?:adapters|cli|codex)(?:\/|$)/i.test(specifier)),
      false,
      `${relative(projectRoot, file)} reverses the dependency direction`,
    );
  }
});
