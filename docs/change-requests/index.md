# Change Requests

## 已完成变更

- [S3 独立复审 P1 修复](./001-s3-review-p1-remediation.md)：修复、独立复审与四份材料会签均已完成。
- [主对话 Agent 编排与上下文隔离](./002-main-conversation-agent-orchestration.md)：设计、迁移、独立复审与四份材料会签均已完成；实现留待后续阶段。
- [S1.2 attempt 6 测试 allowlist 漏项](./003-s1-2-attempt-6-test-allowlist-gap.md)：generation 2 修复、正式证据链和 S1.2 提升均已完成。

## 已关闭变更

- [M1.1 跨阶段 fixture 连续性缺口](./004-m1-1-cross-stage-fixture-continuity-gap.md)：已完成正式修复、独立验收与 M1.1 会签关闭；历史证据保留。
- [产品定义非目标与来源角色契约缺口](./005-product-definition-semantic-contract-gap.md)：第四轮独立复审 `PASS / 98` 后获用户批准；generation 4 与 F12/F13/F14 正式链已完成，历史证据保留。

## 已接受未关闭变更

- [可承受性护栏：复杂度预算、状态投影与真实项目价值验证](./006-scalability-guardrails.md)：SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过，但 `change_request_closed=false`，风险及 qualified real runs `0/3` 保留。V2 corrected S2.3 implementation/review 已以 main commits=`5f74d06` / `e3f0b24` 合入；独立 package acceptance=`PASS / 100`、P0/P1/P2=`0/0/0`、root fresh `536/536`、coverage=`94.14/89.31/99.52`，Result digest=`sha256:89e9b721870d1685fd0e1c0172b88ce9f6d8fec04fc2b867c302443f0d867408`。错误 attempt 1 M2.1 身份与 fence140 永久无效；S2.3=`gate-passed/present-in-main`。formal 仍为 F16，control=`ebca4713db2f00f3a1c5db044f67004a06d9487c`；下一唯一入口为 `P5/V2/M2.2/S2.4` Execution Packet preparation，packet/CAS/编码尚未发生，S2.4/M2.2/V2/`v0.2.0-alpha`/formal/P5 未完成。

## 分流规则

新增需求、漏项、二期需求不得直接进入当前版本或当前小里程碑，必须先判断：

- 是否为当前阶段缺口。
- 是否为当前阶段增强项。
- 是否影响项目路线、版本边界、数据模型、技术栈或验收门禁。
- 是否应进入后续阶段或 Backlog。
- 是否应拒绝。
