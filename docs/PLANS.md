# PLANS

## 当前阶段

- 生命周期阶段：P4 执行机制设计
- 当前里程碑：P4 执行机制设计已完成
- 当前状态：P4 门禁通过；P5 尚未启动

## 当前活动计划

- 无。P5 尚未启动。

## 暂停候选计划

- [S3 UI 设计真源候选计划](./exec-plans/candidates/s3-ui-design-source.md)：仅在重新确认进入含 UI 路线后恢复

## 已会签上游

- [P2 产品原型](./design-docs/p2-product-prototype.md)：用户会签通过，作为 `Web / UI` 候选分支输入
- [P2 UI 设计真源输入要求](./design-docs/p2-ui-design-source-requirements.md)：用户会签通过，作为 `Web / UI` 候选分支输入
- [P2 技术前置清单](./architecture/p2-technical-prep.md)：用户会签通过
- [P2.1 后续真源文档契约](./product-specs/005-stage-document-contracts.md)：用户会签通过
- [P2.2 产品载体与交互形态裁决](./product-specs/006-product-carrier-decision.md)：用户会签通过，已确认 `Skill 主载体 + 文档真源承载 + Web 暂不进入主路线`
- [S3 Skill 交互真源补充契约](./product-specs/007-s3-skill-interaction-contract.md)：已会签
- [后续交互与产品验收补充契约](./product-specs/008-downstream-interaction-product-acceptance-contract.md)：已会签
- [S3 Skill 交互真源](./design-docs/s3-skill-interaction-source.md)：已会签，当前详细交互协议唯一真源
- [S4 技术输入补充契约](./architecture/009-s4-technical-input-supplement.md)：已会签
- [S4 技术架构](./architecture/s4-technical-architecture.md)：独立技术复审 `PASS / 98`，用户已于 2026-07-14 会签通过
- [P3 版本与里程碑拆解执行计划](./exec-plans/completed/p3-version-and-milestone-breakdown.md)：有效 L3 独立规划复审 `PASS / 94`，用户已于 2026-07-27 会签通过
- [P4 执行机制设计](./design-docs/p4-execution-mechanism-design.md)：L3 `PASS / 95`、上游可用性独立审查 `PASS / 94`，用户已于 2026-07-28 会签通过
- [主对话 Agent 编排与上下文隔离 CR](./change-requests/002-main-conversation-agent-orchestration.md)：已完成；实现留待后续阶段
- [S3 UI 设计真源](./design-docs/s3-ui-design-source.md)：`Web / UI` 候选分支草稿，当前暂停

## 当前阶段交付物

- [P4 执行机制设计执行计划](./exec-plans/completed/p4-execution-mechanism-design.md)：已归档
- [P4 执行机制设计](./design-docs/p4-execution-mechanism-design.md)：已会签，作为 P5 正式设计上游

## 下一阶段入口

P4 已通过两轮有效 L3 审查和用户会签，设计正文与归档计划共同作为 P5 正式上游。P5 是下一阶段入口，但本次未启动 P5、未创建 P5 活动计划，也未编码或生成真实任务包。

P4 应输出：

- 从已会签小里程碑到可拒绝 Execution Packet 的生成与校验机制。
- 主对话、集成、执行、验证、评估、审查、最终复验和锚验证职责边界。
- 派发确认、任务台账、代际、幂等、迟到结果和恢复协议。
- 不可变候选、最终快照、项目外凭证、审计锚、锚验证和正式引用 CAS 闭环。
- Acceptance Profile、I/X/P、Final Acceptance、宿主归档和 Change Intake 机制。
- 正例、负例、阻塞、恢复、验收和风险承接矩阵。

P4 不编写实现代码、测试代码、脚本或可执行 Schema，不生成或派发真实任务包，不修改目标项目，不进入 P5，不恢复 Web/UI 候选分支，也不引入 Project Provenance Store。

当前正式路线：

- `Skill / 聊天入口` 是主交互载体。
- `项目文档真源 + 路线锁 + 对应阶段真源文档` 是正式事实承载方式。
- `Web` 暂不进入主路线。

当前候选路线：

- `S3 UI 设计真源` 保留为 `Web / UI` 候选分支草稿。
- 未来若恢复，必须重新进入路线确认或变更分流。

P5 启动时必须把 P4 第 12 节“运行集成验收”实现为集成诊断预检；正式 I/X/P 四态结论仍必须走独立门禁和最终复验链，不能让集成任务自我批准。
