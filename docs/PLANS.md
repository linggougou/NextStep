# PLANS

## 当前阶段

- 生命周期阶段：S5 开发落地
- 当前项目里程碑：P5 产品落地
- 当前活动里程碑：`v0.2.0-alpha` 本地内部候选已固定为 `local-candidate-usable`；当前唯一入口为冻结 V3 Generation 1 计划并进行 fresh 独立 entry review
- 当前状态：alpha package acceptance attempt 3=`PASS / 100`，I/X/P/Profile=`25/25/25/25`，P0/P1/P2=`0/0/0`；Result digest=`sha256:b22a83615695375102a7a3841c27e6936ca6793feab3151a5a5a1e420bf2fbe4`，Result control=`25f5e5a18aae9f87ad6f0dce43513fbbe183fcc1`，implementation subject=`ca9da8d0fa00a4367a1ad6be411bc660a900098e`，review/integration main=`67438b527a7a88c6cc99c661b6f3d260d24e6877`。冻结产物=`/Users/ling/Documents/Codex/NextStep-v0.2.0-alpha/nextstep-0.2.0-alpha.tgz`，sha256=`9871dcb4a03c8a14f1849f73c431df42b3be7a5315dc3d07bcd6e321f5a30a63`、`121670` bytes、`75` entries，offline smoke 通过。本状态同步固定父/基线=`67438b527a7a88c6cc99c661b6f3d260d24e6877`；live main 必须运行时解析。formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad` 未移动，control=`4375910fa2554af9a8126449e07e25d4725ee6da`，`plan_generation=5`。tag、publish、formal 移动和用户级 Skill 安装未发生；CR-006 仍 open、qualified real runs=`0/3`。下一步只能先冻结 V3 Generation 1 计划并完成 fresh 独立 entry review；V3 packet、claim/fence、dispatch、编码均未创建。V3、V4、Final Acceptance 与 P5 均未完成。

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

P5 已于 2026-08-08 单独启动。V1、M2.1、M2.2 与 V2 已 formally-completed，CR-004/CR-005 已关闭。CR-006 SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过，但 CR-006 未关闭，qualified real runs 仍为 0/3。`v0.2.0-alpha` 本地内部候选已通过独立 package acceptance attempt 3，状态严格为 `local-candidate-usable`；未创建 tag、未 publish、未移动 formal、未安装用户级 Skill。当前唯一入口为冻结 V3 Generation 1 计划并完成 fresh 独立 entry review；不得直接创建 V3 packet、claim/fence、dispatch 或编码。V3、V4、Final Acceptance 与 P5 尚未完成。

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
