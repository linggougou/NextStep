import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import type { CapabilityPreflightRequest, ProjectProbeEvidence } from "../../domain/capability-preflight.ts";
import { digestJson, type Sha256Digest } from "../../domain/content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "../../domain/sensitive-fields.ts";

export interface ProjectProbeOperationEvidence {
  readonly task_id: string;
  readonly content_identity: string;
  readonly envelope_roundtrip: boolean;
  readonly immutable_candidate: boolean;
  readonly readonly_validation: boolean;
  readonly acknowledgement_recovery: boolean;
  readonly final_snapshot: boolean;
  readonly external_evidence: boolean;
  readonly anchor: boolean;
  readonly expected_old_cas: boolean;
  readonly final_verification: boolean;
  readonly atomic_create_or_return: boolean;
}

export interface ProjectProbeOperationPort {
  run(effectKey: string, payloadDigest: string): Promise<ProjectProbeOperationEvidence>;
  recover(effectKey: string, payloadDigest: string): Promise<ProjectProbeOperationEvidence>;
  archive(taskId: string): Promise<boolean>;
}

export class ProjectProbeInterruptedError extends Error {
  constructor(message = "Project probe interrupted") {
    super(message);
    this.name = "ProjectProbeInterruptedError";
  }
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitStatus(root: string): string {
  return execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--ignored", "--untracked-files=all"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/\n$/, "");
}

function within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function safe(value: unknown): boolean {
  try {
    assertNoSensitiveFields(value);
    assertNoSensitiveContent(value);
    return true;
  } catch {
    return false;
  }
}

const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export function deriveNodeProjectProbeBinding(
  projectRoot: string,
  requestedProject: string,
): Pick<ProjectProbeEvidence, "repository_id" | "worktree_id" | "formal_oid" | "control_oid" | "start_oid"> {
  const canonicalRoot = realpathSync(projectRoot);
  const topLevel = realpathSync(git(canonicalRoot, "rev-parse", "--show-toplevel"));
  if (topLevel !== canonicalRoot || basename(canonicalRoot) !== requestedProject) {
    throw new TypeError("Project root identity is not exact");
  }
  const startOid = git(canonicalRoot, "rev-parse", "HEAD^{commit}");
  const rootOids = git(canonicalRoot, "rev-list", "--max-parents=0", "HEAD").split("\n").filter(Boolean).sort();
  const repositoryId = digestJson({ project_name: requestedProject, root_oids: rootOids });
  return Object.freeze({
    repository_id: repositoryId,
    worktree_id: digestJson({ repository_id: repositoryId, project_name: requestedProject, start_oid: startOid }),
    formal_oid: git(canonicalRoot, "rev-parse", "refs/nextstep/formal^{commit}"),
    control_oid: git(canonicalRoot, "rev-parse", "refs/nextstep/control^{commit}"),
    start_oid: startOid,
  });
}

function startState(status: string): ProjectProbeEvidence["start_state"] {
  const kinds = new Set<string>();
  for (const line of status.split("\n").filter(Boolean)) {
    if (line.startsWith("!!")) kinds.add("ignored");
    else if (line.startsWith("??")) kinds.add("untracked");
    else {
      if (line[0] !== " ") kinds.add("staged");
      if (line[1] !== " ") kinds.add("unstaged");
    }
  }
  if (kinds.size === 0) return "clean";
  return kinds.size === 1 ? [...kinds][0] as ProjectProbeEvidence["start_state"] : "mixed";
}

function evidence(
  request: CapabilityPreflightRequest,
  values: {
    readonly status: "passed" | "blocked";
    readonly actual?: ReturnType<typeof deriveNodeProjectProbeBinding>;
    readonly start_state: ProjectProbeEvidence["start_state"];
    readonly content_identity: Sha256Digest | null;
    readonly atomic_create_or_return: boolean;
    readonly automatic_archive: boolean;
    readonly checks: readonly string[];
    readonly blockers: readonly string[];
  },
): ProjectProbeEvidence {
  const actual = values.actual ?? {
    repository_id: request.expected_binding.repository_id,
    worktree_id: request.expected_binding.worktree_id,
    formal_oid: request.expected_binding.formal_oid,
    control_oid: request.expected_binding.control_oid,
    start_oid: request.probe.expected_start_oid,
  };
  const base = {
    status: values.status,
    ...actual,
    start_state: values.start_state,
    content_identity: values.content_identity,
    atomic_create_or_return: values.atomic_create_or_return,
    automatic_archive: values.automatic_archive,
    checks: Object.freeze([...new Set(values.checks)].sort()),
    blockers: Object.freeze([...new Set(values.blockers)].sort()),
  };
  return Object.freeze({ ...base, attestation_digest: digestJson(base) });
}

function boundaryBlockers(request: CapabilityPreflightRequest): { root: string | null; blockers: string[] } {
  const blockers: string[] = [];
  let root: string | null = null;
  try {
    const declaredStats = lstatSync(request.probe.explicit_project_root);
    if (declaredStats.isSymbolicLink()) blockers.push("PROJECT_SYMLINK_BLOCKED");
    if (!declaredStats.isDirectory()) blockers.push("PROJECT_NOT_DIRECTORY");
    if ((declaredStats.mode & 0o444) === 0 || (declaredStats.mode & 0o222) === 0) blockers.push("PROJECT_PERMISSION_BLOCKED");
    root = realpathSync(request.probe.explicit_project_root);
    const workspaceRoots = request.probe.workspace_roots.map((item) => realpathSync(item));
    const owners = workspaceRoots.filter((workspace) => within(workspace, root as string));
    if (owners.length !== 1) blockers.push("PROJECT_PATH_ESCAPE_OR_AMBIGUOUS");
    const candidates = workspaceRoots.flatMap((workspace) => {
      try {
        return readdirSync(workspace, { withFileTypes: true })
          .filter((entry) => entry.name === request.probe.requested_project && (entry.isDirectory() || entry.isSymbolicLink()))
          .map((entry) => resolve(workspace, entry.name));
      } catch {
        return [];
      }
    });
    if (candidates.length !== 1) blockers.push("SAME_NAME_PROJECT_AMBIGUOUS");
    const owner = owners[0];
    if (owner !== undefined) {
      for (let cursor = dirname(root); within(owner, cursor) && cursor !== owner; cursor = dirname(cursor)) {
        try {
          lstatSync(resolve(cursor, ".git"));
          blockers.push("NESTED_REPOSITORY_BLOCKED");
          break;
        } catch {
          // No ancestor Git marker at this level.
        }
      }
    }
    const evidenceStats = lstatSync(request.probe.external_evidence_root);
    const evidenceRoot = realpathSync(request.probe.external_evidence_root);
    if (!evidenceStats.isDirectory() || evidenceStats.isSymbolicLink() || within(root, evidenceRoot)) {
      blockers.push("EXTERNAL_EVIDENCE_BOUNDARY_BLOCKED");
    }
  } catch {
    blockers.push("PROJECT_ACCESS_BLOCKED");
  }
  return { root, blockers };
}

export async function runProjectProbe(
  request: CapabilityPreflightRequest,
  operations: ProjectProbeOperationPort,
): Promise<ProjectProbeEvidence> {
  const boundary = boundaryBlockers(request);
  let actual: ReturnType<typeof deriveNodeProjectProbeBinding> | undefined;
  let state: ProjectProbeEvidence["start_state"] = "mixed";
  let before: { formal: string; control: string; tree: string; status: string } | undefined;
  if (boundary.root !== null) {
    try {
      actual = deriveNodeProjectProbeBinding(boundary.root, request.probe.requested_project);
      const status = gitStatus(boundary.root);
      state = startState(status);
      before = {
        formal: actual.formal_oid,
        control: actual.control_oid,
        tree: git(boundary.root, "rev-parse", "HEAD^{tree}"),
        status,
      };
      if (state !== "clean") boundary.blockers.push("WORKTREE_START_NOT_CLEAN");
      if (actual.start_oid !== request.probe.expected_start_oid) boundary.blockers.push("WORKTREE_START_OID_DRIFT");
    } catch {
      boundary.blockers.push("PROJECT_GIT_IDENTITY_BLOCKED");
    }
  }
  if (boundary.blockers.length > 0 || boundary.root === null || actual === undefined || before === undefined) {
    return evidence(request, {
      status: "blocked", ...(actual === undefined ? {} : { actual }), start_state: state, content_identity: null,
      atomic_create_or_return: false, automatic_archive: false, checks: [], blockers: boundary.blockers,
    });
  }

  const effectKey = `project-probe-${digestJson({ binding: request.expected_binding, start_oid: request.probe.expected_start_oid }).slice(7)}`;
  const payloadDigest = digestJson({ effect_key: effectKey, requested_project: request.probe.requested_project });
  const blockers: string[] = [];
  const checks = ["exact-root", "clean-start", "formal-control-business-tree-immutable"];
  let primary: ProjectProbeOperationEvidence | null = null;
  let recovered: ProjectProbeOperationEvidence | null = null;
  try {
    try {
      primary = await operations.run(effectKey, payloadDigest);
    } catch (error) {
      if (!(error instanceof ProjectProbeInterruptedError)) throw error;
      checks.push("interruption-recovery");
    }
    recovered = await operations.recover(effectKey, payloadDigest);
    if (primary === null) primary = recovered;
    if (!safe(primary) || !safe(recovered)) throw new TypeError("Unsafe probe operation evidence");
    if (!SAFE_TASK_ID.test(primary.task_id) || !SHA256.test(primary.content_identity)) {
      blockers.push("PROBE_CONTENT_IDENTITY_INVALID");
    } else if (primary.task_id !== recovered.task_id || primary.content_identity !== recovered.content_identity) {
      blockers.push("PROBE_RECOVERY_IDENTITY_CONFLICT");
    } else {
      checks.push("same-content-recovery", "ack-loss-and-duplicate-recovery");
    }
    const required: ReadonlyArray<keyof ProjectProbeOperationEvidence> = [
      "envelope_roundtrip", "immutable_candidate", "readonly_validation", "acknowledgement_recovery",
      "final_snapshot", "external_evidence", "anchor", "expected_old_cas", "final_verification",
    ];
    for (const field of required) {
      if (primary[field] !== true) blockers.push(`${String(field).toUpperCase()}_UNPROVEN`);
      else checks.push(String(field).replaceAll("_", "-"));
    }
  } catch {
    blockers.push("PROJECT_OPERATION_EVIDENCE_BLOCKED");
  }

  let automaticArchive = false;
  if (primary !== null && blockers.length === 0) {
    try { automaticArchive = await operations.archive(primary.task_id); } catch { automaticArchive = false; }
    if (!automaticArchive) blockers.push("PROBE_ARCHIVE_AUTOMATION_UNAVAILABLE");
    else checks.push("archive");
  }
  try {
    const after = {
      formal: git(boundary.root, "rev-parse", "refs/nextstep/formal^{commit}"),
      control: git(boundary.root, "rev-parse", "refs/nextstep/control^{commit}"),
      tree: git(boundary.root, "rev-parse", "HEAD^{tree}"),
      status: gitStatus(boundary.root),
    };
    if (JSON.stringify(before) !== JSON.stringify(after)) blockers.push("PROJECT_STATE_MUTATED");
  } catch {
    blockers.push("PROJECT_FINAL_REVERIFY_BLOCKED");
  }

  const manualOnly = new Set(["PROBE_ARCHIVE_AUTOMATION_UNAVAILABLE"]);
  const hardBlockers = blockers.filter((item) => !manualOnly.has(item));
  const status = hardBlockers.length === 0 && primary !== null ? "passed" as const : "blocked" as const;
  const acceptedPrimary = status === "passed" ? primary : null;
  return evidence(request, {
    status,
    actual,
    start_state: state,
    content_identity: acceptedPrimary === null ? null : acceptedPrimary.content_identity as Sha256Digest,
    atomic_create_or_return: acceptedPrimary?.atomic_create_or_return === true,
    automatic_archive: status === "passed" && automaticArchive,
    checks,
    blockers,
  });
}
