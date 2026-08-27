import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import versionChainSchema from "../../schemas/v1/version-chain.schema.json" with { type: "json" };
import { canonicalizeJson, snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

export const VERSION_CHAIN_IDS = ["V1", "V2", "V3", "V4", "Final Acceptance"] as const;
export type VersionChainId = (typeof VERSION_CHAIN_IDS)[number];

export const REQUIRED_PC_IDS = Object.freeze(
  Array.from({ length: 20 }, (_, index) => `PC-${String(index + 1).padStart(2, "0")}`),
) as readonly `PC-${string}`[];
export type RequiredPcId = (typeof REQUIRED_PC_IDS)[number];

const EXPECTED_OWNER = new Map<RequiredPcId, VersionChainId>([
  ...REQUIRED_PC_IDS.slice(0, 8).map((pcId) => [pcId, "V1"] as const),
  ...REQUIRED_PC_IDS.slice(8, 13).map((pcId) => [pcId, "V2"] as const),
  ...REQUIRED_PC_IDS.slice(13, 18).map((pcId) => [pcId, "V3"] as const),
  ...REQUIRED_PC_IDS.slice(18, 20).map((pcId) => [pcId, "V4"] as const),
]);
const REQUIRED_PC_SET = new Set<string>(REQUIRED_PC_IDS);

export interface VersionChainProject {
  readonly repository_id: Sha256Digest;
  readonly formal_baseline: string;
}

export interface VersionChainNode {
  readonly version_id: VersionChainId;
  readonly primary_pc_ids: readonly string[];
}

export interface VersionChainBacklogItem {
  readonly item_id: string;
  readonly description: string;
  readonly pc_ids: readonly string[];
}

export interface VersionChainCandidate {
  readonly schema_version: "1.0";
  readonly record_type: "version-chain-candidate";
  readonly project: VersionChainProject;
  readonly versions: readonly VersionChainNode[];
  readonly backlog: readonly VersionChainBacklogItem[];
  readonly summary: {
    readonly version_count: number;
    readonly primary_pc_count: number;
    readonly duplicate_primary_pc_count: number;
    readonly backlog_pc_count: number;
  };
}

export interface VersionChainResult {
  readonly schema_version: "1.0";
  readonly record_type: "version-chain";
  readonly status: "ACCEPTED";
  readonly project: VersionChainProject;
  readonly versions: readonly VersionChainNode[];
  readonly backlog: readonly VersionChainBacklogItem[];
  readonly ownership_matrix: readonly {
    readonly pc_id: RequiredPcId;
    readonly primary_version: Exclude<VersionChainId, "Final Acceptance">;
  }[];
  readonly candidate_digest: Sha256Digest;
  readonly metrics: {
    readonly versions: { readonly actual: number; readonly required: 5 };
    readonly primary_pc: {
      readonly assigned: number;
      readonly required: 20;
      readonly duplicates: number;
      readonly missing: number;
    };
    readonly backlog_pc_count: number;
  };
}

export type VersionChainReasonCode =
  | "INVALID_VERSION_CHAIN"
  | "SENSITIVE_INPUT"
  | "DUPLICATE_VERSION"
  | "VERSION_ORDER_MISMATCH"
  | "UNKNOWN_PC"
  | "MISSING_PRIMARY_PC"
  | "DUPLICATE_PRIMARY_PC"
  | "BACKLOG_PC_FORBIDDEN"
  | "PC_OWNER_MISMATCH"
  | "SUMMARY_MISMATCH"
  | "RESULT_INTEGRITY_MISMATCH";

export interface VersionChainReason {
  readonly code: VersionChainReasonCode;
  readonly path: string;
  readonly message: string;
}

function reasonKey(reason: VersionChainReason): string {
  return `${reason.code}\u0000${reason.path}\u0000${reason.message}`;
}

function sortReasons(reasons: readonly VersionChainReason[]): readonly VersionChainReason[] {
  return Object.freeze(
    [...reasons]
      .sort((left, right) => {
        const leftKey = reasonKey(left);
        const rightKey = reasonKey(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
      .map((reason) => Object.freeze({ ...reason })),
  );
}

export class VersionChainError extends Error {
  readonly reasons: readonly VersionChainReason[];

  constructor(reasons: readonly VersionChainReason[]) {
    super("Version chain rejected");
    this.reasons = sortReasons(reasons);
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
const validateCandidate: ValidateFunction<VersionChainCandidate> =
  ajv.compile<VersionChainCandidate>(versionChainSchema);

function reject(code: VersionChainReasonCode, path: string, message: string): never {
  throw new VersionChainError([{ code, path, message }]);
}

function schemaReasons(errors: readonly ErrorObject[]): readonly VersionChainReason[] {
  return errors.map((error) => ({
    code: "INVALID_VERSION_CHAIN" as const,
    path: error.instancePath || "$",
    message: `Schema keyword rejected: ${error.keyword}`,
  }));
}

function safeCandidate(value: unknown): JsonValue {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    reject("INVALID_VERSION_CHAIN", "$", "Candidate must be a safe JSON value");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    reject("SENSITIVE_INPUT", "$", "Candidate contains sensitive input");
  }
  return snapshot;
}

function summarize(candidate: VersionChainCandidate) {
  const owners = new Map<string, VersionChainId[]>();
  for (const version of candidate.versions) {
    for (const pcId of version.primary_pc_ids) {
      const current = owners.get(pcId) ?? [];
      current.push(version.version_id);
      owners.set(pcId, current);
    }
  }
  return {
    owners,
    version_count: candidate.versions.length,
    primary_pc_count: candidate.versions.reduce((total, version) => total + version.primary_pc_ids.length, 0),
    duplicate_primary_pc_count: REQUIRED_PC_IDS.reduce(
      (total, pcId) => total + Math.max(0, (owners.get(pcId)?.length ?? 0) - 1),
      0,
    ),
    backlog_pc_count: candidate.backlog.reduce((total, item) => total + item.pc_ids.length, 0),
  };
}

function semanticReasons(candidate: VersionChainCandidate): readonly VersionChainReason[] {
  const reasons: VersionChainReason[] = [];
  const versionCounts = new Map<string, number>();
  candidate.versions.forEach((version, index) => {
    versionCounts.set(version.version_id, (versionCounts.get(version.version_id) ?? 0) + 1);
    if (version.version_id !== VERSION_CHAIN_IDS[index]) {
      reasons.push({
        code: "VERSION_ORDER_MISMATCH",
        path: `/versions/${index}/version_id`,
        message: "Version chain order must be V1, V2, V3, V4, Final Acceptance",
      });
    }
  });
  for (const versionId of VERSION_CHAIN_IDS) {
    if ((versionCounts.get(versionId) ?? 0) > 1) {
      reasons.push({
        code: "DUPLICATE_VERSION",
        path: "/versions",
        message: `Version node occurs more than once: ${versionId}`,
      });
    }
  }

  const summary = summarize(candidate);
  for (const [pcId, owners] of summary.owners) {
    if (!REQUIRED_PC_SET.has(pcId)) {
      reasons.push({ code: "UNKNOWN_PC", path: "/versions", message: `Unknown primary PC: ${pcId}` });
    }
    if (owners.length > 1) {
      reasons.push({
        code: "DUPLICATE_PRIMARY_PC",
        path: "/versions",
        message: `PC has multiple primary versions: ${pcId}`,
      });
    }
  }
  for (const pcId of REQUIRED_PC_IDS) {
    const owners = summary.owners.get(pcId) ?? [];
    if (owners.length === 0) {
      reasons.push({ code: "MISSING_PRIMARY_PC", path: "/versions", message: `PC has no primary version: ${pcId}` });
    } else if (owners.length === 1 && owners[0] !== EXPECTED_OWNER.get(pcId)) {
      reasons.push({ code: "PC_OWNER_MISMATCH", path: "/versions", message: `PC primary version differs from P3: ${pcId}` });
    }
  }
  candidate.backlog.forEach((item, itemIndex) => {
    item.pc_ids.forEach((pcId, pcIndex) => {
      reasons.push({
        code: "BACKLOG_PC_FORBIDDEN",
        path: `/backlog/${itemIndex}/pc_ids/${pcIndex}`,
        message: `Backlog cannot contain a PC: ${pcId}`,
      });
    });
  });

  const expectedSummary = {
    version_count: summary.version_count,
    primary_pc_count: summary.primary_pc_count,
    duplicate_primary_pc_count: summary.duplicate_primary_pc_count,
    backlog_pc_count: summary.backlog_pc_count,
  };
  for (const field of Object.keys(expectedSummary) as Array<keyof typeof expectedSummary>) {
    if (candidate.summary[field] !== expectedSummary[field]) {
      reasons.push({
        code: "SUMMARY_MISMATCH",
        path: `/summary/${field}`,
        message: `Candidate summary does not match computed ${field}`,
      });
    }
  }
  return reasons;
}

export function evaluateVersionChain(value: unknown): VersionChainResult {
  const snapshot = safeCandidate(value);
  if (!isPlainRecord(snapshot)) {
    reject("INVALID_VERSION_CHAIN", "$", "Candidate must be an object");
  }
  if (!validateCandidate(snapshot)) {
    throw new VersionChainError(schemaReasons(validateCandidate.errors ?? []));
  }
  const candidate = snapshot as unknown as VersionChainCandidate;
  const reasons = semanticReasons(candidate);
  if (reasons.length > 0) throw new VersionChainError(reasons);

  const ownershipMatrix = REQUIRED_PC_IDS.map((pcId) => ({
    pc_id: pcId,
    primary_version: EXPECTED_OWNER.get(pcId) as Exclude<VersionChainId, "Final Acceptance">,
  }));
  const summary = summarize(candidate);
  return snapshotJsonValue({
    schema_version: "1.0",
    record_type: "version-chain",
    status: "ACCEPTED",
    project: candidate.project,
    versions: candidate.versions,
    backlog: candidate.backlog,
    ownership_matrix: ownershipMatrix,
    candidate_digest: digestJson(candidate),
    metrics: {
      versions: { actual: candidate.versions.length, required: 5 },
      primary_pc: {
        assigned: summary.primary_pc_count,
        required: 20,
        duplicates: summary.duplicate_primary_pc_count,
        missing: 0,
      },
      backlog_pc_count: summary.backlog_pc_count,
    },
  }) as unknown as VersionChainResult;
}

const RESULT_FIELDS = [
  "schema_version", "record_type", "status", "project", "versions", "backlog",
  "ownership_matrix", "candidate_digest", "metrics",
] as const;

export function parseVersionChainResult(value: unknown): VersionChainResult {
  let snapshot: JsonValue;
  try {
    snapshot = safeCandidate(value);
  } catch {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Version chain result is not safe JSON");
  }
  if (!isPlainRecord(snapshot)) {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Version chain result must be an object");
  }
  const actualFields = Object.keys(snapshot).sort();
  const expectedFields = [...RESULT_FIELDS].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index]) ||
    snapshot.record_type !== "version-chain" ||
    snapshot.status !== "ACCEPTED"
  ) {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Version chain result fields or status differ");
  }
  const metrics = snapshot.metrics;
  if (!isPlainRecord(metrics) || !isPlainRecord(metrics.primary_pc) || !isPlainRecord(metrics.versions)) {
    reject("RESULT_INTEGRITY_MISMATCH", "/metrics", "Version chain result metrics are invalid");
  }
  const candidate = {
    schema_version: snapshot.schema_version,
    record_type: "version-chain-candidate",
    project: snapshot.project,
    versions: snapshot.versions,
    backlog: snapshot.backlog,
    summary: {
      version_count: metrics.versions.actual,
      primary_pc_count: metrics.primary_pc.assigned,
      duplicate_primary_pc_count: metrics.primary_pc.duplicates,
      backlog_pc_count: metrics.backlog_pc_count,
    },
  };
  let expected: VersionChainResult;
  try {
    expected = evaluateVersionChain(candidate);
  } catch {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Version chain result cannot restore a valid candidate");
  }
  if (canonicalizeJson(snapshot) !== canonicalizeJson(expected)) {
    reject("RESULT_INTEGRITY_MISMATCH", "$", "Version chain result digest, matrix or metrics differ");
  }
  return expected;
}
