import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { isPlainRecord } from "./value-guards.ts";

export interface ProjectStatusSource {
  readonly schema_version: "1.0";
  readonly observed_at: string;
  readonly formal_oid: string;
  readonly control_oid: string;
  readonly control_parent_oid: string;
  readonly checkpoint_blob_oid: string;
  readonly registry_blob_oid: string;
  readonly checkpoint: unknown;
  readonly registry: unknown;
}

export interface ProjectStatusProjection {
  readonly schema_version: "1.0";
  readonly status: "available" | "unavailable";
  readonly current_stage: string | null;
  readonly current_scope: string | null;
  readonly latest_formal_conclusion: string | null;
  readonly blockers: readonly {
    readonly reason_code: string;
    readonly evidence_ref: string;
  }[];
  readonly next_action: string | null;
  readonly risk_summary: readonly string[];
  readonly formal_oid: string;
  readonly control_oid: string;
  readonly source_digest: Sha256Digest;
  readonly freshness: "current" | "stale" | "unknown";
  readonly unavailable_reasons: readonly string[];
}

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9./_-]+$/;
const KNOWN_STATUSES = new Set([
  "packet-created", "dispatch-claimed", "dispatch-ready", "running", "candidate-ready",
  "gate-passed", "package-accepted", "formally-promoted", "completed", "closed",
  "blocked", "gate-blocked", "gate-revise", "revision-required",
  "revision-required-after-audit", "rejected", "stalled-before-mutation",
]);
const BLOCKING_STATUSES = new Set([
  "blocked", "gate-blocked", "gate-revise", "revision-required",
  "revision-required-after-audit", "rejected", "stalled-before-mutation",
]);

