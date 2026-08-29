import { Ajv, type ValidateFunction } from "ajv";

import capabilityPreflightSchema from "../../schemas/v1/capability-preflight.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { digestJson, projectForDigest, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";

export type CapabilityMode = "full" | "manual-isolated" | "blocked";

export interface CapabilityBinding {
  readonly host_id: string;
  readonly host_version: string;
  readonly permission_configuration_id: string;
  readonly repository_id: Sha256Digest;
  readonly worktree_id: Sha256Digest;
  readonly formal_oid: string;
  readonly control_oid: string;
}

export interface CapabilityPreflightRequest {
  readonly schema_version: "1.0";
  readonly record_type: "capability-preflight-request";
  readonly expected_binding: CapabilityBinding;
  readonly probe: {
    readonly requested_project: string;
    readonly workspace_roots: readonly string[];
    readonly explicit_project_root: string;
    readonly expected_start_oid: string;
    readonly external_evidence_root: string;
  };
  readonly validity_seconds: number;
}

export interface HostBootstrapEvidence {
  readonly status: "passed" | "blocked";
  readonly host_id: string;
  readonly host_version: string;
  readonly permission_configuration_id: string;
  readonly stable_task_id_digest: Sha256Digest | null;
  readonly automatic_lifecycle: boolean;
  readonly checks: readonly string[];
  readonly blockers: readonly string[];
  readonly attestation_digest: Sha256Digest;
}

export interface ProjectProbeEvidence {
  readonly status: "passed" | "blocked";
  readonly repository_id: Sha256Digest;
  readonly worktree_id: Sha256Digest;
  readonly formal_oid: string;
  readonly control_oid: string;
  readonly start_oid: string;
  readonly start_state: "clean" | "staged" | "unstaged" | "untracked" | "ignored" | "mixed";
  readonly content_identity: Sha256Digest | null;
  readonly atomic_create_or_return: boolean;
  readonly automatic_archive: boolean;
  readonly checks: readonly string[];
  readonly blockers: readonly string[];
  readonly attestation_digest: Sha256Digest;
}

export interface CapabilityPreflightRuntime {
  readonly hostBootstrap: () => Promise<HostBootstrapEvidence>;
  readonly projectProbe: (request: CapabilityPreflightRequest) => Promise<ProjectProbeEvidence>;
  readonly now: () => Date;
}

export interface CapabilityPreflightEvidence {
  readonly schema_version: "1.0";
  readonly record_type: "capability-preflight-evidence";
  readonly preflight_id: string;
  readonly mode: CapabilityMode;
  readonly binding: CapabilityBinding;
  readonly observed_at: string;
  readonly expires_at: string;
  readonly stages: {
    readonly host_bootstrap: HostBootstrapEvidence;
    readonly project_probe: ProjectProbeEvidence | null;
  };
  readonly blockers: readonly string[];
  readonly next_action: "automatic-dispatch-eligible" | "request-manual-isolated-task" | "stop-and-reprobe";
  readonly evidence_digest: Sha256Digest;
}

export interface CapabilityEvidenceVerifier {
  verifyEvidence(evidenceDigest: Sha256Digest): Promise<boolean>;
  verifyHost(attestationDigest: Sha256Digest): Promise<boolean>;
  verifyProject(attestationDigest: Sha256Digest): Promise<boolean>;
}

export type CapabilityPreflightErrorCode =
  | "INVALID_CAPABILITY_PREFLIGHT"
  | "SENSITIVE_CONTENT_DETECTED"
  | "CAPABILITY_BINDING_DRIFT"
  | "CAPABILITY_EVIDENCE_EXPIRED"
  | "CAPABILITY_EVIDENCE_UNTRUSTED";

