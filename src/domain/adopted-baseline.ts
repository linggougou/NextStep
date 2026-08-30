import { Ajv, type ValidateFunction } from "ajv";

import adoptedBaselineSchema from "../../schemas/v1/adopted-baseline.schema.json" with { type: "json" };
import adoptionConfirmationSchema from "../../schemas/v1/adoption-confirmation.schema.json" with { type: "json" };
import { type AdoptionCandidate, parseAdoptionCandidate } from "./adoption-candidate.ts";
import { canonicalizeJson, snapshotJsonValue } from "./canonical-json.ts";
import { digestJson, projectForDigest, type Sha256Digest } from "./content-digest.ts";

export const ADOPTED_BASELINE_DISCLAIMER = "adopted baseline; historical gates not verified by NextStep" as const;

export interface AdoptionProjection {
  readonly stage: string;
  readonly milestone: string;
  readonly scope: string;
}

export interface AdoptionConfirmationView {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-confirmation-view";
  readonly repository_identity: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly candidate_head_oid: string;
  readonly projection: AdoptionProjection;
  readonly evidence_assessments: readonly {
    readonly subject: string;
    readonly classification: "user-declared" | "unknown";
  }[];
  readonly unknown_gates: readonly string[];
  readonly activation_side_effects: readonly string[];
  readonly declared_non_goals: readonly string[];
  readonly rollback_restrictions: readonly string[];
  readonly view_digest: Sha256Digest;
}

export interface AdoptionConfirmationInput {
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_view: AdoptionConfirmationView;
  readonly displayed_view_digest: Sha256Digest;
  readonly user_action_ref: string;
  readonly session_identity: Sha256Digest;
  readonly verifier_identity: string;
  readonly verified_at_trusted: string;
  readonly expires_at_trusted: string;
  readonly nonce_or_replay_key: string;
  readonly decision: "confirm";
}

export interface AdoptionConfirmationEnvelope extends AdoptionConfirmationInput {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-confirmation-envelope";
  readonly envelope_digest: Sha256Digest;
}

export interface AdoptionConfirmationVerifier {
  readonly verifier_kind: "trusted-host";
  verify(input: AdoptionConfirmationInput): boolean;
  reconstructConfirmationView(candidate: AdoptionCandidate): AdoptionConfirmationView;
}

export interface AdoptedBaselineRecord {
  readonly schema_version: "1.0";
  readonly record_type: "adopted-baseline";
  readonly repository_identity: Sha256Digest;
  readonly baseline_oid: string;
  readonly source_blobs: readonly {
    readonly path: string;
    readonly blob_oid: string;
    readonly digest: Sha256Digest;
    readonly classification: "user-declared" | "unknown";
  }[];
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_envelope_digest: Sha256Digest;
  readonly projected_stage: string;
  readonly projected_milestone: string;
  readonly projected_scope: string;
  readonly evidence_assessments: readonly {
    readonly subject: string;
    readonly classification: "user-declared" | "unknown";
  }[];
  readonly unknown_gates: readonly string[];
  readonly disclaimer: typeof ADOPTED_BASELINE_DISCLAIMER;
  readonly lifecycle_state: "activated" | "rollback-eligible" | "rollback-blocked" | "superseded";
  readonly record_digest: Sha256Digest;
}

export type AdoptionTrustErrorCode =
  | "INVALID_ADOPTION_CONFIRMATION"
  | "ADOPTION_CONFIRMATION_UNTRUSTED"
  | "ADOPTION_CONFIRMATION_EXPIRED"
  | "ADOPTION_CONFIRMATION_REPLAY"
  | "ADOPTED_BASELINE_INVALID";