function text(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function integer(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function sourceDigest(source: Partial<ProjectStatusSource>): Sha256Digest {
  return digestJson({
    checkpoint_blob_oid: typeof source.checkpoint_blob_oid === "string" ? source.checkpoint_blob_oid : "",
    control_oid: typeof source.control_oid === "string" ? source.control_oid : "",
    formal_oid: typeof source.formal_oid === "string" ? source.formal_oid : "",
    registry_blob_oid: typeof source.registry_blob_oid === "string" ? source.registry_blob_oid : "",
  });
}

export function createUnavailableProjectStatus(
  reason: string,
  source: Partial<ProjectStatusSource> = {},
  freshness: ProjectStatusProjection["freshness"] = "unknown",
): ProjectStatusProjection {
  const safeReason = /^[a-z][a-z0-9-]{0,63}$/.test(reason) ? reason : "source-unavailable";
  return Object.freeze({
    schema_version: "1.0",
    status: "unavailable",
    current_stage: null,
    current_scope: null,
    latest_formal_conclusion: null,
    blockers: Object.freeze([]),
    next_action: null,
    risk_summary: Object.freeze([]),
    formal_oid: typeof source.formal_oid === "string" && OID.test(source.formal_oid) ? source.formal_oid : "",
    control_oid: typeof source.control_oid === "string" && OID.test(source.control_oid) ? source.control_oid : "",
    source_digest: sourceDigest(source),
    freshness,
    unavailable_reasons: Object.freeze([safeReason]),
  });
}

function matchingIdentity(
  checkpoint: Record<string, unknown>,
  registry: Record<string, unknown>,
): boolean {
  return ["schema_version", "repository_id", "route_generation", "plan_id", "plan_generation"]
    .every((key) => checkpoint[key] === registry[key]);
}

function latestFormalConclusion(
  checkpoint: Record<string, unknown>,
  formalOid: string,
): string | null {
  const signoffs = checkpoint.version_signoffs;
  if (!isPlainRecord(signoffs)) return null;
  let latest: { version: string; completedAt: number } | null = null;
  for (const [version, value] of Object.entries(signoffs)) {
    if (!SAFE_ID.test(version) || !isPlainRecord(value)) continue;
    const completed = Date.parse(text(value, "completed_at") ?? "");
    if (
      value.status !== "approved" || value.formal_oid !== formalOid ||
      !text(value, "result_ref") || !DIGEST.test(text(value, "result_digest") ?? "") ||
      !text(value, "approval_message_id") || !text(value, "completion_message_id") ||
      !Number.isFinite(completed)
    ) continue;
    if (latest === null || completed > latest.completedAt) latest = { version, completedAt: completed };
  }
  return latest === null ? null : `${latest.version} formally completed`;
}

interface CurrentTask {
  readonly stage: string;
  readonly task: string;
  readonly attempt: number;
  readonly generation: number;
  readonly status: string;
  readonly updatedAt: number;
  readonly expiry: number | null;
}

function selectCurrentTask(
  checkpoint: Record<string, unknown>,
  registry: Record<string, unknown>,
): CurrentTask | "highest-identity-conflict" | "unknown-status" | null {
  if (!isPlainRecord(checkpoint.highest_task_attempts) || !Array.isArray(registry.tasks)) return null;
  const generation = integer(checkpoint, "plan_generation");
  if (generation === null) return null;
  const identities = new Map<string, CurrentTask>();
  for (const raw of registry.tasks) {
    if (!isPlainRecord(raw) || integer(raw, "highest_confirmed_generation") !== generation) continue;
    const task = text(raw, "task_id");
    const stage = text(raw, "stage_id");
    const attempt = integer(raw, "task_attempt");
    const status = text(raw, "status");
    if (!task || !stage || attempt === null || checkpoint.highest_task_attempts[task] !== attempt) continue;
    if (!SAFE_ID.test(task) || !SAFE_ID.test(stage) || !status) return "unknown-status";
    if (identities.has(task)) return "highest-identity-conflict";
    const updatedAt = Date.parse(text(raw, "updated_at") ?? "");
    if (!Number.isFinite(updatedAt)) return "highest-identity-conflict";
    const claim = raw.dispatch_claim;
    const expiryText = isPlainRecord(claim) ? text(claim, "lease_expires_at") : text(raw, "expires_at");
    const expiry = expiryText === null ? null : Date.parse(expiryText);
    if (expiryText !== null && !Number.isFinite(expiry)) return "highest-identity-conflict";
    identities.set(task, { stage, task, attempt, generation, status, updatedAt, expiry });
  }
  const ordered = [...identities.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  if (ordered.length === 0) return null;
  if (ordered[1]?.updatedAt === ordered[0]?.updatedAt) return "highest-identity-conflict";
  const current = ordered[0];
  if (!current) return null;
  return KNOWN_STATUSES.has(current.status) ? current : "unknown-status";
}

export function projectProjectStatus(source: ProjectStatusSource): ProjectStatusProjection {
  try {
    if (
      source.schema_version !== "1.0" || !OID.test(source.formal_oid) || !OID.test(source.control_oid) ||
      !OID.test(source.control_parent_oid) || !OID.test(source.checkpoint_blob_oid) ||
      !OID.test(source.registry_blob_oid) || !Number.isFinite(Date.parse(source.observed_at))
    ) return createUnavailableProjectStatus("invalid-oid", source);
    if (!isPlainRecord(source.checkpoint) || !isPlainRecord(source.registry)) {
      return createUnavailableProjectStatus("invalid-source", source);
    }
    const checkpoint = source.checkpoint;
    const registry = source.registry;
    if (
      checkpoint.formal_ref !== "refs/nextstep/formal" || checkpoint.formal_oid !== source.formal_oid ||
      checkpoint.control_parent_oid !== source.control_parent_oid || !matchingIdentity(checkpoint, registry)
    ) return createUnavailableProjectStatus("identity-conflict", source);

    const task = selectCurrentTask(checkpoint, registry);
    if (task === "highest-identity-conflict" || task === "unknown-status") {
      return createUnavailableProjectStatus(task, source);
    }
    if (task === null) return createUnavailableProjectStatus("missing-current-identity", source);
    const formalConclusion = latestFormalConclusion(checkpoint, source.formal_oid);
    if (formalConclusion === null) return createUnavailableProjectStatus("incomplete-formal-conclusion", source);

    let freshness: ProjectStatusProjection["freshness"] = "unknown";
    if (task.expiry !== null) {
      freshness = task.expiry > Date.parse(source.observed_at) ? "current" : "stale";
      if (freshness === "stale") return createUnavailableProjectStatus("stale-active-identity", source, freshness);
    }
    const nextStage = text(checkpoint, "next_stage");
    const identity = `${task.task} generation ${task.generation} attempt ${task.attempt}`;
    if (!nextStage || !nextStage.includes(identity)) {
      return createUnavailableProjectStatus("unproven-next-action", source, freshness);
    }
    if (/\b(?:claim|fence|secret|chat|source code|absolute path)\b|(?:^|\s)\/(?:Users|Volumes|home|tmp|var|etc)\//i.test(nextStage)) {
      return createUnavailableProjectStatus("next-action-sensitive", source, freshness);
    }
    const blockers = BLOCKING_STATUSES.has(task.status)
      ? Object.freeze([{ reason_code: task.status, evidence_ref: `registry:${task.task}@g${task.generation}#a${task.attempt}` }])
      : Object.freeze([]);
    return Object.freeze({
      schema_version: "1.0",
      status: "available",
      current_stage: task.stage,
      current_scope: identity,
      latest_formal_conclusion: formalConclusion,
      blockers,
      next_action: nextStage,
      risk_summary: Object.freeze([]),
      formal_oid: source.formal_oid,
      control_oid: source.control_oid,
      source_digest: sourceDigest(source),
      freshness,
      unavailable_reasons: Object.freeze([]),
    });
  } catch {
    return createUnavailableProjectStatus("invalid-source", source);
  }
}