export class CapabilityPreflightError extends Error {
  readonly code: CapabilityPreflightErrorCode;
  constructor(code: CapabilityPreflightErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validate: ValidateFunction = ajv.compile(capabilityPreflightSchema);

function fail(code: CapabilityPreflightErrorCode, message: string): never {
  throw new CapabilityPreflightError(code, message);
}

function safeSnapshot(value: unknown): ReturnType<typeof snapshotJsonValue> {
  try {
    const snapshot = snapshotJsonValue(value);
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
    return snapshot;
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Capability preflight input is not safe canonical JSON data");
  }
}

function assertSchema(value: unknown, recordType: string): void {
  if (!validate(value) || (value as { record_type?: unknown }).record_type !== recordType) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Capability preflight data does not match its strict schema");
  }
}

function sorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function attestationDigest(value: HostBootstrapEvidence | ProjectProbeEvidence): Sha256Digest {
  return digestJson(projectForDigest(value, ["attestation_digest"]));
}

function preflightIdentity(value: Omit<CapabilityPreflightEvidence, "preflight_id" | "evidence_digest">): string {
  return `cp-${digestJson(value).slice("sha256:".length)}`;
}

function blockedHost(binding: CapabilityBinding, blocker: string): HostBootstrapEvidence {
  const base = {
    status: "blocked" as const,
    host_id: binding.host_id,
    host_version: binding.host_version,
    permission_configuration_id: binding.permission_configuration_id,
    stable_task_id_digest: null,
    automatic_lifecycle: false,
    checks: Object.freeze([]) as readonly string[],
    blockers: Object.freeze([blocker]) as readonly string[],
  };
  return Object.freeze({ ...base, attestation_digest: digestJson(base) });
}

function assertRuntimeEvidence(value: HostBootstrapEvidence | ProjectProbeEvidence): void {
  const snapshot = safeSnapshot(value);
  if (canonicalizeJson(snapshot) !== canonicalizeJson(value) || attestationDigest(value) !== value.attestation_digest) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Runtime capability attestation is invalid");
  }
}

function bindingDrift(
  binding: CapabilityBinding,
  host: HostBootstrapEvidence,
  project: ProjectProbeEvidence | null,
): readonly string[] {
  const blockers: string[] = [];
  if (
    host.host_id !== binding.host_id ||
    host.host_version !== binding.host_version ||
    host.permission_configuration_id !== binding.permission_configuration_id
  ) blockers.push("HOST_BINDING_DRIFT");
  if (project !== null && (
    project.repository_id !== binding.repository_id ||
    project.worktree_id !== binding.worktree_id ||
    project.formal_oid !== binding.formal_oid ||
    project.control_oid !== binding.control_oid
  )) blockers.push("PROJECT_BINDING_DRIFT");
  return blockers;
}

function deriveCapabilityState(
  binding: CapabilityBinding,
  host: HostBootstrapEvidence,
  project: ProjectProbeEvidence | null,
): Pick<CapabilityPreflightEvidence, "blockers" | "mode" | "next_action"> {
  const drift = bindingDrift(binding, host, project);
  const blockers = sorted([
    ...host.blockers,
    ...(project?.blockers ?? (host.status === "passed" ? ["PROJECT_PROBE_FAILED"] : [])),
    ...drift,
  ]);
  const hardBlocked = host.status !== "passed" || project === null || project.status !== "passed" || drift.length > 0;
  const canAutomate = !hardBlocked && project !== null &&
    host.automatic_lifecycle && project.atomic_create_or_return && project.automatic_archive;
  const mode: CapabilityMode = hardBlocked
    ? "blocked"
    : canAutomate
      ? "full"
      : "manual-isolated";
  const nextAction = mode === "full"
    ? "automatic-dispatch-eligible" as const
    : mode === "manual-isolated"
      ? "request-manual-isolated-task" as const
      : "stop-and-reprobe" as const;
  return { blockers, mode, next_action: nextAction };
}

export function parseCapabilityPreflightRequest(value: unknown): CapabilityPreflightRequest {
  const snapshot = safeSnapshot(value);
  assertSchema(snapshot, "capability-preflight-request");
  return snapshot as unknown as CapabilityPreflightRequest;
}

export function parseCapabilityPreflightEvidence(value: unknown): CapabilityPreflightEvidence {
  const snapshot = safeSnapshot(value);
  assertSchema(snapshot, "capability-preflight-evidence");
  const evidence = snapshot as unknown as CapabilityPreflightEvidence;
  if (attestationDigest(evidence.stages.host_bootstrap) !== evidence.stages.host_bootstrap.attestation_digest) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Host attestation digest mismatch");
  }
  if (
    evidence.stages.project_probe !== null &&
    attestationDigest(evidence.stages.project_probe) !== evidence.stages.project_probe.attestation_digest
  ) fail("INVALID_CAPABILITY_PREFLIGHT", "Project attestation digest mismatch");
  const derived = deriveCapabilityState(
    evidence.binding,
    evidence.stages.host_bootstrap,
    evidence.stages.project_probe,
  );
  if (
    evidence.mode !== derived.mode ||
    evidence.next_action !== derived.next_action ||
    canonicalizeJson(evidence.blockers) !== canonicalizeJson(derived.blockers)
  ) fail("INVALID_CAPABILITY_PREFLIGHT", "Capability preflight derived state mismatch");
  const projection = projectForDigest(evidence, ["evidence_digest"]);
  if (digestJson(projection) !== evidence.evidence_digest) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Capability preflight evidence digest mismatch");
  }
  const identityProjection = projectForDigest(evidence, ["preflight_id", "evidence_digest"]);
  if (`cp-${digestJson(identityProjection).slice("sha256:".length)}` !== evidence.preflight_id) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Capability preflight identity mismatch");
  }
  const observed = Date.parse(evidence.observed_at);
  const expires = Date.parse(evidence.expires_at);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || expires <= observed) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Capability preflight validity window is invalid");
  }
  if (evidence.mode !== "blocked" && (
    evidence.stages.host_bootstrap.status !== "passed" ||
    evidence.stages.project_probe?.status !== "passed" ||
    evidence.stages.project_probe.start_state !== "clean"
  )) fail("INVALID_CAPABILITY_PREFLIGHT", "Non-blocked evidence requires two passed stages and a clean start");
  return evidence;
}