export class AdoptionTrustError extends Error {
  readonly code: AdoptionTrustErrorCode;
  constructor(code: AdoptionTrustErrorCode) {
    super("Trusted adoption input rejected");
    this.code = code;
  }
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateConfirmation: ValidateFunction<AdoptionConfirmationEnvelope> = ajv.compile(adoptionConfirmationSchema);
const validateBaseline: ValidateFunction<AdoptedBaselineRecord> = ajv.compile(adoptedBaselineSchema);
const replayByVerifier = new WeakMap<object, Map<string, Sha256Digest>>();
const trustedEnvelopes = new WeakSet<object>();

function fail(code: AdoptionTrustErrorCode): never {
  throw new AdoptionTrustError(code);
}

function validTime(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail("INVALID_ADOPTION_CONFIRMATION");
  return result;
}

const ACTIVATION_SIDE_EFFECTS = Object.freeze([
  "create-formal-and-control-ref-pair",
  "create-zero-parent-control-genesis",
  "create-single-parent-adoption-activation",
  "persist-adopted-baseline-and-status-state",
]);
const ROLLBACK_RESTRICTIONS = Object.freeze([
  "only-before-any-successor-control-state",
  "only-with-empty-task-outbox-claim-ack-result-promotion-state",
  "only-with-current-namespace-digest-match",
  "only-via-trusted-host-action",
]);

export function createAdoptionConfirmationView(
  candidateInput: AdoptionCandidate,
  projection: AdoptionProjection,
): AdoptionConfirmationView {
  const candidate = parseAdoptionCandidate(candidateInput);
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-confirmation-view" as const,
    repository_identity: candidate.repository_identity,
    candidate_digest: candidate.candidate_digest,
    candidate_head_oid: candidate.candidate_head_oid,
    projection: snapshotJsonValue(projection) as unknown as AdoptionProjection,
    evidence_assessments: [
      { subject: "route-lock", classification: "user-declared" as const },
      { subject: "active-plan", classification: "user-declared" as const },
      ...candidate.evidence_sources.map((source) => ({
        subject: "evidence-summary",
        classification: source.classification === "user-declared" ? "user-declared" as const : "unknown" as const,
      })),
      { subject: "historical-gates", classification: "unknown" as const },
    ],
    unknown_gates: [...candidate.unknown_gates, "pre-adoption-history-not-verified"],
    activation_side_effects: ACTIVATION_SIDE_EFFECTS,
    declared_non_goals: candidate.declared_non_goals,
    rollback_restrictions: ROLLBACK_RESTRICTIONS,
  };
  return snapshotJsonValue({ ...unsigned, view_digest: digestJson(unsigned) }) as unknown as AdoptionConfirmationView;
}

function assertConfirmationView(
  candidate: AdoptionCandidate,
  view: AdoptionConfirmationView,
  projection: AdoptionProjection = view.projection,
): void {
  const expected = createAdoptionConfirmationView(candidate, projection);
  if (canonicalizeJson(expected) !== canonicalizeJson(view)) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
}

export function verifyAdoptionConfirmation(
  candidateInput: AdoptionCandidate,
  input: AdoptionConfirmationInput,
  verifier: AdoptionConfirmationVerifier | undefined,
  now: () => Date,
): AdoptionConfirmationEnvelope {
  const candidate = parseAdoptionCandidate(candidateInput);
  let snapshot: AdoptionConfirmationInput;
  try {
    snapshot = snapshotJsonValue(input) as unknown as AdoptionConfirmationInput;
  } catch {
    fail("INVALID_ADOPTION_CONFIRMATION");
  }
  if (
    snapshot.candidate_digest !== candidate.candidate_digest ||
    verifier?.verifier_kind !== "trusted-host" || typeof verifier.verify !== "function" ||
    typeof verifier.reconstructConfirmationView !== "function" ||
    snapshot.decision !== "confirm"
  ) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  assertConfirmationView(candidate, snapshot.confirmation_view);
  if (snapshot.displayed_view_digest !== snapshot.confirmation_view.view_digest) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  let verifierView: AdoptionConfirmationView;
  try { verifierView = verifier.reconstructConfirmationView(candidate); } catch { fail("ADOPTION_CONFIRMATION_UNTRUSTED"); }
  if (canonicalizeJson(verifierView) !== canonicalizeJson(snapshot.confirmation_view)) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  const current = now().getTime();
  const verified = validTime(snapshot.verified_at_trusted);
  const expires = validTime(snapshot.expires_at_trusted);
  if (!Number.isFinite(current) || current < verified || current >= expires || expires > Date.parse(candidate.expires_at_trusted)) {
    fail("ADOPTION_CONFIRMATION_EXPIRED");
  }
  let accepted = false;
  try { accepted = verifier.verify(snapshot) === true; } catch { /* fail closed */ }
  if (!accepted) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  const payloadDigest = digestJson(snapshot);
  const replays = replayByVerifier.get(verifier) ?? new Map<string, Sha256Digest>();
  const prior = replays.get(snapshot.nonce_or_replay_key);
  if (prior !== undefined && prior !== payloadDigest) fail("ADOPTION_CONFIRMATION_REPLAY");
  replays.set(snapshot.nonce_or_replay_key, payloadDigest);
  replayByVerifier.set(verifier, replays);
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-confirmation-envelope" as const,
    ...snapshot,
  };
  const envelope = snapshotJsonValue({ ...unsigned, envelope_digest: digestJson(unsigned) }) as unknown as AdoptionConfirmationEnvelope;
  if (!validateConfirmation(envelope)) fail("INVALID_ADOPTION_CONFIRMATION");
  trustedEnvelopes.add(envelope);
  return envelope;
}

