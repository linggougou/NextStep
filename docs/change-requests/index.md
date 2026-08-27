# Change Requests

## 已完成变更

- [S3 独立复审 P1 修复](./001-s3-review-p1-remediation.md)：修复、独立复审与四份材料会签均已完成。
- [主对话 Agent 编排与上下文隔离](./002-main-conversation-agent-orchestration.md)：设计、迁移、独立复审与四份材料会签均已完成；实现留待后续阶段。
- [S1.2 attempt 6 测试 allowlist 漏项](./003-s1-2-attempt-6-test-allowlist-gap.md)：generation 2 修复、正式证据链和 S1.2 提升均已完成。

## 已关闭变更

- [M1.1 跨阶段 fixture 连续性缺口](./004-m1-1-cross-stage-fixture-continuity-gap.md)：已完成正式修复、独立验收与 M1.1 会签关闭；历史证据保留。
- [产品定义非目标与来源角色契约缺口](./005-product-definition-semantic-contract-gap.md)：第四轮独立复审 `PASS / 98` 后获用户批准；generation 4 与 F12/F13/F14 正式链已完成，历史证据保留。

## 已接受未关闭变更

- [可承受性护栏：复杂度预算、状态投影与真实项目价值验证](./006-scalability-guardrails.md)：SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过，但 `change_request_closed=false`，风险及真实运行 `0/3` 保留。V2 S2.2 candidate=`d35e63d`；attempt 1 temporal-invalid audit digest=`sha256:f6c7681083f5fdb810f1375cf0ce75aeb759c1d4e554617fc027d15dc55a5041`，attempt 2 role-authority-invalid audit digest=`sha256:08cf20a2c70e02833444c5ae7893ab007bc5c830441f3119ee2f60c115a6c9be`，两者均保留为无效历史；attempt 3 独立 review=`6c48b6c`、`PASS / 100`、P0/P1/P2=`0/0/0`、fresh `526/526`、coverage=`93.99/89.20/99.49`，有效 Result digest=`sha256:332323df803af638aac65a6044d0cf17a171dc8ff5744e213385f18fda089c0e`。S2.2=`gate-passed/present-in-main`；formal 仍为 F16，control=`6b4cb573655beb107d751004c9fc2b0b2c35490f`；下一唯一入口为 S2.3 Execution Packet preparation，S2.3/S2.4/M2.1/V2/`v0.2.0-alpha`/formal/P5 未完成。

## 分流规则

新增需求、漏项、二期需求不得直接进入当前版本或当前小里程碑，必须先判断：

- 是否为当前阶段缺口。
- 是否为当前阶段增强项。
- 是否影响项目路线、版本边界、数据模型、技术栈或验收门禁。
- 是否应进入后续阶段或 Backlog。
- 是否应拒绝。
