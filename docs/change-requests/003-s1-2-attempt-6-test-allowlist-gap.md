# S1.2 Attempt 6 测试 Allowlist 漏项

状态：已完成
记录日期：2026-08-11
来源：`V1 / M1.1 / S1.2` attempt 6 执行任务阻塞结果
所属阶段：P5 / V1 / M1.1 / S1.2

## 1. 变更描述

attempt 6 要求 `ConfirmationInteractionStateEvent` 的 `user-action` 分支只接受 `VerifiedConfirmationInteraction` capability，使 confirm、reject、cancel 全部先经 verifier。现有 `tests/domain/machine-receipt-schema.test.ts` 与 `tests/domain/requirement-set.test.ts` 仍以裸 `UserConfirmationAction` 驱动 reducer；两条路径不在 attempt 6 的 `allowed_paths`，执行任务无法在不越界的前提下完成全量回归迁移。

## 2. 分流结论

- 类型：当前阶段缺口。
- 原因：不迁移这两条既有消费者契约测试，新的 fail-closed capability 规则无法通过完整回归；保留裸动作成功路径会形成安全旁路。
- 受影响真源：P5 活动计划、S1.2 Execution Packet、路线锁和运行时控制代际。
- 受影响能力：PC-02 的 S1.2 实施证据，不改变 PC 定义、版本归属或阶段出口。
- 正式基线：`8ffaf658e112a5ba26a9f83882f5f71f1ae79454`，保持不变。
- 实现基线：attempt 5 候选 `c8be6bb5f4f5195e268d0762740101d39acf23c2`；治理提交完成后以其后继提交作为新 working parent。

## 3. 风险与验证成本

- 风险：若只放宽生产实现而不迁移两条测试，裸 user-action 可能继续被当作合法消费者契约；若直接修改 attempt 6 packet，则会破坏不可变任务包和代际单调性。
- 路线风险：无。产品定位、用户确认语义、技术栈、正式提升机制和验收门禁均不变。
- 验证成本：新增两条 allowlist 路径；重跑 RED/GREEN、`pnpm check`、覆盖率、audit、Skill、JSON、路径边界、上游和 refs/runtime 不变性；固定新候选后重跑候选验证与 I/X/P。

## 4. 决定与代际影响

- 建议分流：将 attempt 6 标记为 `blocked`，先持久化 `generation-advance`，把 `plan_generation` 从 1 推进到 2；generation 1 的活动任务和未完成门禁全部失效。
- 新任务：在 generation 2 内从 `task_attempt=1` 重新生成 S1.2 任务包，沿用 attempt 6 的目标、DoD、正式基线和非目标，只增加上述两条测试路径。
- 用户决定：用户已授权主管在已会签 P5 路线和当前小里程碑边界内全权规划、分派与落地；本次不涉及路线、产品范围、安全边界或验收门禁变化，按该授权执行。
- 禁止事项：不得原地改写 generation 1 packet，不得复用其结论，不得移动 formal ref，不得启动 L3。

## 5. 关闭条件

- generation 1 墓碑和 generation 2 确认已通过 control ref CAS 持久化。
- generation 2 S1.2 任务包、dispatch-ready、outbox、claim 和 dispatch-ack 完整。
- 新任务在 allowlist 内完成实现与全量验证；双前置门禁同时通过前，本变更保持未关闭。

## 6. 关闭结果

- generation 1 已墓碑失效，generation 2 S1.2 修复任务、双前置门禁、L3、最终复验、Credential、Audit Anchor、Anchor Proof 与 formal promotion 均已完成。
- S1.2 正式提升 OID 为 `a854fd4938b34ab24d88e72430be52b397c91096`；后续 S1.3 正式提升未回退该能力。
- 本变更关闭；后续 M1.1 跨阶段 fixture 连续性问题由 CR-004 独立承接。
