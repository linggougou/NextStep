# Change Requests

## 已完成变更

- [S3 独立复审 P1 修复](./001-s3-review-p1-remediation.md)：修复、独立复审与四份材料会签均已完成。
- [主对话 Agent 编排与上下文隔离](./002-main-conversation-agent-orchestration.md)：设计、迁移、独立复审与四份材料会签均已完成；实现留待后续阶段。
- [S1.2 attempt 6 测试 allowlist 漏项](./003-s1-2-attempt-6-test-allowlist-gap.md)：generation 2 修复、正式证据链和 S1.2 提升均已完成。

## 已关闭变更

- [M1.1 跨阶段 fixture 连续性缺口](./004-m1-1-cross-stage-fixture-continuity-gap.md)：已完成正式修复、独立验收与 M1.1 会签关闭；历史证据保留。
- [产品定义非目标与来源角色契约缺口](./005-product-definition-semantic-contract-gap.md)：第四轮独立复审 `PASS / 98` 后获用户批准；generation 4 与 F12/F13/F14 正式链已完成，历史证据保留。

## 已接受未关闭变更

- [可承受性护栏：复杂度预算、状态投影与真实项目价值验证](./006-scalability-guardrails.md)：SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过；`accepted_subject_main=37c13f34f50a634eb3b1b5c89c1ef5ddcce786aa`、`cumulative_review_commit=813e9fd5240b1af6413a274daa7e307757bbb246`、`cumulative_state_sync_commit=7274c03fbb6e7ee11dc7f24690a2af50ed76169a`、`first_reassessment_review_commit=7a579dd1f08ec65e916e509863846d99f143c9d5`、`v2_entry_attempt3_review_commit=bd78c043d6e16da3debadcd7c7395c31624a33ac`，live main 必须运行时解析。cumulative=`PASS / 97`、P0/P1/P2=`0/0/3`，Result control=`1ac071b`、digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，风险及真实运行 `0/3` 保留。attempt 3 独立=`PASS / 100`、P0/P1/P2=`0/0/0`、fresh `503/503`、coverage=`93.53/88.69/99.22`；attempt 2 因评审者创作 subject 后自审而 invalid/superseded。`change_request_closed=false`，无 V2 packet/control state；下一唯一动作只是形成并请求 `V2/S2.1 attempt 1` Execution Packet control CAS 的精确用户授权，formal 不移动。

## 分流规则

新增需求、漏项、二期需求不得直接进入当前版本或当前小里程碑，必须先判断：

- 是否为当前阶段缺口。
- 是否为当前阶段增强项。
- 是否影响项目路线、版本边界、数据模型、技术栈或验收门禁。
- 是否应进入后续阶段或 Backlog。
- 是否应拒绝。
