import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CapabilityPreflightError,
  evaluateCapabilityPreflight,
  parseCapabilityPreflightEvidence,
  verifyCapabilityPreflightEvidence,
  type CapabilityBinding,
  type CapabilityEvidenceVerifier,
  type CapabilityPreflightRequest,
  type CapabilityPreflightRuntime,
  type HostBootstrapEvidence,
  type ProjectProbeEvidence,
} from "../../src/domain/capability-preflight.ts";
import { digestJson, type Sha256Digest } from "../../src/domain/content-digest.ts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as Sha256Digest;
const oid = (character: string) => character.repeat(40);

const binding: CapabilityBinding = {
  host_id: "codex-local",
  host_version: "0.144.1",
  permission_configuration_id: "perm-isolated-v1",
  repository_id: sha("1"),
  worktree_id: sha("2"),
  formal_oid: oid("a"),
  control_oid: oid("b"),
};

const request: CapabilityPreflightRequest = {
  schema_version: "1.0",
  record_type: "capability-preflight-request",
  expected_binding: binding,
  probe: {
    requested_project: "fixture-project",
    workspace_roots: ["/tmp/fixture-workspace"],
    explicit_project_root: "/tmp/fixture-workspace/fixture-project",
    expected_start_oid: oid("c"),
    external_evidence_root: "/tmp/fixture-evidence",
  },
  validity_seconds: 300,
};

function host(overrides: Partial<HostBootstrapEvidence> = {}): HostBootstrapEvidence {
  const base = {
    status: "passed" as const,
    host_id: binding.host_id,
    host_version: binding.host_version,
    permission_configuration_id: binding.permission_configuration_id,
    stable_task_id_digest: sha("3"),
    automatic_lifecycle: true,
    checks: ["stable-task-id", "permission-isolation", "approval-and-blocking-events"],
    blockers: [],
  };
  return { ...base, ...overrides, attestation_digest: digestJson({ ...base, ...overrides }) };
}

function project(overrides: Partial<ProjectProbeEvidence> = {}): ProjectProbeEvidence {
  const base = {
    status: "passed" as const,
    repository_id: binding.repository_id,
    worktree_id: binding.worktree_id,
    formal_oid: binding.formal_oid,
    control_oid: binding.control_oid,
    start_oid: request.probe.expected_start_oid,
    start_state: "clean" as const,
    content_identity: sha("4"),
    atomic_create_or_return: true,
    automatic_archive: true,
    checks: ["exact-root", "immutable-candidate", "readonly-validation", "final-verification", "expected-old-cas"],
    blockers: [],
  };
  return { ...base, ...overrides, attestation_digest: digestJson({ ...base, ...overrides }) };
}

function runtime(
  hostEvidence: HostBootstrapEvidence,
  projectEvidence: ProjectProbeEvidence,
  onProbe: () => void = () => {},
): CapabilityPreflightRuntime {
  return {
    async hostBootstrap() { return hostEvidence; },
    async projectProbe() { onProbe(); return projectEvidence; },
    now() { return new Date("2026-08-30T00:00:00.000Z"); },
  };
}

function resignEvidence(
  evidence: Awaited<ReturnType<typeof evaluateCapabilityPreflight>>,
  overrides: Record<string, unknown>,
) {
  const { preflight_id: _preflightId, evidence_digest: _evidenceDigest, ...unsigned } = {
    ...evidence,
    ...overrides,
  };
  const preflight_id = `cp-${digestJson(unsigned).slice("sha256:".length)}`;
  const withoutDigest = { ...unsigned, preflight_id };
  return { ...withoutDigest, evidence_digest: digestJson(withoutDigest) };
}

test("两阶段预检确定性裁决 full 与 manual-isolated，并输出内容寻址证据", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/capability-preflight/three-state.json"), "utf8")) as {
    full: { automatic_lifecycle: boolean; atomic_create_or_return: boolean; automatic_archive: boolean };
    manual_isolated: { automatic_lifecycle: boolean; atomic_create_or_return: boolean; automatic_archive: boolean };
  };
  const full = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  assert.equal(full.mode, "full");
  assert.deepEqual(fixture.full, { automatic_lifecycle: true, atomic_create_or_return: true, automatic_archive: true });
  assert.equal(full.next_action, "automatic-dispatch-eligible");
  assert.match(full.preflight_id, /^cp-[a-f0-9]{64}$/);
  assert.equal(parseCapabilityPreflightEvidence(full).evidence_digest, full.evidence_digest);

  const manual = await evaluateCapabilityPreflight(
    request,
    runtime(host({ automatic_lifecycle: false }), project({ atomic_create_or_return: false, automatic_archive: false })),
  );
  assert.equal(manual.mode, "manual-isolated");
  assert.deepEqual(fixture.manual_isolated, { automatic_lifecycle: false, atomic_create_or_return: false, automatic_archive: false });
  assert.equal(manual.next_action, "request-manual-isolated-task");
});

