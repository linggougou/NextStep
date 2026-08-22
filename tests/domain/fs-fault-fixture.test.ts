import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  assertNoSensitiveContent,
  assertNoSensitiveFields,
} from "../../src/domain/sensitive-fields.ts";
import {
  resolveProjectContext,
  type ProjectRootProbe,
} from "../../src/domain/project-context.ts";
import {
  FaultNotActiveError,
  InjectedWriteFailureError,
  listWriteConsistencyScenarioNames,
  loadWriteConsistencyScenario,
  materializeWriteConsistencyScenario,
  validateWriteConsistencyScenario,
  WriteFixtureError,
  type FaultSetupReport,
  type WriteConsistencyScenario,
  type WriteExecutionReport,
} from "../support/fs-fault-fixture.ts";

const execFile = promisify(execFileCallback);

const FIXTURE_DIRECTORY = resolve(process.cwd(), "tests/fixtures/write-consistency");

/** S1.4 已冻结的 kernel 操作者三重身份（self-profile-headless 同源）。 */
const KERNEL_OPERATOR_IDENTITY = {
  repository_id: "sha256:d11253328d36050bd559844c64b438e9b84e0c13125184e9b01e1e7cf23a8c56",
  product_definition_id: "pd-7913f81f17e361f716c1377f2eaf6c9e623da2e32acaf27b81ed25f04acece06",
  product_definition_digest: "sha256:096428a49069502de8273c5c470516b0493777352c135bc02fa3b6d1365f7164",
  carrier_decision_digest: "sha256:2a58288964d79789f192ec7657bb1dfb78588fd9c98e133aab9d31badcec691f",
  acceptance_profile_id: "ap-66c5db777c4a2a28ffb9ea933366f94dc5f1dc1cf8b48716953ab4be490cdc28",
} as const;

/** S1.1–S1.4 已冻结的三类目标项目身份映射。 */
const TARGET_PROJECT_IDENTITIES: Record<string, {
  readonly repository_id: string;
  readonly formal_baseline: string;
  readonly product_definition_id: string;
  readonly product_definition_digest: string;
  readonly carrier_decision_digest: string;
  readonly acceptance_profile_id: string;
}> = {
  "community-workshop": {
    repository_id: `sha256:${"2".repeat(64)}`,
    formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454",
    product_definition_id: "pd-01e7fcb155531b2d26bad2c4ccd816235b8140cada8a740dcf26325458acddf0",
    product_definition_digest: "sha256:beb239eb765ea06cbcd2e72f77df43abb8627f7aae85e1ced31f64ac0d005c00",
    carrier_decision_digest: "sha256:cd10e72a6b703bba1dafd17ff10b033e7e27ecbec91bd48bf7dbdd62c68ae84e",
    acceptance_profile_id: "ap-73ec182f254ff8bbb5eed556c3bb46348ffefdba34dbc7045b2bfbbb9c0aa1b3",
  },
  "expense-reminder": {
    repository_id: `sha256:${"3".repeat(64)}`,
    formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454",
    product_definition_id: "pd-365ef97ff58d06dedf780c5887445fc70c196dfa356be76d4f6fd93b31a95271",
    product_definition_digest: "sha256:6a89b9e56d4093a7b032feed62e62d787be6880d7063352fc28674e37d7b550a",
    carrier_decision_digest: "sha256:de1db579b3d1313b95e51cd5317054435dac93939cf3f59936566b8b005270a1",
    acceptance_profile_id: "ap-b0cd146496b0f85778c7aa84d7c48c9d65f528b9f3df4df30b583acb8008d03c",
  },
  "project-delivery-tool": {
    repository_id: `sha256:${"1".repeat(64)}`,
    formal_baseline: "8ffaf658e112a5ba26a9f83882f5f71f1ae79454",
    product_definition_id: "pd-7913f81f17e361f716c1377f2eaf6c9e623da2e32acaf27b81ed25f04acece06",
    product_definition_digest: "sha256:096428a49069502de8273c5c470516b0493777352c135bc02fa3b6d1365f7164",
    carrier_decision_digest: "sha256:2a58288964d79789f192ec7657bb1dfb78588fd9c98e133aab9d31badcec691f",
    acceptance_profile_id: "ap-e7a916bff67651af419f28438665e97a6312a701c4251903855c83c719aed73b",
  },
};

