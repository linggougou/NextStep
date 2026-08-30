import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import adoptionCandidateSchema from "../../schemas/v1/adoption-candidate.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, projectForDigest, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export type AdoptionEvidenceClassification = "verified" | "user-declared" | "unknown";
export const ADOPTION_ROUTE_LOCK_PATH = "PROJECT_ROUTE_LOCK.md";
export const ADOPTION_VERIFICATION_SUMMARY_PATH = ".codex/verification-report.md";
const ACTIVE_PLAN_PATH = /^docs\/exec-plans\/active\/[a-z0-9][a-z0-9._-]*\.md$/;

export interface AdoptionSourceBlob {
  readonly path: string;
  readonly blob_oid: string;
  readonly digest: Sha256Digest;
}

export interface AdoptionEvidenceSource extends AdoptionSourceBlob {
  readonly classification: AdoptionEvidenceClassification;
}

export interface AdoptionCandidateSource {
  readonly namespace_status: "PROJECT_NOT_ADOPTED";
  readonly repository_identity: Sha256Digest;
  readonly object_format: "sha1" | "sha256";
  readonly candidate_head_oid: string;
  readonly route_lock: AdoptionSourceBlob;
  readonly active_plan: AdoptionSourceBlob;
  readonly evidence_sources: readonly AdoptionEvidenceSource[];
  readonly worktree_projection_digest: Sha256Digest;
  readonly nextstep_namespace_digest: Sha256Digest;
  readonly created_at_trusted: string;
  readonly expires_at_trusted: string;
}

interface ProjectionValue {
  readonly value: string | null;
  readonly classification: AdoptionEvidenceClassification;
}

export interface AdoptionCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-candidate";
  readonly repository_identity: Sha256Digest;
  readonly object_format: "sha1" | "sha256";
  readonly candidate_head_oid: string;
  readonly route_lock: AdoptionSourceBlob;
  readonly active_plan: AdoptionSourceBlob;
  readonly evidence_sources: readonly AdoptionEvidenceSource[];
  readonly proposed_projection: {
    readonly phase: ProjectionValue;
    readonly stage: ProjectionValue;
    readonly milestone: ProjectionValue;
    readonly scope: ProjectionValue;
  };
  readonly unknown_gates: readonly string[];
  readonly declared_non_goals: readonly string[];
  readonly worktree_projection_digest: Sha256Digest;
  readonly nextstep_namespace_digest: Sha256Digest;
  readonly created_at_trusted: string;
  readonly expires_at_trusted: string;
  readonly candidate_digest: Sha256Digest;
}

export type AdoptionCandidateReasonCode =
  | "INVALID_ADOPTION_CANDIDATE"
  | "SENSITIVE_INPUT"
  | "SOURCE_PATH_CONFLICT"
  | "EVIDENCE_UPGRADE_FORBIDDEN"
  | "INVALID_TIME_WINDOW"
  | "CANDIDATE_DIGEST_MISMATCH";

export class AdoptionCandidateError extends Error {
  readonly code: AdoptionCandidateReasonCode;
  readonly path: string;

  constructor(code: AdoptionCandidateReasonCode, path = "$") {
    super("Adoption candidate rejected");
    this.code = code;
    this.path = path;
  }
}

const ajv = new Ajv({
  strict: true,
  allErrors: true,
  allowUnionTypes: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  ownProperties: true,
});
const validateCandidate: ValidateFunction<AdoptionCandidate> =
  ajv.compile<AdoptionCandidate>(adoptionCandidateSchema);

const SOURCE_FIELDS = [
  "namespace_status", "repository_identity", "object_format", "candidate_head_oid",
  "route_lock", "active_plan", "evidence_sources", "worktree_projection_digest",
  "nextstep_namespace_digest", "created_at_trusted", "expires_at_trusted",
] as const;

function reject(code: AdoptionCandidateReasonCode, path = "$"): never {
  throw new AdoptionCandidateError(code, path);
}

function safeSnapshot(value: unknown): JsonValue {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    reject("INVALID_ADOPTION_CANDIDATE");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    reject("SENSITIVE_INPUT");
  }
  return snapshot;
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function schemaPath(errors: readonly ErrorObject[] | null | undefined): string {
  return errors?.[0]?.instancePath || "$";
}

