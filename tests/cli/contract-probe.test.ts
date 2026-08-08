import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  canonicalizeJson,
  parseCanonicalJsonBytes,
} from "../../src/domain/canonical-json.ts";
import { createTemporaryGitFixture } from "../support/git-fixture.ts";

const compiledProbePath = resolve(
  process.cwd(),
  "dist/src/cli/contract-probe.js",
);

interface ProbeResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

interface MachineReceipt {
  readonly code: string;
  readonly data: Record<string, unknown>;
  readonly ok: boolean;
  readonly receipt_id: string;
  readonly schema_version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMachineReceipt(value: unknown): value is MachineReceipt {
  return (
    isRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.receipt_id === "string" &&
    typeof value.ok === "boolean" &&
    typeof value.code === "string" &&
    isRecord(value.data)
  );
}

function runProbe(
  input: string | Uint8Array,
  options: { readonly args?: readonly string[]; readonly cwd?: string } = {},
): Promise<ProbeResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [compiledProbePath, ...(options.args ?? [])],
      {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({
        exitCode,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    });
    child.stdin.end(input);
  });
}

function parseSingleReceipt(stdout: string): MachineReceipt {
  assert.notEqual(stdout.trim(), "", "stdout must contain a machine receipt");

  let receipt: unknown;
  try {
    receipt = JSON.parse(stdout);
  } catch (error) {
    assert.fail(`stdout must contain exactly one parseable JSON receipt: ${String(error)}`);
  }

  assert.ok(isMachineReceipt(receipt), "machine receipt has an invalid structure");

  return receipt;
}

async function readNextStepRefs(repositoryRoot: string): Promise<string> {
  const result = await new Promise<ProbeResult>((resolveResult, reject) => {
    const child = spawn(
      "git",
      [
        "-C",
        repositoryRoot,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        "refs/nextstep/formal",
        "refs/nextstep/control",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({
        exitCode,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    });
  });

  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
}

async function readWorktreeState(repositoryRoot: string): Promise<string> {
  const result = await runGit(repositoryRoot, "status", "--porcelain", "--ignored");
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
}

function runGit(repositoryRoot: string, ...args: string[]): Promise<ProbeResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("git", ["-C", repositoryRoot, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({
        exitCode,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    });
  });
}

test("contract probe emits one successful machine receipt with canonical JSON and a SHA-256 digest", async () => {
  const result = await runProbe(
    canonicalizeJson({
      schema_version: "1.0",
      subject: { zebra: 3, alpha: { later: true, earlier: false } },
    }),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stderr, "");

  const receipt = parseSingleReceipt(result.stdout);
  const parsedOutput = parseCanonicalJsonBytes(Buffer.from(result.stdout, "utf8"));
  assert.equal(canonicalizeJson(parsedOutput), result.stdout);
  assert.equal(Object.getPrototypeOf(parsedOutput), null);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "CONTRACT_PROBE_SUCCEEDED");
  assert.equal(
    receipt.data.canonical_json,
    '{"alpha":{"earlier":false,"later":true},"zebra":3}',
  );
  assert.match(String(receipt.data.digest), /^sha256:[a-f0-9]{64}$/);
  assert.equal(receipt.data.dry_run, false);
});

test("contract probe returns a structured failure receipt for malformed JSON and keeps diagnostics on stderr", async () => {
  const result = await runProbe('{"schema_version":"1.0","subject":');

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /json|input|parse/i);

  const receipt = parseSingleReceipt(result.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "INVALID_JSON");
});

test("contract probe rejects a non-JCS subject containing an ordinary toJSON field", async () => {
  const result = await runProbe(
    '{"schema_version":"1.0","subject":{"z":1,"toJSON":"metadata","a":2}}',
  );

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /canonical|input|rejected/i);
  assert.equal(parseSingleReceipt(result.stdout).ok, false);
});