const POSITIVE_SCENARIO_NAMES = [
  "positive/community-workshop-write.json",
  "positive/expense-reminder-write.json",
  "positive/project-delivery-tool-write.json",
] as const;

const S1_5_ROUTE_LOCK_SCENARIO_NAMES = [
  ...POSITIVE_SCENARIO_NAMES,
  "fault/baseline-drift-conflict.json",
  "fault/mid-write-failure-partial.json",
  "fault/readonly-directory-blocked.json",
  "fault/symlink-escape-blocked.json",
  "fault/unsafe-rollback-blocked.json",
  "fault/unwritable-file-blocked.json",
] as const;

interface PositiveRouteLockFixture {
  readonly baseline: {
    readonly files: readonly { readonly path: string; readonly content: string }[];
  };
  readonly target_project: { readonly project_id: string };
}

function routeLockProjectProbe(root: string, routeLock: string): ProjectRootProbe {
  const routeLockPath = `${root}/PROJECT_ROUTE_LOCK.md`;
  return {
    exists: (path) => path === root || path === routeLockPath,
    isDirectory: (path) => path === root,
    isSymbolicLink: () => false,
    isReadable: (path) => path === root || path === routeLockPath,
    isWritable: (path) => path === root || path === routeLockPath,
    realpath: (path) => path,
    readFileUtf8: (path) => {
      if (path !== routeLockPath) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return routeLock;
    },
  };
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

async function loadAllScenarios(): Promise<ReadonlyMap<string, WriteConsistencyScenario>> {
  const names = await listWriteConsistencyScenarioNames();
  const scenarios = new Map<string, WriteConsistencyScenario>();
  for (const name of names) {
    scenarios.set(name, await loadWriteConsistencyScenario(name));
  }
  return scenarios;
}

test("listWriteConsistencyScenarioNames 覆盖三类正例、六类故障与四类布局场景", async () => {
  const names = await listWriteConsistencyScenarioNames();
  const nameSet = new Set(names);

  assert.equal(names.length, nameSet.size, "场景文件名不得重复");
  for (const positive of POSITIVE_SCENARIO_NAMES) {
    assert.ok(nameSet.has(positive), `缺少正例场景 ${positive}`);
  }
  for (const fault of [
    "fault/readonly-directory-blocked.json",
    "fault/unwritable-file-blocked.json",
    "fault/mid-write-failure-partial.json",
    "fault/baseline-drift-conflict.json",
    "fault/symlink-escape-blocked.json",
    "fault/unsafe-rollback-blocked.json",
  ]) {
    assert.ok(nameSet.has(fault), `缺少故障场景 ${fault}`);
  }
  for (const layout of [
    "layout/nested-project-root.json",
    "layout/same-name-projects.json",
    "layout/symlink-project-root.json",
    "layout/missing-route-lock.json",
  ]) {
    assert.ok(nameSet.has(layout), `缺少布局场景 ${layout}`);
  }
  for (const name of names) {
    assert.match(name, /^(positive|fault|layout)\/[a-z0-9-]+\.json$/);
  }
});

test("全部 write-consistency fixture 通过严格校验且不含敏感字段或敏感内容", async () => {
  const scenarios = await loadAllScenarios();
  assert.ok(scenarios.size >= 13, "场景数量不得低于 13");

  const scenarioIds = new Set<string>();
  for (const [name, scenario] of scenarios) {
    assertNoSensitiveFields(scenario);
    assertNoSensitiveContent(scenario);
    assert.equal(scenario.schema_version, "1.0", `${name} schema_version 必须为 1.0`);
    assert.equal(scenario.record_type, "write-consistency-scenario", `${name} record_type 错误`);
    assert.equal(scenario.evidence_scope, "manual-isolated consumer contract", `${name} evidence_scope 必须沿用既有口径`);
    assert.ok(scenario.scenario_id.length > 0, `${name} scenario_id 不得为空`);
    assert.ok(!scenarioIds.has(scenario.scenario_id), `${name} scenario_id 重复`);
    scenarioIds.add(scenario.scenario_id);
  }

  const indexRaw = JSON.parse(await readFile(join(FIXTURE_DIRECTORY, "index.json"), "utf8")) as {
    readonly scenarios: readonly { readonly name: string; readonly scenario_id: string; readonly record_digest: string }[];
  };
  assertNoSensitiveFields(indexRaw);
  assertNoSensitiveContent(indexRaw);
  assert.equal(indexRaw.scenarios.length, scenarios.size, "index.json 必须覆盖全部场景");
});

test("fixture 身份延续 S1.4 kernel 三重身份与三类目标项目冻结映射", async () => {
  const scenarios = await loadAllScenarios();

  const positiveProjects = new Set<string>();
  for (const [name, scenario] of scenarios) {
    assert.deepEqual(
      scenario.operator_identity,
      KERNEL_OPERATOR_IDENTITY,
      `${name} 操作者身份必须延续 S1.4 kernel 三重身份`,
    );

    const expectedTarget = TARGET_PROJECT_IDENTITIES[scenario.target_project.project_id];
    assert.ok(expectedTarget, `${name} 目标项目必须是三类冻结项目之一`);
    assert.deepEqual(
      scenario.target_project,
      { project_id: scenario.target_project.project_id, ...expectedTarget },
      `${name} 目标项目身份与冻结映射不一致`,
    );

    if (name.startsWith("positive/")) {
      positiveProjects.add(scenario.target_project.project_id);
    }
  }

  assert.deepEqual(
    [...positiveProjects].sort(),
    ["community-workshop", "expense-reminder", "project-delivery-tool"],
    "三类正例必须恰好覆盖三类目标项目",
  );
});

test("fixture 期望语义与故障/布局类型一一对应且回执码仅使用冻结集合", async () => {
  const scenarios = await loadAllScenarios();

  for (const [name, scenario] of scenarios) {
    const { expected, fault, layout } = scenario;
    assert.ok(
      ["accepted", "WRITE_CONFLICT_REJECTED", "WRITE_PARTIAL_BLOCKED", "WRITE_ACCESS_BLOCKED", "resolution-blocked"].includes(expected.outcome),
      `${name} outcome 超出冻结集合`,
    );

    if (name.startsWith("positive/")) {
      assert.equal(fault, null, `${name} 正例不得包含故障`);
      assert.equal(layout, null, `${name} 正例不得包含布局变体`);
      assert.equal(expected.outcome, "accepted");
      assert.equal(expected.rollback, "none");
      assert.ok(scenario.candidate_change.writes.length >= 2, `${name} 正例至少包含两个写入目标`);
    } else if (name.startsWith("fault/")) {
      assert.ok(fault, `${name} 故障场景必须声明 fault`);
      assert.equal(layout, null, `${name} 故障场景不得叠加布局变体`);
      const outcomeByKind: Record<string, string> = {
        "readonly-directory": "WRITE_ACCESS_BLOCKED",
        "unwritable-file": "WRITE_ACCESS_BLOCKED",
        "symlink-escape": "WRITE_ACCESS_BLOCKED",
        "mid-write-failure": "WRITE_PARTIAL_BLOCKED",
        "unsafe-rollback": "WRITE_PARTIAL_BLOCKED",
        "baseline-drift": "WRITE_CONFLICT_REJECTED",
      };
      assert.equal(expected.outcome, outcomeByKind[fault.kind], `${name} 期望回执与故障类型不匹配`);
    } else {
      assert.ok(layout, `${name} 布局场景必须声明 layout`);
      assert.equal(fault, null, `${name} 布局场景不得叠加故障`);
      assert.equal(expected.outcome, "resolution-blocked");
    }
  }
});

test("index.json 以 RFC8785 摘要冻结每个场景记录", async () => {
  const names = await listWriteConsistencyScenarioNames();
  const indexRaw = JSON.parse(await readFile(join(FIXTURE_DIRECTORY, "index.json"), "utf8")) as {
    readonly schema_version: string;
    readonly record_type: string;
    readonly digest_contract: { readonly algorithm: string; readonly canonicalization: string };
    readonly scenarios: readonly { readonly name: string; readonly scenario_id: string; readonly record_digest: string }[];
  };

  assert.equal(indexRaw.schema_version, "1.0");
  assert.equal(indexRaw.record_type, "write-consistency-index");
  assert.equal(indexRaw.digest_contract.algorithm, "sha256");
  assert.equal(indexRaw.digest_contract.canonicalization, "RFC8785");
  assert.equal(indexRaw.scenarios.length, names.length);

  const indexedNames = new Set<string>();
  for (const entry of indexRaw.scenarios) {
    assert.ok(names.includes(entry.name), `index.json 引用了不存在的场景 ${entry.name}`);
    assert.ok(!indexedNames.has(entry.name), `index.json 重复登记 ${entry.name}`);
    indexedNames.add(entry.name);

    const raw = JSON.parse(await readFile(join(FIXTURE_DIRECTORY, entry.name), "utf8")) as unknown;
    const scenario = validateWriteConsistencyScenario(raw);
    assert.equal(scenario.scenario_id, entry.scenario_id, `${entry.name} scenario_id 与 index 不一致`);
    assert.equal(digestJson(raw), entry.record_digest, `${entry.name} 记录摘要与 index 冻结值不一致`);
  }
});

test("正例与故障 fixture 的路线锁原文可直接解析为 S1.5，不依赖 synthetic 替换", async (t) => {
  for (const name of S1_5_ROUTE_LOCK_SCENARIO_NAMES) {
    await t.test(name, async () => {
      const fixture = JSON.parse(await readFile(
        join(FIXTURE_DIRECTORY, name),
        "utf8",
      )) as PositiveRouteLockFixture;
      const routeLock = fixture.baseline.files.find((entry) => entry.path === "PROJECT_ROUTE_LOCK.md");
      assert.ok(routeLock, `${name} 必须包含 PROJECT_ROUTE_LOCK.md`);

      const root = `/fixtures/${fixture.target_project.project_id}`;
      const context = resolveProjectContext({
        workspace_roots: [root],
        requested_project: fixture.target_project.project_id,
        explicit_canonical_root: root,
      }, routeLockProjectProbe(root, routeLock.content));

      assert.deepEqual(context.stage, {
        lifecycle_stage: "S5 / P5",
        stage_name: "V1 / M1.2 / S1.5",
        milestone_number: "M1.2",
        stage_source: "PROJECT_ROUTE_LOCK.md",
      });
    });
  }
});

test("三类正例场景物化出确定性基线且重复物化重放恒等", async () => {
  for (const name of POSITIVE_SCENARIO_NAMES) {
    const scenario = await loadWriteConsistencyScenario(name);
    const first = await materializeWriteConsistencyScenario(scenario);

    try {
      const second = await materializeWriteConsistencyScenario(scenario);
      try {
        assert.equal(second.baselineCommit, first.baselineCommit, `${name} 基线提交 OID 重放不恒等`);
        assert.equal(second.baselineTreeOid, first.baselineTreeOid, `${name} 基线 tree OID 重放不恒等`);
        assert.equal(second.baselineManifestDigest, first.baselineManifestDigest, `${name} 基线 manifest 摘要重放不恒等`);

        const manifest = await first.computeManifest();
        const expectedPaths = scenario.baseline.files.map((file) => file.path).sort();
        assert.deepEqual(manifest.map((entry) => entry.path).sort(), expectedPaths, `${name} 物化文件集与 baseline 不一致`);
        for (const file of scenario.baseline.files) {
          const entry = manifest.find((candidate) => candidate.path === file.path);
          assert.ok(entry, `${name} 缺少 ${file.path}`);
          assert.equal(entry.type, "file");
          assert.equal(entry.digest, `sha256:${sha256Hex(file.content)}`, `${name} ${file.path} 内容摘要不一致`);
        }

        const { stdout: status } = await execFile("git", ["-C", first.projectRoot, "status", "--porcelain"]);
        assert.equal(status, "", `${name} 基线工作树必须干净`);
        const { stdout: branch } = await execFile("git", ["-C", first.projectRoot, "branch", "--show-current"]);
        assert.equal(branch.trim(), scenario.baseline.branch, `${name} 基线分支名错误`);
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  }
});

test("正例候选写入全量落盘并可在 fixture 内提交为一致性证据", async () => {
  const scenario = await loadWriteConsistencyScenario("positive/community-workshop-write.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    const report = await fixture.executeCandidateWrites();
    assert.equal(report.faultTriggered, false);
    assert.equal(report.targets.length, scenario.candidate_change.writes.length);
    for (const target of report.targets) {
      assert.equal(target.state, "written-full", `目标 ${target.path} 未完整写入`);
      const expectedContent = scenario.candidate_change.writes.find((write) => write.path === target.path);
      assert.ok(expectedContent);
      assert.equal(target.digest, `sha256:${sha256Hex(expectedContent.content)}`);
      const onDisk = await readFile(join(fixture.projectRoot, target.path), "utf8");
      assert.equal(onDisk, expectedContent.content);
    }

    const commitOid = await fixture.commitAfterWrites("S1.5 fixture: 写入一致性正例证据");
    assert.match(commitOid, /^[a-f0-9]{40}$/);
    const { stdout: status } = await execFile("git", ["-C", fixture.projectRoot, "status", "--porcelain"]);
    assert.equal(status, "", "写入提交后工作树必须干净");
    const { stdout: head } = await execFile("git", ["-C", fixture.projectRoot, "rev-parse", "HEAD"]);
    assert.equal(head.trim(), commitOid);
    assert.notEqual(commitOid, fixture.baselineCommit, "写入提交不得复用基线提交");

    const { stdout: parent } = await execFile("git", ["-C", fixture.projectRoot, "rev-parse", "HEAD^"]);
    assert.equal(parent.trim(), fixture.baselineCommit, "写入提交的唯一父提交必须是基线提交");
  } finally {
    await fixture.cleanup();
  }
});

test("只读目录故障注入自证真实发生，否则 fail closed", async (t) => {
  const scenario = await loadWriteConsistencyScenario("fault/readonly-directory-blocked.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    let setup: FaultSetupReport;
    try {
      setup = await fixture.applyFaultSetup();
    } catch (error) {
      assert.ok(error instanceof FaultNotActiveError, "故障不可注入时只允许 FaultNotActiveError（fail closed）");
      t.diagnostic("当前环境无法可靠注入只读目录故障（如以 root 运行）；harness 已 fail closed，未产生假绿");
      return;
    }

    assert.equal(setup.verified, true);
    assert.ok(setup.probes.length > 0, "必须记录自证探针");
    const targetPath = scenario.fault?.target_path;
    assert.ok(targetPath, "故障场景必须声明 target_path");
    await assert.rejects(
      writeFile(join(fixture.projectRoot, targetPath), "probe"),
      (error: NodeJS.ErrnoException) => ["EACCES", "EPERM", "EROFS"].includes(error.code ?? ""),
      "verified=true 时写入必须被操作系统拒绝",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("不可写文件故障注入自证真实发生，否则 fail closed", async (t) => {
  const scenario = await loadWriteConsistencyScenario("fault/unwritable-file-blocked.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    let setup: FaultSetupReport;
    try {
      setup = await fixture.applyFaultSetup();
    } catch (error) {
      assert.ok(error instanceof FaultNotActiveError, "故障不可注入时只允许 FaultNotActiveError（fail closed）");
      t.diagnostic("当前环境无法可靠注入不可写文件故障；harness 已 fail closed，未产生假绿");
      return;
    }

    assert.equal(setup.verified, true);
    const targetPath = scenario.fault?.target_path;
    assert.ok(targetPath);
    await assert.rejects(
      writeFile(join(fixture.projectRoot, targetPath), "probe"),
      (error: NodeJS.ErrnoException) => ["EACCES", "EPERM", "EROFS"].includes(error.code ?? ""),
      "verified=true 时覆盖写必须被操作系统拒绝",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("写中故障在磁盘留下可证明的部分写入状态且归属可安全回退", async () => {
  const scenario = await loadWriteConsistencyScenario("fault/mid-write-failure-partial.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    const faultSpec = scenario.fault;
    assert.ok(faultSpec);
    assert.equal(faultSpec.kind, "mid-write-failure");
    const atTargetIndex = faultSpec.fault_at_target_index;
    const afterBytes = faultSpec.fault_after_bytes;
    assert.ok(typeof atTargetIndex === "number", "故障场景必须声明 fault_at_target_index");
    assert.ok(typeof afterBytes === "number", "故障场景必须声明 fault_after_bytes");
    const fault = { atTargetIndex, afterBytes };

    let report: WriteExecutionReport;
    try {
      await fixture.executeCandidateWrites({ fault });
      assert.fail("写中故障必须触发 InjectedWriteFailureError");
    } catch (error) {
      assert.ok(error instanceof InjectedWriteFailureError, "写中故障必须以类型化错误携带自检报告");
      report = error.report;
    }

    assert.equal(report.faultTriggered, true);
    const writes = scenario.candidate_change.writes;
    assert.equal(report.targets.length, writes.length);

    for (const [index, target] of report.targets.entries()) {
      const write = writes[index];
      assert.ok(write);
      assert.equal(target.path, write.path);
      if (index < fault.atTargetIndex) {
        assert.equal(target.state, "written-full", `${write.path} 应完整写入`);
        assert.equal(target.digest, `sha256:${sha256Hex(write.content)}`);
        assert.ok(scenario.expected.written_paths.includes(write.path));
      } else if (index === fault.atTargetIndex) {
        const expectedBytes = Buffer.from(write.content, "utf8").subarray(0, fault.afterBytes);
        assert.equal(target.state, "written-partial", `${write.path} 应部分写入`);
        assert.equal(target.bytesOnDisk, expectedBytes.length, "部分写入字节数必须与注入点一致");
        const onDisk = await readFile(join(fixture.projectRoot, write.path));
        assert.deepEqual(onDisk, expectedBytes, "部分写入内容必须是确定性前缀");
        assert.ok(scenario.expected.written_paths.includes(write.path));
      } else {
        assert.equal(target.state, "untouched", `${write.path} 不得被触碰`);
        assert.equal(target.digest, target.existedBefore ? target.beforeDigest : null);
        assert.ok(scenario.expected.unwritten_paths.includes(write.path));
      }
    }

    const safety = await fixture.classifyRollbackSafety(report);
    assert.deepEqual(safety, { safe: true, reasons: [] }, "无外部漂移的部分写入必须可安全回退");

    const { restoredManifestDigest } = await fixture.rollbackOwnedWrites(report);
    assert.equal(restoredManifestDigest, fixture.baselineManifestDigest, "归属回退后必须恢复基线 manifest");
    const { stdout: status } = await execFile("git", ["-C", fixture.projectRoot, "status", "--porcelain"]);
    assert.equal(status, "", "回退后工作树必须与基线提交一致");
  } finally {
    await fixture.cleanup();
  }
});

test("基线漂移可被 manifest 摘要与 Git 状态双重检测", async () => {
  const scenario = await loadWriteConsistencyScenario("fault/baseline-drift-conflict.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    const faultSpec = scenario.fault;
    assert.ok(faultSpec);
    assert.equal(faultSpec.kind, "baseline-drift");
    assert.ok(faultSpec.target_path);
    assert.ok(faultSpec.drift_content);

    const setup = await fixture.applyFaultSetup();
    assert.equal(setup.verified, true);

    const driftedContent = await readFile(join(fixture.projectRoot, faultSpec.target_path), "utf8");
    assert.equal(driftedContent, faultSpec.drift_content, "漂移内容必须真实落盘");

    const currentDigest = await fixture.manifestDigest();
    assert.notEqual(currentDigest, fixture.baselineManifestDigest, "漂移后 manifest 摘要必须变化");

    const { stdout: status } = await execFile("git", ["-C", fixture.projectRoot, "status", "--porcelain"]);
    assert.notEqual(status, "", "漂移后 Git 工作树必须非干净");
    assert.equal(scenario.expected.outcome, "WRITE_CONFLICT_REJECTED");
  } finally {
    await fixture.cleanup();
  }
});

test("符号链接逃逸被根边界解析检测为越界", async () => {
  const scenario = await loadWriteConsistencyScenario("fault/symlink-escape-blocked.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    const faultSpec = scenario.fault;
    assert.ok(faultSpec);
    assert.equal(faultSpec.kind, "symlink-escape");
    assert.ok(faultSpec.target_path);
    assert.ok(faultSpec.outside_file);

    const setup = await fixture.applyFaultSetup();
    assert.equal(setup.verified, true);

    const linkStat = await lstat(join(fixture.projectRoot, faultSpec.target_path));
    assert.ok(linkStat.isSymbolicLink(), "逃逸目标必须是符号链接");

    const resolution = await fixture.resolveWithinRoot(faultSpec.target_path);
    assert.equal(resolution.escaped, true, "符号链接逃逸必须被判定为越界");
    assert.equal(resolution.reason, "symlink-escape");
    const outsideReal = await realpath(join(fixture.outsideArea, faultSpec.outside_file.path));
    assert.equal(resolution.resolvedPath, outsideReal, "解析结果必须指向项目外真实文件");

    const outsideContent = await readFile(resolution.resolvedPath, "utf8");
    assert.equal(outsideContent, faultSpec.outside_file.content, "项目外文件内容必须确定性存在");
    assert.equal(scenario.expected.outcome, "WRITE_ACCESS_BLOCKED");
  } finally {
    await fixture.cleanup();
  }
});

test("不可安全回滚场景被归属分类阻塞且拒绝破坏性回退", async () => {
  const scenario = await loadWriteConsistencyScenario("fault/unsafe-rollback-blocked.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    const faultSpec = scenario.fault;
    assert.ok(faultSpec);
    assert.equal(faultSpec.kind, "unsafe-rollback");
    assert.ok(faultSpec.target_path);
    assert.ok(faultSpec.drift_content);
    assert.equal(typeof faultSpec.fault_at_target_index, "number");
    assert.equal(typeof faultSpec.fault_after_bytes, "number");
    assert.ok(
      !scenario.candidate_change.writes.some((write) => write.path === faultSpec.target_path),
      "外部漂移文件必须不在写入目标内",
    );

    const setup = await fixture.applyFaultSetup();
    assert.equal(setup.verified, true);

    let report: WriteExecutionReport;
    try {
      await fixture.executeCandidateWrites({
        fault: {
          atTargetIndex: faultSpec.fault_at_target_index as number,
          afterBytes: faultSpec.fault_after_bytes as number,
        },
      });
      assert.fail("写中故障必须触发");
    } catch (error) {
      assert.ok(error instanceof InjectedWriteFailureError);
      report = error.report;
    }

    const safety = await fixture.classifyRollbackSafety(report);
    assert.equal(safety.safe, false, "归属外漂移必须判定为不可安全回退");
    assert.ok(safety.reasons.length > 0, "必须给出不可安全回退的原因");

    await assert.rejects(
      fixture.rollbackOwnedWrites(report),
      WriteFixtureError,
      "不可安全回退时必须拒绝回退（禁止破坏性 Git/文件操作）",
    );

    const drifted = await readFile(join(fixture.projectRoot, faultSpec.target_path), "utf8");
    assert.equal(drifted, faultSpec.drift_content, "被拒绝的回退不得触碰归属外文件");
    assert.equal(scenario.expected.rollback, "unsafe-rollback-block");
  } finally {
    await fixture.cleanup();
  }
});

test("布局场景物化嵌套、同名、符号链接根与缺失路线锁结构", async () => {
  const nested = await materializeWriteConsistencyScenario(
    await loadWriteConsistencyScenario("layout/nested-project-root.json"),
  );
  try {
    const nestedRoot = nested.auxiliaryRoots.find((root) => root.name === "nested");
    assert.ok(nestedRoot, "嵌套场景必须提供 nested 辅助根");
    assert.ok(nestedRoot.path.startsWith(nested.projectRoot), "嵌套根必须位于主根内部");
    await access(join(nested.projectRoot, "PROJECT_ROUTE_LOCK.md"));
    await access(join(nestedRoot.path, "PROJECT_ROUTE_LOCK.md"));
    assert.equal(await nested.hasRouteLock(), true);
  } finally {
    await nested.cleanup();
  }

  const sameName = await materializeWriteConsistencyScenario(
    await loadWriteConsistencyScenario("layout/same-name-projects.json"),
  );
  try {
    const mirror = sameName.auxiliaryRoots.find((root) => root.name === "mirror");
    assert.ok(mirror, "同名场景必须提供 mirror 辅助根");
    const primaryLock = await readFile(join(sameName.projectRoot, "PROJECT_ROUTE_LOCK.md"), "utf8");
    const mirrorLock = await readFile(join(mirror.path, "PROJECT_ROUTE_LOCK.md"), "utf8");
    assert.equal(primaryLock, mirrorLock, "同名项目的路线锁内容必须一致以构成歧义");
  } finally {
    await sameName.cleanup();
  }

  const symlinkRoot = await materializeWriteConsistencyScenario(
    await loadWriteConsistencyScenario("layout/symlink-project-root.json"),
  );
  try {
    const alias = symlinkRoot.auxiliaryRoots.find((root) => root.name === "alias");
    assert.ok(alias, "符号链接根场景必须提供 alias 辅助根");
    const aliasStat = await lstat(alias.path);
    assert.ok(aliasStat.isSymbolicLink(), "alias 必须是符号链接");
    assert.equal(await realpath(alias.path), await realpath(symlinkRoot.projectRoot));
  } finally {
    await symlinkRoot.cleanup();
  }

  const missingLock = await materializeWriteConsistencyScenario(
    await loadWriteConsistencyScenario("layout/missing-route-lock.json"),
  );
  try {
    assert.equal(await missingLock.hasRouteLock(), false, "缺失路线锁场景不得包含 PROJECT_ROUTE_LOCK.md");
    const manifest = await missingLock.computeManifest();
    assert.ok(!manifest.some((entry) => entry.path === "PROJECT_ROUTE_LOCK.md"));
  } finally {
    await missingLock.cleanup();
  }
});

test("validateWriteConsistencyScenario 对未知字段、缺失字段与越界路径 fail closed", async () => {
  const valid = await loadWriteConsistencyScenario("positive/community-workshop-write.json");
  const rawValid = JSON.parse(
    await readFile(join(FIXTURE_DIRECTORY, "positive/community-workshop-write.json"), "utf8"),
  ) as Record<string, unknown>;

  const mutations: ReadonlyArray<{ readonly label: string; readonly mutate: (record: Record<string, unknown>) => unknown }> = [
    { label: "未知顶层字段", mutate: (record) => ({ ...record, unexpected_field: true }) },
    { label: "缺失 scenario_id", mutate: (record) => { const { scenario_id: _omit, ...rest } = record; return rest; } },
    { label: "基线路径越界", mutate: (record) => ({ ...record, baseline: { ...(record.baseline as object), files: [{ path: "../escape.md", content: "x\n" }] } }) },
    { label: "基线路径为绝对路径", mutate: (record) => ({ ...record, baseline: { ...(record.baseline as object), files: [{ path: "/etc/passwd", content: "x\n" }] } }) },
    { label: "内容包含 CRLF", mutate: (record) => ({ ...record, baseline: { ...(record.baseline as object), files: [{ path: "a.md", content: "a\r\nb\r\n" }] } }) },
    { label: "基线路径重复", mutate: (record) => ({ ...record, baseline: { ...(record.baseline as object), files: [{ path: "README.md", content: "a\n" }, { path: "README.md", content: "b\n" }] } }) },
    { label: "未知故障类型", mutate: (record) => ({ ...record, fault: { kind: "kernel-panic" }, expected: { ...(record.expected as object), outcome: "WRITE_ACCESS_BLOCKED" } }) },
    { label: "期望回执超出冻结集合", mutate: (record) => ({ ...record, expected: { ...(record.expected as object), outcome: "WRITE_ACCEPTED_MAYBE" } }) },
    { label: "repository_id 非法", mutate: (record) => ({ ...record, target_project: { ...(record.target_project as object), repository_id: "md5:1234" } }) },
  ];

  for (const { label, mutate } of mutations) {
    assert.throws(
      () => validateWriteConsistencyScenario(mutate(structuredClone(rawValid))),
      WriteFixtureError,
      `${label} 必须被拒绝`,
    );
  }

  assert.doesNotThrow(() => validateWriteConsistencyScenario(structuredClone(rawValid)));
  assert.deepEqual(validateWriteConsistencyScenario(structuredClone(rawValid)), valid);
});

test("cleanup 可重试并完全移除物化目录", async () => {
  const scenario = await loadWriteConsistencyScenario("fault/readonly-directory-blocked.json");
  const fixture = await materializeWriteConsistencyScenario(scenario);

  try {
    await fixture.applyFaultSetup().catch((error) => {
      assert.ok(error instanceof FaultNotActiveError);
    });
  } finally {
    await fixture.cleanup();
    await fixture.cleanup();
    await assert.rejects(access(fixture.tempRoot), "物化根必须被完全移除");
  }
});