export function parseAdoptionConfirmation(value: unknown): AdoptionConfirmationEnvelope {
  let snapshot: unknown;
  try { snapshot = snapshotJsonValue(value); } catch { fail("INVALID_ADOPTION_CONFIRMATION"); }
  if (!validateConfirmation(snapshot)) fail("INVALID_ADOPTION_CONFIRMATION");
  const envelope = snapshot as AdoptionConfirmationEnvelope;
  if (digestJson(projectForDigest(envelope, ["envelope_digest"])) !== envelope.envelope_digest) {
    fail("INVALID_ADOPTION_CONFIRMATION");
  }
  return envelope;
}

export function assertTrustedAdoptionConfirmation(value: AdoptionConfirmationEnvelope): void {
  if (!trustedEnvelopes.has(value)) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  parseAdoptionConfirmation(value);
}

export function createAdoptedBaseline(
  candidateInput: AdoptionCandidate,
  envelopeInput: AdoptionConfirmationEnvelope,
  projection: AdoptionProjection,
): AdoptedBaselineRecord {
  const candidate = parseAdoptionCandidate(candidateInput);
  const envelope = parseAdoptionConfirmation(envelopeInput);
  if (envelope.candidate_digest !== candidate.candidate_digest) fail("ADOPTED_BASELINE_INVALID");
  assertConfirmationView(candidate, envelope.confirmation_view, projection);
  const sourceBlobs = [
    { ...candidate.route_lock, classification: "user-declared" as const },
    { ...candidate.active_plan, classification: "user-declared" as const },
    ...candidate.evidence_sources.map((source) => ({
      path: source.path, blob_oid: source.blob_oid, digest: source.digest,
      classification: source.classification === "user-declared" ? "user-declared" as const : "unknown" as const,
    })),
  ];
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adopted-baseline" as const,
    repository_identity: candidate.repository_identity,
    baseline_oid: candidate.candidate_head_oid,
    source_blobs: sourceBlobs,
    candidate_digest: candidate.candidate_digest,
    confirmation_envelope_digest: envelope.envelope_digest,
    projected_stage: envelope.confirmation_view.projection.stage,
    projected_milestone: envelope.confirmation_view.projection.milestone,
    projected_scope: envelope.confirmation_view.projection.scope,
    evidence_assessments: envelope.confirmation_view.evidence_assessments,
    unknown_gates: envelope.confirmation_view.unknown_gates,
    disclaimer: ADOPTED_BASELINE_DISCLAIMER,
    lifecycle_state: "rollback-eligible" as const,
  };
  const record = snapshotJsonValue({ ...unsigned, record_digest: digestJson(unsigned) }) as unknown as AdoptedBaselineRecord;
  if (!validateBaseline(record)) fail("ADOPTED_BASELINE_INVALID");
  return record;
}

export function parseAdoptedBaseline(value: unknown): AdoptedBaselineRecord {
  let snapshot: unknown;
  try { snapshot = snapshotJsonValue(value); } catch { fail("ADOPTED_BASELINE_INVALID"); }
  if (!validateBaseline(snapshot)) fail("ADOPTED_BASELINE_INVALID");
  const record = snapshot as AdoptedBaselineRecord;
  if (digestJson(projectForDigest(record, ["record_digest"])) !== record.record_digest) fail("ADOPTED_BASELINE_INVALID");
  return record;
}
