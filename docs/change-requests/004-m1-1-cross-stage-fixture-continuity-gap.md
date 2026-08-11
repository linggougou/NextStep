# M1.1 跨阶段 Fixture 连续性缺口

- 状态：已分流，等待用户决定
- 记录日期：2026-08-12
- 来源：`P5 / V1 / M1.1` 独立累积验收 attempt 1 退回
- 所属阶段：P5 / V1 / M1.1

## 1. 变更描述

M1.1 独立累积验收发现，三类目标项目的 S1.3 product-definition fixture 均未消费同名 S1.2 回放实际生成的 Frozen Requirement。S1.1、S1.2、S1.3 各阶段内部测试和正式证据链均通过，但跨阶段累计身份连续率为 `0/3`，不能证明 PC-03 真实承接 PC-02 的冻结产物。

## 2. 分流结论

- 类型：当前阶段缺口。
- 原因：不修复就无法满足 M1.1 的同项目累积 DoD；这不是后续增强项。
- 受影响真源：P5 活动计划、M1.1 验收报告、S1.3 三类 fixture、永久累积回归、路线锁和运行时控制代际。
- 受影响能力：PC-03 的累计输入身份，以及 M1.1 I/P 结论；PC-01、PC-02 阶段内结论保持有效。
- 当前正式基线：`f3fdd26542e5e562f0b01a9a716d3eb8b46cae36`，在修复链通过前保持不变。
- 验收结果：`退回 / 73`，`I=REVISE`、`X=PASS`、`P=REVISE`，P0/P1/P2 为 `1/1/2`。

## 3. 建议修复范围

- 三类 S1.3 输入必须精确复用同一回放中 S1.2 产生的 `frozen_requirement_id`、完整内容和 JCS SHA-256 digest，不得重新内嵌语义近似对象。
- 增加永久 M1.1 累积回归，逐类执行 S1.1 intake -> S1.2 completion/confirmation/freeze -> serialization recovery -> S1.3 product definition/signoff，并断言身份、内容和摘要连续。
- 保留现有阶段内正负例；累计测试不能以固定常量相等或复制同一对象绕过真实消费者边界。
- 受影响的 S1.3 fixture、测试、候选验证、I/X/P、L3、最终复验、Credential、Audit Anchor、Anchor Proof 和 formal promotion 必须重新执行。
- 修复后重新发起 M1.1 独立累积验收 attempt 2；通过前 S1.4 继续关闭。

## 4. 风险与验证成本

- 正确性风险：只替换 digest、不复用完整对象会留下 ID/内容断链；只补临时验收脚本会让回归再次发生。
- 证据风险：直接修改现有 formal 或复用旧 S1.3 结论会使旧证据与新内容身份错配。
- 路线风险：无。产品定位、技术栈、PC 定义、版本归属和验收门禁均不改变。
- 验证成本：新增三类累积回放与负例；重跑 `pnpm check`、覆盖率、Skill、audit、JSON、范围和污染检查；随后完整重走 S1.3 正式证据链与 M1.1 验收。

## 5. 代际与回滚

- 建议用户批准后把 `plan_generation` 从 2 推进到 3，墓碑失效 generation 2 中受影响的未闭合 M1.1 验收任务；旧 S1.1、S1.2 正式结果只作为不变前置证据保留。
- 在 generation 3 生成新的 S1.3 修复任务包，范围只覆盖三类连续 fixture、永久累积测试及完成该闭环所必需的最小消费者调整。
- 不原地改写旧 packet、Result Envelope、promotion 或 formal commit；新证据链未通过时，formal 保持 `f3fdd265...`。
- 若修复失败，保留当前 formal 和 `退回 / 73` 结论，继续阻塞 S1.4；不得降级验收标准换取通过。

## 6. 用户决定

- 当前决定：待用户审阅本次 P0 与建议修复范围。
- 需要确认：是否批准按“当前阶段缺口 + plan generation 3”实施修复，并重走 S1.3 正式证据链与 M1.1 attempt 2。
- 确认前禁止：编码、生成修复 Execution Packet、推进计划代际、移动 formal 或启动 S1.4。

## 7. 关闭条件

- 用户批准分流和 generation 3。
- 三类累计身份连续率达到 `3/3`，永久回归可重复且负例 fail closed。
- 受影响 S1.3 正式证据链重新闭环，M1.1 attempt 2 的 I/X/P 与总门禁通过。
- 用户完成 M1.1 阶段会签后，才允许关闭本变更并评估 S1.4 入口。
