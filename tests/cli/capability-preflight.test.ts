import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runCapabilityPreflight } from "../../src/cli/capability-preflight.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import type {
  CapabilityPreflightRequest,
  CapabilityPreflightRuntime,
  HostBootstrapEvidence,
  ProjectProbeEvidence,
} from "../../src/domain/capability-preflight.ts";
import { digestJson, type Sha256Digest } from "../../src/domain/content-digest.ts";
import { parseMachineReceipt } from "../../src/domain/machine-receipt.ts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as Sha256Digest;
const oid = (character: string) => character.repeat(40);

const request: CapabilityPreflightRequest = {
  schema_version: "1.0",
  record_type: "capability-preflight-request",
  expected_binding: {
    host_id: "codex-local",
    host_version: "0.144.1",
    permission_configuration_id: "perm-isolated-v1",
    repository_id: sha("1"),
    worktree_id: sha("2"),
    formal_oid: oid("a"),
    control_oid: oid("b"),
  },
  probe: {
    requested_project: "fixture-project",
    workspace_roots: ["/tmp/fixture-workspace"],
    explicit_project_root: "/tmp/fixture-workspace/fixture-project",
    expected_start_oid: oid("c"),
    external_evidence_root: "/tmp/fixture-evidence",
  },
  validity_seconds: 300,
};

function fakeIo(input: string, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return Buffer.from(input, "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(value) { exitCodes.push(value); },
  };
  return { io, output, diagnostics, exitCodes };
}

function runtime(options: { blocked?: boolean; onProbe?: () => void } = {}): CapabilityPreflightRuntime {
  const hostBase = {
    status: options.blocked ? "blocked" as const : "passed" as const,
    host_id: request.expected_binding.host_id,
    host_version: request.expected_binding.host_version,
    permission_configuration_id: request.expected_binding.permission_configuration_id,
    stable_task_id_digest: options.blocked ? null : sha("3"),
    automatic_lifecycle: !options.blocked,
    checks: options.blocked ? [] : ["stable-task-id"],
    blockers: options.blocked ? ["HOST_STABLE_ID_UNPROVEN"] : [],
  };
  const host: HostBootstrapEvidence = { ...hostBase, attestation_digest: digestJson(hostBase) };
  const projectBase = {
    status: "passed" as const,
    repository_id: request.expected_binding.repository_id,
    worktree_id: request.expected_binding.worktree_id,
    formal_oid: request.expected_binding.formal_oid,
    control_oid: request.expected_binding.control_oid,
    start_oid: request.probe.expected_start_oid,
    start_state: "clean" as const,
    content_identity: sha("4"),
    atomic_create_or_return: true,
    automatic_archive: true,
    checks: ["readonly-validation", "final-verification"],
    blockers: [],
  };
  const project: ProjectProbeEvidence = { ...projectBase, attestation_digest: digestJson(projectBase) };
  return {
    async hostBootstrap() { return host; },
    async projectProbe() { options.onProbe?.(); return project; },
    now() { return new Date("2026-08-30T00:00:00Z"); },
  };
}

test("CLI 仅在注入可信 runtime 时输出一份既有机器回执，full 摘要不泄漏绝对路径", async () => {
  const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(request));
  await runCapabilityPreflight(io, runtime());
  assert.equal(output.length, 1);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(exitCodes, []);
  const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.code, "CONTRACT_PROBE_SUCCEEDED");
  const subject = parseCanonicalJsonBytes(Buffer.from(String(receipt.data.canonical_json), "utf8")) as Record<string, unknown>;
  assert.equal(subject.mode, "full");
  assert.doesNotMatch(output[0]!, /\/tmp\/fixture|\/Users|\/Volumes/);
});

test("无可信 host runtime 的 shell 调用、参数和 env 能力注入全部 fail closed", async () => {
  const previous = process.env.NEXTSTEP_HOST_CAPABILITIES;
  process.env.NEXTSTEP_HOST_CAPABILITIES = JSON.stringify({ mode: "full", trusted: true });
  try {
    for (const args of [[], ["--host-mode=full"]]) {
      const { io, output, diagnostics, exitCodes } = fakeIo(canonicalizeJson(request), args);
      await runCapabilityPreflight(io);
      assert.equal(output.length, 1);
      const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
      assert.equal(receipt.ok, false);
      assert.equal(receipt.code, "CONTRACT_PROBE_REJECTED");
      assert.deepEqual(exitCodes, [1]);
      assert.equal(diagnostics.length, 1);
      assert.doesNotMatch(`${output}${diagnostics}`, /host-mode=full|NEXTSTEP_HOST_CAPABILITIES|"trusted"/);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXTSTEP_HOST_CAPABILITIES;
    else process.env.NEXTSTEP_HOST_CAPABILITIES = previous;
  }
});

test("bootstrap blocked 的 CLI 回执保持最小，且 project-probe 不运行", async () => {
  let probeCalls = 0;
  const { io, output } = fakeIo(canonicalizeJson(request));
  await runCapabilityPreflight(io, runtime({ blocked: true, onProbe: () => { probeCalls += 1; } }));
  const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
  assert.equal(receipt.ok, true);
  const subject = parseCanonicalJsonBytes(Buffer.from(String(receipt.data.canonical_json), "utf8")) as Record<string, unknown>;
  assert.equal(subject.mode, "blocked");
  assert.equal(probeCalls, 0);
});

test("非 JCS、敏感输入和原值注入只产生通用失败回执", async () => {
  const secret = "Bearer sk-sensitive-cli-value-123456";
  for (const input of ['{"z":1,"a":2}', canonicalizeJson({ ...request, authorization: secret }), "{"]) {
    const { io, output, diagnostics, exitCodes } = fakeIo(input);
    await runCapabilityPreflight(io, runtime());
    assert.equal(output.length, 1);
    const receipt = parseMachineReceipt(parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")));
    assert.equal(receipt.ok, false);
    assert.equal(receipt.code, "CONTRACT_PROBE_REJECTED");
    assert.deepEqual(exitCodes, [1]);
    assert.equal(diagnostics.length, 1);
    assert.doesNotMatch(`${output}${diagnostics}`, /sensitive-cli-value|authorization/i);
  }
});

test("Skill 只声明 S3.1 预检入口，并明确后续门禁未完成", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  assert.match(skill, /S3\.1 Capability Preflight/);
  assert.match(skill, /S3\.2.*(?:not complete|尚未完成)/i);
  assert.match(skill, /M3\.1.*(?:not complete|尚未完成)/i);
  assert.match(skill, /PC-14.*(?:not complete|尚未完成)/i);
  assert.doesNotMatch(skill, /S3\.1[^\n]*(?:completes|完成) PC-14/i);
});
