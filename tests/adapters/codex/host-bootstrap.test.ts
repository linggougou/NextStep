import assert from "node:assert/strict";
import test from "node:test";

import { runHostBootstrap, type TrustedHostPort } from "../../../src/adapters/codex/host-bootstrap.ts";

function port(overrides: Partial<TrustedHostPort> = {}): TrustedHostPort {
  return {
    async inspect() {
      return {
        host_id: "codex-local",
        host_version: "0.144.1",
        permission_configuration_id: "perm-isolated-v1",
        main_conversation_project_access: "none",
        isolated_workspace: true,
        readonly_review: true,
        approval_events: true,
        blocking_events: true,
        atomic_create_or_return: true,
      };
    },
    async createProbeTask(input) {
      assert.deepEqual(Object.keys(input).sort(), ["effect_key", "payload_digest"]);
      assert.doesNotMatch(JSON.stringify(input), /project|worktree|\/Users|\/Volumes/);
      return { task_id: "host-task-1" };
    },
    async queryProbeTask(taskId) { return { task_id: taskId }; },
    async continueProbeTask(taskId) { return { task_id: taskId }; },
    async archiveProbeTask(taskId) { return { task_id: taskId, archived: true }; },
    ...overrides,
  };
}

test("host-bootstrap 仅经可信端口证明创建/查询/继续/归档、稳定 ID 与权限隔离", async () => {
  const evidence = await runHostBootstrap(port());
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.automatic_lifecycle, true);
  assert.match(evidence.stable_task_id_digest ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(evidence.blockers, []);
});

test("稳定 ID、主对话零项目权限或审批/阻塞回传不可证明时 blocked", async () => {
  for (const candidate of [
    port({ async queryProbeTask() { return { task_id: "different" }; } }),
    port({ async inspect() { return { ...(await port().inspect()), main_conversation_project_access: "present" }; } }),
    port({ async inspect() { return { ...(await port().inspect()), blocking_events: false }; } }),
  ]) {
    const evidence = await runHostBootstrap(candidate);
    assert.equal(evidence.status, "blocked");
    assert.equal(evidence.automatic_lifecycle, false);
  }
});

test("自动归档失败但独立身份仍可绑定时保留 probe 资格并降为非自动生命周期", async () => {
  const evidence = await runHostBootstrap(port({
    async archiveProbeTask(taskId) { return { task_id: taskId, archived: false }; },
  }));
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.automatic_lifecycle, false);
  assert.ok(evidence.blockers.includes("HOST_ARCHIVE_AUTOMATION_UNAVAILABLE"));
});

test("可信端口返回敏感字段或敏感值时安全阻塞且不回显", async () => {
  const secret = "ghp_123456789012345678901234";
  const evidence = await runHostBootstrap(port({
    async inspect() { return { ...(await port().inspect()), host_id: secret }; },
  }));
  assert.equal(evidence.status, "blocked");
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secret));
});