function assertSemanticBoundary(candidate: AdoptionCandidate): void {
  if (
    candidate.route_lock.path !== ADOPTION_ROUTE_LOCK_PATH ||
    !ACTIVE_PLAN_PATH.test(candidate.active_plan.path) ||
    candidate.evidence_sources.length !== 1 ||
    candidate.evidence_sources[0]?.path !== ADOPTION_VERIFICATION_SUMMARY_PATH
  ) {
    reject("SOURCE_PATH_CONFLICT", "/evidence_sources");
  }
  const sourcePaths = [candidate.route_lock.path, candidate.active_plan.path];
  for (const evidence of candidate.evidence_sources) {
    sourcePaths.push(evidence.path);
    if (evidence.classification === "verified") {
      reject("EVIDENCE_UPGRADE_FORBIDDEN", "/evidence_sources");
    }
  }
  const normalized = sourcePaths.map((path) => path.normalize("NFC").toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) {
    reject("SOURCE_PATH_CONFLICT", "/evidence_sources");
  }
  const created = Date.parse(candidate.created_at_trusted);
  const expires = Date.parse(candidate.expires_at_trusted);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created >= expires) {
    reject("INVALID_TIME_WINDOW", "/expires_at_trusted");
  }
}

export function createAdoptionCandidate(value: unknown): AdoptionCandidate {
  const snapshot = safeSnapshot(value);
  if (!isPlainRecord(snapshot) || !exactFields(snapshot, SOURCE_FIELDS)) {
    reject("INVALID_ADOPTION_CANDIDATE");
  }
  if (
    snapshot.namespace_status !== "PROJECT_NOT_ADOPTED" ||
    !validTimestamp(snapshot.created_at_trusted) ||
    !validTimestamp(snapshot.expires_at_trusted)
  ) {
    reject("INVALID_ADOPTION_CANDIDATE");
  }
  const source = snapshot as unknown as AdoptionCandidateSource;
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-candidate" as const,
    repository_identity: source.repository_identity,
    object_format: source.object_format,
    candidate_head_oid: source.candidate_head_oid,
    route_lock: source.route_lock,
    active_plan: source.active_plan,
    evidence_sources: source.evidence_sources,
    proposed_projection: {
      phase: { value: "existing-project-adoption", classification: "unknown" as const },
      stage: { value: null, classification: "unknown" as const },
      milestone: { value: null, classification: "unknown" as const },
      scope: { value: null, classification: "unknown" as const },
    },
    unknown_gates: [
      "historical-gates-not-verified",
      "trusted-user-confirmation-required",
      "activation-not-performed",
    ],
    declared_non_goals: [
      "no-ref-write",
      "no-control-genesis",
      "no-trusted-user-confirmation",
      "no-historical-gate-claim",
      "no-development-authorization",
    ],
    worktree_projection_digest: source.worktree_projection_digest,
    nextstep_namespace_digest: source.nextstep_namespace_digest,
    created_at_trusted: source.created_at_trusted,
    expires_at_trusted: source.expires_at_trusted,
  };
  const candidate = snapshotJsonValue({
    ...unsigned,
    candidate_digest: digestJson(unsigned),
  }) as unknown as AdoptionCandidate;
  if (!validateCandidate(candidate)) {
    reject("INVALID_ADOPTION_CANDIDATE", schemaPath(validateCandidate.errors));
  }
  assertSemanticBoundary(candidate);
  return candidate;
}

export function parseAdoptionCandidate(value: unknown): AdoptionCandidate {
  const snapshot = safeSnapshot(value);
  if (!isPlainRecord(snapshot) || !validateCandidate(snapshot)) {
    reject("INVALID_ADOPTION_CANDIDATE", schemaPath(validateCandidate.errors));
  }
  const candidate = snapshot as unknown as AdoptionCandidate;
  assertSemanticBoundary(candidate);
  if (digestJson(projectForDigest(candidate, ["candidate_digest"])) !== candidate.candidate_digest) {
    reject("CANDIDATE_DIGEST_MISMATCH", "/candidate_digest");
  }
  return candidate;
}

export function adoptionCandidateSourceDigest(candidate: AdoptionCandidate): Sha256Digest {
  return digestJson(projectForDigest(candidate, [
    "created_at_trusted",
    "expires_at_trusted",
    "candidate_digest",
  ]));
}