test("contract probe accepts an ordinary toJSON field when the complete input is JCS", async () => {
  const result = await runProbe(
    '{"schema_version":"1.0","subject":{"a":2,"toJSON":"metadata","z":1}}',
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const receipt = parseSingleReceipt(result.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(
    receipt.data.canonical_json,
    '{"a":2,"toJSON":"metadata","z":1}',
  );
});

test("contract probe fails closed for sensitive input without leaking the sensitive value", async () => {
  const sensitiveValue = "p5-m0-sensitive-value-must-not-escape";
  const result = await runProbe(
    canonicalizeJson({
      schema_version: "1.0",
      subject: { access_token: sensitiveValue },
    }),
  );

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /sensitive|secret|token/i);
  assert.doesNotMatch(result.stderr, new RegExp(sensitiveValue));
  assert.doesNotMatch(result.stdout, new RegExp(sensitiveValue));

  const receipt = parseSingleReceipt(result.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "SENSITIVE_FIELD_DETECTED");
});

test("contract probe rejects sensitive fields across the complete input envelope", async () => {
  const sensitiveValue = "p5-m0-envelope-secret-must-not-escape";

  for (const input of [
    {
      schema_version: "1.0",
      subject: {},
      password: sensitiveValue,
    },
    {
      schema_version: "1.0",
      subject: { apikey: sensitiveValue },
    },
  ]) {
    const result = await runProbe(canonicalizeJson(input));

    assert.notEqual(result.exitCode, 0);
    assert.doesNotMatch(result.stderr, new RegExp(sensitiveValue));
    assert.doesNotMatch(result.stdout, new RegExp(sensitiveValue));

    const receipt = parseSingleReceipt(result.stdout);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.code, "SENSITIVE_FIELD_DETECTED");
  }
});

test("contract probe rejects unknown envelope fields and invalid UTF-8", async () => {
  const unknownFieldResult = await runProbe(
    canonicalizeJson({
      schema_version: "1.0",
      subject: {},
      unexpected: true,
    }),
  );
  assert.notEqual(unknownFieldResult.exitCode, 0);
  assert.equal(parseSingleReceipt(unknownFieldResult.stdout).code, "CONTRACT_PROBE_REJECTED");

  const invalidUtf8Result = await runProbe(
    Buffer.concat([
      Buffer.from('{"schema_version":"1.0","subject":{"text":"', "utf8"),
      Buffer.from([0xff]),
      Buffer.from('"}}', "utf8"),
    ]),
  );
  assert.notEqual(invalidUtf8Result.exitCode, 0);
  assert.equal(parseSingleReceipt(invalidUtf8Result.stdout).ok, false);
  assert.doesNotMatch(invalidUtf8Result.stdout, /\ufffd/);
  assert.doesNotMatch(invalidUtf8Result.stderr, /\ufffd/);
});

test("contract probe rejects non-canonical input envelope bytes", async () => {
  const canonicalInput = canonicalizeJson({ schema_version: "1.0", subject: {} });

  for (const input of [
    '{ "schema_version": "1.0", "subject": {} }',
    '{"subject":{},"schema_version":"1.0"}',
    `${canonicalInput}\n`,
    '{"schema_version":"0.9","schema_version":"1.0","subject":{}}',
  ]) {
    const result = await runProbe(input);
    assert.notEqual(result.exitCode, 0);
    assert.equal(parseSingleReceipt(result.stdout).ok, false);
  }
});

test("contract probe rejects sensitive field naming variants without leaking values", async () => {
  const sensitiveValue = "variant-value-must-not-escape";

  for (const field of [
    "secrets",
    "tokens",
    "privateKeys",
    "apiKeys",
    "accessTokens",
    "clientSecrets",
  ]) {
    const result = await runProbe(
      canonicalizeJson({
        schema_version: "1.0",
        subject: { [field]: sensitiveValue },
      }),
    );
    assert.notEqual(result.exitCode, 0);
    assert.equal(parseSingleReceipt(result.stdout).code, "SENSITIVE_FIELD_DETECTED");
    assert.doesNotMatch(result.stdout, new RegExp(sensitiveValue));
    assert.doesNotMatch(result.stderr, new RegExp(sensitiveValue));
  }
});

test("contract probe dry-run is explicit and leaves the fixture worktree and NextStep refs unchanged", async () => {
  const fixture = await createTemporaryGitFixture();

  try {
    const filesBefore = (await readdir(fixture.path)).sort();
    const worktreeBefore = await readWorktreeState(fixture.path);
    const refsBefore = await readNextStepRefs(fixture.path);
    const result = await runProbe(
      canonicalizeJson({
        schema_version: "1.0",
        subject: { beta: 2, alpha: 1 },
      }),
      { args: ["--dry-run"], cwd: fixture.path },
    );

    assert.equal(result.exitCode, 0, result.stderr);
    const receipt = parseSingleReceipt(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.code, "CONTRACT_PROBE_SUCCEEDED");
    assert.equal(receipt.data.dry_run, true);
    assert.deepEqual((await readdir(fixture.path)).sort(), filesBefore);
    assert.equal(await readWorktreeState(fixture.path), worktreeBefore);
    assert.equal(await readNextStepRefs(fixture.path), refsBefore);
  } finally {
    await fixture.cleanup();
  }
});
