# PLANS

## 当前阶段

- 生命周期阶段：S5 开发落地
- 当前项目里程碑：P5 产品落地
- 当前活动里程碑：V3 Generation 2 / CR-007 Existing Project Adoption；S3.1 已 carry forward、A3.0-A/B 已独立验收并集成，当前唯一入口为 A3.0 cumulative acceptance Generation 1 修订计划与 fresh 独立 entry review
- 当前状态：V1/V2 formally-completed；alpha=`local-candidate-usable`。A3.0-B accepted subject=`60d373aef79141a03418aca5c75447742c6a87b5`、tree=`35cec7e7f509c3e3cef01a338def9d9b9c2935f2`，independent acceptance attempt 6/fence 187=`PASS / 100`、P0/P1/P2=`0/0/3`，acceptance Result=`sha256:b49fc780024d0fd50ab5190b7827db2089ff5552753a2f413dc375e98c29343e`；main/integration/review=`7cd3dd1fe3aae23a1759d604783b182558fb4c15`、tree=`462fb1877b42410acb0ffe2106be20dac7dc31c9`，post-integration control=`55e942b0bdc1318372f6c6226f8a469f7fa894e8`。formal=F16 未移动，全局 `plan_generation=5`、`v3_plan_generation=2`；真实项目 refs 未创建。A3.0 cumulative acceptance 尚未开始；首版计划 entry=`REVISE / 90`，必须基于本同步提交修订并重新独立评审。CR-006 仍 open、qualified real runs=`0/3`，A3.0/M3.1/V3/V4/Final Acceptance/P5 未完成。

## 当前活动计划

- [P5 产品落地实施里程碑](./exec-plans/active/p5-product-implementation-milestones.md)：当前主路线活动计划；按 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance` 推进
- [P5 可承受性护栏](./exec-plans/active/p5-scalability-guardrails.md)：CR-006 三包及 cumulative gate 已通过，但 CR 未自动关闭；护栏不改变 V2..V4 主路线或提前满足 PC

## 暂停候选计划

- [S3 UI 设计真源候选计划](./exec-plans/candidates/s3-ui-design-source.md)：仅在重新确认进入含 UI 路线后恢复

## 已会签上游

- [P2.2 产品载体裁决](./product-specs/006-product-carrier-decision.md)：`Skill 主载体 + 文档真源承载 + Web 暂不进入主路线`
- [S3 Skill 交互真源](./design-docs/s3-skill-interaction-source.md)：当前详细交互协议唯一真源
- [S4 技术架构](./architecture/s4-technical-architecture.md)：独立技术复审 `PASS / 98`，用户已会签
- [P3 版本与里程碑拆解](./exec-plans/completed/p3-version-and-milestone-breakdown.md)：有效 L3 独立规划复审 `PASS / 94`，用户已会签
- [P4 执行机制设计](./design-docs/p4-execution-mechanism-design.md)：L3 `PASS / 95`、上游可用性独立审查 `PASS / 94`，用户已会签
- [P4 完成计划](./exec-plans/completed/p4-execution-mechanism-design.md)：已归档，作为 P5 执行上游
- [后续交互与产品验收契约](./product-specs/008-downstream-interaction-product-acceptance-contract.md)：I/X/P、Profile 和 Final Acceptance 真源

## 当前实施入口

P5 已于 2026-08-08 单独启动。V1/V2 已 formally-completed；alpha=`local-candidate-usable`。S3.1 已完成并 carry forward；CR-007 的 V3 Generation 2 已由两个分离 CAS 确认；A3.0-A/B 已分别通过独立验收并集成。A3.0 cumulative acceptance 尚未开始，当前只允许基于本状态同步提交冻结修订计划并进行 fresh 独立 entry review；不得直接创建 cumulative packet/claim/dispatch，不得把源码主线能力、donor 副本或个别 package PASS 解释为真实项目接入、历史会签、A3.0/V3/V4/Final Acceptance/P5 完成，也不得创建真实项目 refs。

实施顺序保持 P3 已会签结构：

- V1：M1.1、M1.2，S1.1..S1.6，PC-01..08。
- V2：M2.1、M2.2，S2.1..S2.4，PC-09..13。
- V3：M3.1..M3.3，S3.1..S3.5，PC-14..18。
- V4：M4.1、M4.2，S4.1..S4.3，PC-19..20。
- Final Acceptance：反扫全部版本、PC、TG、S4 风险、交付和关闭条件。

## 不可偏离约束

- `Skill / 聊天入口` 是主交互载体；项目文档、路线锁和对应阶段真源承载正式事实。
- P4 第 12 节“运行集成验收”在 P5 中只能实现为集成诊断预检；正式 I/X/P 四态结论必须由独立门禁和最终复验链产生。
- 不恢复 Web/UI 候选分支，不引入常驻服务、数据库、通用编排平台或 Project Provenance Store。
- 不把 P4 文档、fixture、dry-run 或工程可构建误报为产品 PC 已交付。
- 新需求、漏项和范围变化先进入 Change Intake，不直接插入当前实施。

## 阶段出口

V1..V4 和 Final Acceptance 全部通过本地可重复验证、独立 I/X/P、适用 Profile 验收和用户会签后，才允许归档 P5 活动计划并进入交付归档。
