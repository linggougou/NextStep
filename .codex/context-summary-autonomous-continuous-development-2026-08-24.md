# NextStep 自主持续开发上下文摘要

## 用户授权

用户于 2026-08-24 明确要求：后续由主代理自主规划并持续开发，无需逐步等待指示；先制定完整计划，各功能使用隔离 worktree 分派 subagent 并行执行，验收合格后回收对应 agent/worktree。

该授权覆盖既定路线内的研究、计划、实现、本地验证、独立审查、留痕、Result/control expected-old CAS、阶段同步和资源回收；不允许绕过路线锁、生命周期门禁、生成者自批、用户改动保护、测试失败阻断或未定义阶段出口。

## 当前项目身份

- 项目根：`/Volumes/2T/CODE/A_Mine/NextStep`
- 生命周期：`S5 / P5 产品落地`
- 路线：`P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`
- main：`7c66ce52b3e1537fe9c0b0d2bdad523a9bc2763d`
- formal F16：`ea04b57de83d6c548dcb1629b1f61832db8375ad`
- control ACK：`2e4351c0a2ea8e28a043504c8b5bcc658bdf2e07`
- V1 验收提交：`933a72dc97a0bb38a65326333dc3d26593d4814e`
- V1 验收分支：`codex/v1-cumulative-acceptance-a1-f113-20260824`
- 受保护用户改动：`.codex/context-summary-multica-migration-feasibility-2026-08-22.md`，不得读取、修改、提交、验收或清理。

## 已完成与当前缺口

- S1.1-S1.6 已正式提升至 F16；M1.1、M1.2 已完成。
- V1 entry review、Generation 1 计划评审、packet、claim/fence 113、唯一独立验收与 dispatch ACK 已完成。
- V1 attempt 1 三文件自评为 `PASS / 100`；主控独立复跑 474/474，并重算 17/17 source refs 与 scorecard JCS。
- 后续独立证据审计裁决 `REVISE`：fresh install/check/runner 只保存不可寻址摘要，Q/逐阶段连续性/20 项风险探针缺少行级机器证据，同一提交内 scorecard 不能替代 separate independent review。
- 原始字节无法恢复，attempt 1 不得生成 PASS Result；必须保留 rejected evidence，创建 attempt 2、新 claim/fence，并在允许产物中直接持久化可重放证据。
- 尚未形成 immutable V1 Result、Result 独立审查、Result control CAS、版本会签闭环和 V1 正式完成状态。
- 路线锁的状态镜像仍停在 packet-pending，必须在 V1 控制链闭合时同步，不能据旧镜像跳过当前门禁。

## 执行边界

- 主代理独占 main 集成、`refs/nextstep/control`、`refs/nextstep/formal` 和所有 expected-old CAS。
- subagent 只在专属 worktree/clone 中工作；每个任务有明确写集、输入提交、验收标准和禁止范围。
- 研究、实现、候选验证、I/X/P/Profile、L3、FV、AV 使用不同责任身份；生成者不得批准自己的产物。
- 低耦合功能可以并行；共享 Schema、路线锁、状态机或严格父链的工作必须串行。
- 每个版本必须先完成计划与门禁，再开发；不得并行宣告后续版本完成。
- 已完成 worktree 先固化提交/分支，再 clean 回收；一次性 clone 优先移入废纸篓以保留可恢复性。

## 工具与替代流程

- 当前未提供 Orca CLI；原用途为结构化 subagent 调度。
- 替代为 Codex 原生 collaboration subagent + Git worktree/no-local clone；主控以父链、写集、摘要、refs 和本地复验保证一致性。

## 当前最小可验收闭环

`attempt 1 REVISE 终结 -> attempt 2 packet/claim/fence/ACK -> 可重放累计验收 -> 全新独立审查 -> immutable PASS Result -> expected-old control CAS -> 会签包/终审 -> V1 状态同步`。

在该闭环通过前不得实施 V2；通过后按 P3/P5 真源冻结 V2 的精确 PC/里程碑/非目标和并行写集。