export async function evaluateCapabilityPreflight(
  value: unknown,
  runtime: CapabilityPreflightRuntime,
): Promise<CapabilityPreflightEvidence> {
  const request = parseCapabilityPreflightRequest(value);
  const now = runtime.now();
  if (!Number.isFinite(now.getTime())) fail("INVALID_CAPABILITY_PREFLIGHT", "Trusted clock is invalid");

  let host: HostBootstrapEvidence;
  try {
    host = await runtime.hostBootstrap();
    assertRuntimeEvidence(host);
  } catch {
    host = blockedHost(request.expected_binding, "HOST_BOOTSTRAP_FAILED");
  }

  let project: ProjectProbeEvidence | null = null;
  if (host.status === "passed") {
    try {
      project = await runtime.projectProbe(request);
      assertRuntimeEvidence(project);
    } catch {
      project = null;
    }
  }

  const derived = deriveCapabilityState(request.expected_binding, host, project);
  const observedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + request.validity_seconds * 1000).toISOString();
  const withoutIdentity = {
    schema_version: "1.0" as const,
    record_type: "capability-preflight-evidence" as const,
    mode: derived.mode,
    binding: request.expected_binding,
    observed_at: observedAt,
    expires_at: expiresAt,
    stages: { host_bootstrap: host, project_probe: project },
    blockers: derived.blockers,
    next_action: derived.next_action,
  };
  const preflightId = preflightIdentity(withoutIdentity);
  const withoutDigest = { ...withoutIdentity, preflight_id: preflightId };
  return parseCapabilityPreflightEvidence({ ...withoutDigest, evidence_digest: digestJson(withoutDigest) });
}

export async function verifyCapabilityPreflightEvidence(
  value: unknown,
  binding: CapabilityBinding,
  now: Date,
  verifier?: CapabilityEvidenceVerifier,
): Promise<CapabilityPreflightEvidence> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("INVALID_CAPABILITY_PREFLIGHT", "Trusted clock is invalid");
  }
  const evidence = parseCapabilityPreflightEvidence(value);
  if (canonicalizeJson(evidence.binding) !== canonicalizeJson(binding) || now.getTime() < Date.parse(evidence.observed_at)) {
    fail("CAPABILITY_BINDING_DRIFT", "Capability evidence binding or trusted time changed");
  }
  if (now.getTime() >= Date.parse(evidence.expires_at)) {
    fail("CAPABILITY_EVIDENCE_EXPIRED", "Capability evidence expired");
  }
  if (verifier === undefined) fail("CAPABILITY_EVIDENCE_UNTRUSTED", "Trusted capability evidence verifier is required");
  if (
    typeof verifier.verifyEvidence !== "function" ||
    typeof verifier.verifyHost !== "function" ||
    typeof verifier.verifyProject !== "function"
  ) {
    fail("CAPABILITY_EVIDENCE_UNTRUSTED", "Trusted complete capability evidence verifier is required");
  }
  if (!await verifier.verifyEvidence(evidence.evidence_digest)) {
    fail("CAPABILITY_EVIDENCE_UNTRUSTED", "Complete capability evidence could not be verified");
  }
  const hostTrusted = await verifier.verifyHost(evidence.stages.host_bootstrap.attestation_digest);
  const projectTrusted = evidence.stages.project_probe === null
    ? evidence.mode === "blocked"
    : await verifier.verifyProject(evidence.stages.project_probe.attestation_digest);
  if (!hostTrusted || !projectTrusted) fail("CAPABILITY_EVIDENCE_UNTRUSTED", "Capability attestation could not be verified");
  return evidence;
}
