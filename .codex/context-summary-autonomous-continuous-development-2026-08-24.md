# NextStep 自主持续开发上下文摘要

## 用户授权

用户于 2026-08-24 明确要求：后续由主代理自主规划并持续开发，无需逐步等待指示；先制定完整计划，各功能使用隔离 worktree 分派 subagent 并行执行，验收合格后回收对应 agent/worktree。

该授权覆盖既定路线内的研究、计划、实现、本地验证、独立审查、留痕、Result/control expected-old CAS、阶段同步和资源回收；不允许绕过路线锁、生命周期门禁、生成者自批、用户改动保护、测试失败阻断或未定义阶段出口。

## 当前项目身份

- 项目根：`/Volumes/2T/CODE/A_Mine/NextStep`
- 生命周期：`S5 / P5 产品落地`
- 路线：`P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`
- main：本次 attempt 3 计划与状态同步提交
- formal F16：`ea04b57de83d6c548dcb1629b1f61832db8375ad`
- control：`a2e0cad094a5600c1309acb51b3a28069dfd08c2`
- V1 attempt 1/2：均已形成非通过 Result；最低有效 attempt 为 3
- 最新验收候选/独立审查：`e6e2e05b80bfe6f7468acc11ea377790658467d7` / `f585c6cda64a6b767a2f41637f142f0e36b6691b`
- 受保护用户改动：`.codex/context-summary-multica-migration-feasibility-2026-08-22.md`，不得读取、修改、提交、验收或清理。

## 已完成与当前缺口

- S1.1-S1.6 已正式提升至 F16；M1.1、M1.2 已完成。
- V1 entry review、Generation 1 计划评审、packet、claim/fence 113、唯一独立验收与 dispatch ACK 已完成。
- V1 attempt 1 独立证据审计为 `REVISE / 70`：原始字节不可寻址、缺行级证据、执行者同提交自批；非通过 Result 已固化。
- V1 attempt 2 已在 fence 114 fresh 重跑，四类原始内容、474/474、固定机器行和 17/17 source refs 均可重放；独立 L3 仍因 `PC-07/08 -> continuity:S1.7/S1.8` 悬空和 Q11 六个 TG 缺顶层闭环裁决 `REVISE / 80`。
- attempt 2 非通过 Result 已由主控独立校正并 CAS 到 control；reviewer 越权生成的 control draft `9aba06b...` 未进入 ref，保留分支仅供审计。
- 当前必须创建 attempt 3：fresh 重跑全部证据，并纠正 PC/TG 生成逻辑，旧 PASS 数值不得直接复用。
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

`attempt 3 计划独立评审 -> packet/claim/fence/ACK -> fresh 可重放累计验收 -> 全新独立审查 -> immutable PASS Result -> expected-old control CAS -> 会签包/终审 -> V1 状态同步`。

在该闭环通过前不得实施 V2；通过后按 P3/P5 真源冻结 V2 的精确 PC/里程碑/非目标和并行写集。