test("bootstrap 未通过时 blocked 且 project-probe 绝不运行", async () => {
  let probeCalls = 0;
  const result = await evaluateCapabilityPreflight(
    request,
    runtime(
      host({ status: "blocked", stable_task_id_digest: null, blockers: ["HOST_STABLE_ID_UNPROVEN"] }),
      project(),
      () => { probeCalls += 1; },
    ),
  );
  assert.equal(result.mode, "blocked");
  assert.equal(result.stages.project_probe, null);
  assert.equal(probeCalls, 0);
});

test("核心项目能力缺失、非 clean 起点或证据身份漂移均 blocked", async () => {
  for (const evidence of [
    project({ status: "blocked", blockers: ["READONLY_VALIDATION_UNPROVEN"] }),
    project({ status: "blocked", start_state: "staged", blockers: ["WORKTREE_START_NOT_CLEAN"] }),
    project({ repository_id: sha("9") }),
  ]) {
    const result = await evaluateCapabilityPreflight(request, runtime(host(), evidence));
    assert.equal(result.mode, "blocked");
    assert.equal(result.next_action, "stop-and-reprobe");
  }
});

test("宿主、版本、项目、权限、formal/control 或有效期漂移使旧证据失效", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  const verifier = {
    async verifyEvidence(digest: Sha256Digest) { return digest === evidence.evidence_digest; },
    async verifyHost() { return true; },
    async verifyProject() { return true; },
  };
  assert.equal(
    (await verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:04:59Z"), verifier)).mode,
    "full",
  );
  for (const drift of [
    { host_id: "other-host" },
    { host_version: "0.145.0" },
    { permission_configuration_id: "perm-other" },
    { repository_id: sha("8") },
    { worktree_id: sha("7") },
    { formal_oid: oid("d") },
    { control_oid: oid("e") },
  ]) {
    await assert.rejects(
      () => verifyCapabilityPreflightEvidence(evidence, { ...binding, ...drift }, new Date("2026-08-30T00:01:00Z"), verifier),
      (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_BINDING_DRIFT",
    );
  }
  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:05:00Z"), verifier),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_EXPIRED",
  );
});

test("无效受信时钟在证明校验前 fail closed 且错误不泄漏输入", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  let evidenceVerifierCalls = 0;
  let hostVerifierCalls = 0;
  let projectVerifierCalls = 0;
  const verifier = {
    async verifyEvidence() { evidenceVerifierCalls += 1; return true; },
    async verifyHost() { hostVerifierCalls += 1; return true; },
    async verifyProject() { projectVerifierCalls += 1; return true; },
  };

  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date(Number.NaN), verifier),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityPreflightError);
      assert.equal(error.code, "INVALID_CAPABILITY_PREFLIGHT");
      assert.equal(error.message, "Trusted clock is invalid");
      assert.doesNotMatch(error.message, /NaN|Invalid Date/);
      return true;
    },
  );
  assert.equal(evidenceVerifierCalls, 0);
  assert.equal(hostVerifierCalls, 0);
  assert.equal(projectVerifierCalls, 0);
});

test("重签延长有效期但仅原完整证据受信时拒绝，且阶段 verifier 零调用", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  const resigned = resignEvidence(evidence, { expires_at: "2026-08-30T01:00:00.000Z" });
  let hostVerifierCalls = 0;
  let projectVerifierCalls = 0;
  const verifier = {
    async verifyEvidence(digest: Sha256Digest) { return digest === evidence.evidence_digest; },
    async verifyHost() { hostVerifierCalls += 1; return true; },
    async verifyProject() { projectVerifierCalls += 1; return true; },
  };

  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(resigned, binding, new Date("2026-08-30T00:06:00Z"), verifier),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_UNTRUSTED",
  );
  assert.equal(hostVerifierCalls, 0);
  assert.equal(projectVerifierCalls, 0);
});

