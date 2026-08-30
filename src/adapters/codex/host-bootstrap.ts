import type { HostBootstrapEvidence } from "../../domain/capability-preflight.ts";
import { digestJson } from "../../domain/content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "../../domain/sensitive-fields.ts";

export interface TrustedHostPort {
  inspect(): Promise<{
    readonly host_id: string;
    readonly host_version: string;
    readonly permission_configuration_id: string;
    readonly main_conversation_project_access: "none" | "present";
    readonly isolated_workspace: boolean;
    readonly readonly_review: boolean;
    readonly approval_events: boolean;
    readonly blocking_events: boolean;
    readonly atomic_create_or_return: boolean;
  }>;
  createProbeTask(input: { readonly effect_key: string; readonly payload_digest: string }): Promise<{ readonly task_id: string }>;
  queryProbeTask(taskId: string): Promise<{ readonly task_id: string }>;
  continueProbeTask(taskId: string): Promise<{ readonly task_id: string }>;
  archiveProbeTask(taskId: string): Promise<{ readonly task_id: string; readonly archived: boolean }>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

function blockedEvidence(blockers: readonly string[]): HostBootstrapEvidence {
  const base = {
    status: "blocked" as const,
    host_id: "unverified-host",
    host_version: "unverified-version",
    permission_configuration_id: "unverified-permissions",
    stable_task_id_digest: null,
    automatic_lifecycle: false,
    checks: Object.freeze([]) as readonly string[],
    blockers: Object.freeze([...new Set(blockers)].sort()),
  };
  return Object.freeze({ ...base, attestation_digest: digestJson(base) });
}

function safeRuntimeValue(value: unknown): boolean {
  try {
    assertNoSensitiveFields(value);
    assertNoSensitiveContent(value);
    return true;
  } catch {
    return false;
  }
}

export async function runHostBootstrap(port: TrustedHostPort): Promise<HostBootstrapEvidence> {
  try {
    const identity = await port.inspect();
    if (!safeRuntimeValue(identity) ||
      !SAFE_ID.test(identity.host_id) ||
      !SAFE_ID.test(identity.host_version) ||
      !SAFE_ID.test(identity.permission_configuration_id)) {
      return blockedEvidence(["HOST_IDENTITY_INVALID"]);
    }

    const blockers: string[] = [];
    const checks: string[] = ["host-identity"];
    if (identity.main_conversation_project_access !== "none") blockers.push("MAIN_CONVERSATION_PROJECT_ACCESS_PRESENT");
    else checks.push("main-conversation-zero-project-access");
    if (!identity.isolated_workspace) blockers.push("ISOLATED_WORKSPACE_UNPROVEN");
    else checks.push("isolated-workspace");
    if (!identity.readonly_review) blockers.push("READONLY_REVIEW_UNPROVEN");
    else checks.push("readonly-review");
    if (!identity.approval_events || !identity.blocking_events) blockers.push("APPROVAL_BLOCKING_RETURN_UNPROVEN");
    else checks.push("approval-and-blocking-events");

    const effectKey = `host-bootstrap-${digestJson({ schema_version: "1.0", host_id: identity.host_id }).slice(7)}`;
    const payloadDigest = digestJson({ effect_key: effectKey, operation: "lifecycle-probe" });
    let stableTaskId: string | null = null;
    let archived = false;
    try {
      const created = await port.createProbeTask({ effect_key: effectKey, payload_digest: payloadDigest });
      const queried = await port.queryProbeTask(created.task_id);
      const continued = await port.continueProbeTask(created.task_id);
      if (!safeRuntimeValue({ created, queried, continued }) || !SAFE_ID.test(created.task_id)) {
        blockers.push("HOST_TASK_ID_INVALID");
      } else if (queried.task_id !== created.task_id || continued.task_id !== created.task_id) {
        blockers.push("HOST_STABLE_ID_UNPROVEN");
      } else {
        stableTaskId = created.task_id;
        checks.push("stable-task-id", "create-query-continue");
        try {
          const archive = await port.archiveProbeTask(created.task_id);
          archived = safeRuntimeValue(archive) && archive.task_id === created.task_id && archive.archived;
        } catch {
          archived = false;
        }
      }
    } catch {
      blockers.push("HOST_TASK_LIFECYCLE_UNPROVEN");
    }

    if (!identity.atomic_create_or_return) blockers.push("HOST_ATOMIC_CREATE_OR_RETURN_UNAVAILABLE");
    else checks.push("atomic-create-or-return");
    if (!archived) blockers.push("HOST_ARCHIVE_AUTOMATION_UNAVAILABLE");
    else checks.push("archive");

    const manualOnly = new Set(["HOST_ATOMIC_CREATE_OR_RETURN_UNAVAILABLE", "HOST_ARCHIVE_AUTOMATION_UNAVAILABLE"]);
    const hardBlockers = blockers.filter((blocker) => !manualOnly.has(blocker));
    const status = hardBlockers.length === 0 && stableTaskId !== null ? "passed" as const : "blocked" as const;
    const base = {
      status,
      host_id: identity.host_id,
      host_version: identity.host_version,
      permission_configuration_id: identity.permission_configuration_id,
      stable_task_id_digest: stableTaskId === null ? null : digestJson({ host_id: identity.host_id, task_id: stableTaskId }),
      automatic_lifecycle: status === "passed" && identity.atomic_create_or_return && archived,
      checks: Object.freeze([...new Set(checks)].sort()),
      blockers: Object.freeze([...new Set(blockers)].sort()),
    };
    return Object.freeze({ ...base, attestation_digest: digestJson(base) });
  } catch {
    return blockedEvidence(["HOST_BOOTSTRAP_FAILED"]);
  }
}
