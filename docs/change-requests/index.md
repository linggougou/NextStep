# Change Requests

## 已完成变更

- [S3 独立复审 P1 修复](./001-s3-review-p1-remediation.md)：修复、独立复审与四份材料会签均已完成。
- [主对话 Agent 编排与上下文隔离](./002-main-conversation-agent-orchestration.md)：设计、迁移、独立复审与四份材料会签均已完成；实现留待后续阶段。
- [S1.2 attempt 6 测试 allowlist 漏项](./003-s1-2-attempt-6-test-allowlist-gap.md)：generation 2 修复、正式证据链和 S1.2 提升均已完成。

## 活动变更

- [M1.1 跨阶段 fixture 连续性缺口](./004-m1-1-cross-stage-fixture-continuity-gap.md)：已分流为当前阶段缺口；等待用户决定是否推进 plan generation 3 和 S1.3 修复链。

## 分流规则

新增需求、漏项、二期需求不得直接进入当前版本或当前小里程碑，必须先判断：

- 是否为当前阶段缺口。
- 是否为当前阶段增强项。
- 是否影响项目路线、版本边界、数据模型、技术栈或验收门禁。
- 是否应进入后续阶段或 Backlog。
- 是否应拒绝。