test("缺失完整证据方法的 legacy verifier fail closed 且不调用阶段 verifier", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  let hostVerifierCalls = 0;
  let projectVerifierCalls = 0;
  const legacyVerifier = {
    async verifyHost() { hostVerifierCalls += 1; return true; },
    async verifyProject() { projectVerifierCalls += 1; return true; },
  } as unknown as CapabilityEvidenceVerifier;

  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:01:00Z"), legacyVerifier),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_UNTRUSTED",
  );
  assert.equal(hostVerifierCalls, 0);
  assert.equal(projectVerifierCalls, 0);
});

test("缺失宿主证明方法时统一 fail closed 且不调用任何已有 verifier", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  let evidenceVerifierCalls = 0;
  let projectVerifierCalls = 0;
  const incompleteVerifier = {
    async verifyEvidence() { evidenceVerifierCalls += 1; return true; },
    async verifyProject() { projectVerifierCalls += 1; return true; },
  } as unknown as CapabilityEvidenceVerifier;

  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:01:00Z"), incompleteVerifier),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_UNTRUSTED",
  );
  assert.equal(evidenceVerifierCalls, 0);
  assert.equal(projectVerifierCalls, 0);
});

test("缺失项目证明方法时统一 fail closed 且宿主 verifier 也保持零调用", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  let evidenceVerifierCalls = 0;
  let hostVerifierCalls = 0;
  const incompleteVerifier = {
    async verifyEvidence() { evidenceVerifierCalls += 1; return true; },
    async verifyHost() { hostVerifierCalls += 1; return true; },
  } as unknown as CapabilityEvidenceVerifier;

  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:01:00Z"), incompleteVerifier),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_UNTRUSTED",
  );
  assert.equal(evidenceVerifierCalls, 0);
  assert.equal(hostVerifierCalls, 0);
});

test("伪造、缺失、caller 自报 full 与无可信 verifier 均 fail closed", async () => {
  const evidence = await evaluateCapabilityPreflight(request, runtime(host(), project()));
  const tampered = { ...evidence, mode: "manual-isolated" };
  assert.throws(() => parseCapabilityPreflightEvidence(tampered), CapabilityPreflightError);
  assert.throws(() => parseCapabilityPreflightEvidence({ ...evidence, stages: undefined }), CapabilityPreflightError);
  await assert.rejects(
    () => verifyCapabilityPreflightEvidence(evidence, binding, new Date("2026-08-30T00:01:00Z")),
    (error: unknown) => error instanceof CapabilityPreflightError && error.code === "CAPABILITY_EVIDENCE_UNTRUSTED",
  );
  await assert.rejects(
    () => evaluateCapabilityPreflight({ ...request, mode: "full", capability: true }, runtime(host(), project())),
    CapabilityPreflightError,
  );
});

test("重签 manual-isolated 为 full 且保留受信阶段证明时 fail closed", async () => {
  const manual = await evaluateCapabilityPreflight(
    request,
    runtime(host({ automatic_lifecycle: false }), project({ atomic_create_or_return: false })),
  );
  for (const [forged, leakedValue] of [
    [resignEvidence(manual, { mode: "full", next_action: "automatic-dispatch-eligible" }), "automatic-dispatch-eligible"],
    [resignEvidence(manual, { next_action: "stop-and-reprobe" }), "stop-and-reprobe"],
    [resignEvidence(manual, { blockers: ["FORGED_BLOCKER"] }), "FORGED_BLOCKER"],
  ] as const) {
    assert.throws(
      () => parseCapabilityPreflightEvidence(forged),
      (error: unknown) => {
        assert.ok(error instanceof CapabilityPreflightError);
        assert.equal(error.code, "INVALID_CAPABILITY_PREFLIGHT");
        assert.doesNotMatch(error.message, new RegExp(leakedValue));
        return true;
      },
    );
  }
});

test("敏感字段和内容在领域入口即拒绝，错误不回显原值", async () => {
  const secret = "sk-example-secret-value-123456789";
  await assert.rejects(
    () => evaluateCapabilityPreflight({ ...request, authorization: `Bearer ${secret}` }, runtime(host(), project())),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityPreflightError);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});
