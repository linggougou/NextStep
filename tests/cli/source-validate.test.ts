import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";
import { runSourceValidate } from "../../src/cli/source-validate.ts";

const execFileAsync = promisify(execFile);
const FIXTURE_ROOT = resolve(process.cwd(), "tests/fixtures/architecture-risk");

interface FixtureRecord {
  readonly candidate?: unknown;
  readonly base_fixture_ref?: string;
  readonly negative_kind?: string;
  readonly mutation?: {
    readonly operation: "add" | "replace" | "remove";
    readonly path: string;
    readonly value?: unknown;
  };
}

function fakeIo(input: string, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return Buffer.from(input, "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

async function readFixture(path: string): Promise<FixtureRecord> {
  return JSON.parse(await readFile(resolve(FIXTURE_ROOT, path), "utf8")) as FixtureRecord;
}

function decodePointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function materializeNegative(base: unknown, mutation: NonNullable<FixtureRecord["mutation"]>): unknown {
  const record = structuredClone({ candidate: base }) as { candidate: unknown };
  const tokens = mutation.path.split("/").slice(1).map(decodePointerToken);
  let parent: unknown = record;
  for (const token of tokens.slice(0, -1)) {
    parent = Array.isArray(parent)
      ? parent[Number(token)]
      : (parent as Record<string, unknown>)[token];
  }
  const finalToken = tokens.at(-1)!;
  if (Array.isArray(parent)) {
    const index = Number(finalToken);
    if (mutation.operation === "remove") parent.splice(index, 1);
    else if (mutation.operation === "add") parent.splice(index, 0, structuredClone(mutation.value));
    else parent[index] = structuredClone(mutation.value);
  } else {
    const target = parent as Record<string, unknown>;
    if (mutation.operation === "remove") delete target[finalToken];
    else target[finalToken] = structuredClone(mutation.value);
  }
  return record.candidate;
}

test("source-validate 直接消费三类 fixture.candidate，并输出唯一 JCS ACCEPTED 回执", async () => {
  for (const name of ["community-workshop", "expense-reminder", "project-delivery-tool"]) {
    const fixture = await readFixture(`positive/${name}.json`);
    const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(fixture.candidate));

    await runSourceValidate(io);

    assert.equal(output.length, 1);
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(exitCodes, []);
    const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.code, "ARCHITECTURE_RISK_ASSESSMENT_ACCEPTED");
    assert.deepEqual(Object.keys(receipt.data).sort(), [
      "architecture_risk_assessment",
      "canonical_json",
      "digest",
      "schema_version",
    ]);
    const assessment = receipt.data.architecture_risk_assessment;
    assert.equal(receipt.data.canonical_json, canonicalizeJson(assessment));
    assert.equal(receipt.data.digest, digestJson(assessment));
    assert.equal(receipt.data.schema_version, "1.0");
    assert.equal((assessment as Record<string, unknown>).evidence_scope, "manual-isolated consumer contract");
    assert.equal(Object.hasOwn(assessment as object, "support_level"), false);
  }
});

test("source-validate 对 15 类 fixture 负例统一 fail closed，失败 data 仅含 dry_run:false", async () => {
  const negativeNames = (await readdir(resolve(FIXTURE_ROOT, "negative"))).filter((name) => name.endsWith(".json")).sort();
  assert.equal(negativeNames.length, 15);

  for (const name of negativeNames) {
    const fixture = await readFixture(`negative/${name}`);
    const base = await readFixture(fixture.base_fixture_ref!);
    const candidate = materializeNegative(base.candidate, fixture.mutation!);
    const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(candidate));

    await runSourceValidate(io);

    assert.equal(output.length, 1, name);
    const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
    assert.equal(receipt.ok, false, name);
    assert.equal(receipt.code, "ARCHITECTURE_RISK_ASSESSMENT_REJECTED", name);
    assert.deepEqual(receipt.data, { dry_run: false }, name);
    assert.deepEqual(exitCodes, [1], name);
    assert.equal(diagnostics.length, 1, name);
    const combined = `${output[0]}\n${diagnostics[0]}`;
    assert.doesNotMatch(combined, /fixture-redacted-placeholder|Bearer|api_token/i, name);
  }
});

test("source-validate 对非 JCS、未知参数和错误身份只输出一个拒绝回执", async () => {
  const positive = await readFixture("positive/community-workshop.json");
  const wrongIdentity = structuredClone(positive.candidate) as Record<string, unknown>;
  wrongIdentity.project = { project_id: "wrong-project", scenario_id: "wrong", record_digest: `sha256:${"0".repeat(64)}` };

  for (const sample of [
    fakeIo('{"z":1,"a":2}'),
    fakeIo(canonicalizeJson(positive.candidate), ["--full"]),
    fakeIo(canonicalizeJson(wrongIdentity)),
    fakeIo("{broken"),
  ]) {
    await runSourceValidate(sample.io);
    assert.equal(sample.output.length, 1);
    const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(sample.output[0]!, "utf8")));
    assert.equal(receipt.code, "ARCHITECTURE_RISK_ASSESSMENT_REJECTED");
    assert.deepEqual(receipt.data, { dry_run: false });
    assert.deepEqual(sample.exitCodes, [1]);
    assert.equal(sample.diagnostics.length, 1);
  }
});

test("source-validate 运行前后 HEAD/formal/control、工作树状态和 fixture 字节均不变", async () => {
  const fixturePath = resolve(FIXTURE_ROOT, "positive/community-workshop.json");
  const fixtureBytesBefore = await readFile(fixturePath);
  const gitState = async () => {
    const [refs, status] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD", "refs/nextstep/formal", "refs/nextstep/control"], { cwd: process.cwd() }),
      execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: process.cwd() }),
    ]);
    return { refs: refs.stdout, status: status.stdout };
  };
  const before = await gitState();
  const fixture = await readFixture("positive/community-workshop.json");
  const { io, output } = fakeIo(canonicalizeJson(fixture.candidate));

  await runSourceValidate(io);

  assert.equal(output.length, 1);
  assert.deepEqual(await gitState(), before);
  assert.deepEqual(await readFile(fixturePath), fixtureBytesBefore);
});
