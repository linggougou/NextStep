# Change Requests

## 已完成变更

- [S3 独立复审 P1 修复](./001-s3-review-p1-remediation.md)：修复、独立复审与四份材料会签均已完成。
- [主对话 Agent 编排与上下文隔离](./002-main-conversation-agent-orchestration.md)：设计、迁移、独立复审与四份材料会签均已完成；实现留待后续阶段。
- [S1.2 attempt 6 测试 allowlist 漏项](./003-s1-2-attempt-6-test-allowlist-gap.md)：generation 2 修复、正式证据链和 S1.2 提升均已完成。

## 已关闭变更

- [M1.1 跨阶段 fixture 连续性缺口](./004-m1-1-cross-stage-fixture-continuity-gap.md)：已完成正式修复、独立验收与 M1.1 会签关闭；历史证据保留。
- [产品定义非目标与来源角色契约缺口](./005-product-definition-semantic-contract-gap.md)：第四轮独立复审 `PASS / 98` 后获用户批准；generation 4 与 F12/F13/F14 正式链已完成，历史证据保留。

## 已接受未关闭变更

- [可承受性护栏：复杂度预算、状态投影与真实项目价值验证](./006-scalability-guardrails.md)：SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过，但 `change_request_closed=false`，风险及 qualified real runs `0/3` 保留。V2 已 formally-completed；CR-007/V3 Generation 2 的推进不自动关闭 CR-006。

## 已批准、代际已确认的变更

- [既有项目安全接入（Existing Project Adoption）](./007-existing-project-adoption.md)：CR-007 仍为已批准、未关闭；Generation 2 已由两个分离 CAS 确认，A3.0-A/B 已独立验收并集成。A3.0 cumulative acceptance attempt 2 已完成 plan/entry review、dispatch、ACK、source 与 donor preflight，但因生产级 trusted host 缺失而形成 durable blocker，后续分流转入 CR-008 候选。真实项目 refs、A3.0/V3/P5 完成均未发生。

## Change Intake 候选

- [生产级可信宿主（Production Trusted Host）](./008-production-trusted-host.md)：尚未批准、尚未实施。A3.0 cumulative acceptance attempt 2 blocker Result=`sha256:49eef940a268e6b791a349ac053aa8d1d51340a434f4de8060dd57fd85c0f0bf`，current live control=`1b244c822ee5aa2a246fce0341a788f2c90f1897`；当前合法入口仅为 fresh 独立评审，随后由用户决定是否最终批准。本候选不授权 V3 generation 3 plan/CAS、packet、编码、真实用户动作或真实项目 refs。

## 分流规则

新增需求、漏项、二期需求不得直接进入当前版本或当前小里程碑，必须先判断：

- 是否为当前阶段缺口。
- 是否为当前阶段增强项。
- 是否影响项目路线、版本边界、数据模型、技术栈或验收门禁。
- 是否应进入后续阶段或 Backlog。
- 是否应拒绝。
