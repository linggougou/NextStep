# PRODUCT_SENSE

## 产品一句话

NextStep 是一个 AI 项目闭环落地系统，帮助用户把模糊想法整合成完整项目，再拆成多个可量化、可执行、可验收的小闭环，并持续推进直到交付。

## 核心用户

- 有目标但不知道如何拆解和推进项目的个人用户。
- 需要借助 AI 从想法走向交付的独立开发者、创业者、产品经理、内容创作者或小团队负责人。
- 已经会使用 AI，但经常遇到需求表达不完整、执行跑偏、项目范围漂移的人。

## 核心问题

- 用户的原始需求通常不是完整项目需求。
- AI 可以快速执行，但容易在需求不完整时沿错误方向推进。
- 只落地 MVP 不等于完整项目落地。
- 如果缺少阶段门禁、硬性指标和变更分流，项目会持续漂移。

## 产品原则

- 项目真源先于执行。
- 需求补全和冻结先于产品定义。
- 产品定义先于产品原型。
- 产品原型会签与产品载体裁决先于 UI 设计或技术架构。
- 主载体先于辅助入口，辅助入口先于集成面。
- 交互真源先于工程实现。
- 技术选型与架构先于里程碑实施。
- 完整项目蓝图先于版本拆分。
- 版本路线先于大里程碑。
- 大里程碑先于小里程碑。
- 小里程碑闭环先于 Agent 任务。
- 验收指标先于阶段切换。
- 变更分流先于需求并入。

## 当前非目标

- 不做单纯 Prompt 优化器。
- 不做 Agent 市场。
- 不做多 Agent 编排平台。
- 不做传统团队项目管理软件。
- 不做只有聊天记录、没有项目真源的 AI 助手。
- 不把 MVP 当成完整落地路线。

## 当前文档真源

- 原始需求：`docs/product-specs/001-original-requirement.md`
- 完整项目蓝图：`docs/product-specs/002-complete-project-blueprint.md`
- 用户旅程：`docs/product-specs/003-user-journey.md`
- 能力地图：`docs/product-specs/004-capability-map.md`
- 路线锁：`PROJECT_ROUTE_LOCK.md`
- 活动计划：`docs/PLANS.md`
- 变更入口：`docs/change-requests/index.md`

## P2 已会签交付物

- 产品原型：`docs/design-docs/p2-product-prototype.md`，用户会签通过
- UI 设计真源输入要求：`docs/design-docs/p2-ui-design-source-requirements.md`，用户会签通过
- 技术前置清单：`docs/architecture/p2-technical-prep.md`，用户会签通过

## P2.1 已会签交付物

- 后续真源文档契约：`docs/product-specs/005-stage-document-contracts.md`，用户会签通过

## 当前产品载体判断

- 当前已确认主交互载体为 `Skill / 聊天入口`。
- 当前已确认正式事实承载方式为 `项目文档真源 + PROJECT_ROUTE_LOCK.md + 对应阶段真源文档`。
- `Web` 暂不进入主路线，但保留为 `Web / UI` 候选分支。
- 已会签的 P2 原型与 P2 UI 输入要求，只能视为 `Web / UI` 候选分支输入，不等于当前主路线。

## 当前阶段

- 当前里程碑：P5 / CR-006 cumulative gate 已通过；V2 entry reassessment attempt 3=`PASS / 100`；首个 V2 产品 packet 尚未授权
- 当前生命周期阶段：S5 开发落地
- 当前状态：V1 已 formally-completed；`accepted_subject_main=37c13f34f50a634eb3b1b5c89c1ef5ddcce786aa`、`cumulative_review_commit=813e9fd5240b1af6413a274daa7e307757bbb246`、`cumulative_state_sync_commit=7274c03fbb6e7ee11dc7f24690a2af50ed76169a`、`first_reassessment_review_commit=7a579dd1f08ec65e916e509863846d99f143c9d5`、`v2_entry_attempt3_review_commit=bd78c043d6e16da3debadcd7c7395c31624a33ac`；live main 只能运行时通过 `git rev-parse refs/heads/main` 解析。formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，control=`1ac071b0087514390238381fa71cc4b4182983bc`，`plan_generation=5`。CR-006 cumulative 结论 `PASS / 97`、P0/P1/P2=`0/0/3`，Result digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，相关 carry-forward 风险与“真实运行 0/3”继续保留。attempt 3 独立复评=`PASS / 100`、P0/P1/P2=`0/0/0`，fresh `503/503`、零失败/跳过/取消/todo、coverage `93.53/88.69/99.22`；attempt 2 因 reviewer-authored subject 后自审而 invalid/superseded。`change_request_closed=false`，无 V2 packet/control state；下一唯一动作只是形成并请求 `V2/S2.1 attempt 1` Execution Packet control CAS 的精确用户授权。formal 不移动，PC-12/PC-19/V2/V4/P5/真实运行 3/3 均未完成。
- 当前正式状态、边界和下一入口以 `PROJECT_ROUTE_LOCK.md` 与 `docs/PLANS.md` 为准；若与本页摘要冲突，以两者为准。

## S3 已会签交付物

- 产品载体裁决：`docs/product-specs/006-product-carrier-decision.md`，已会签
- S3 Skill 交互真源补充契约：`docs/product-specs/007-s3-skill-interaction-contract.md`，已会签
- 后续交互与产品验收补充契约：`docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`，已会签
- S3 Skill 交互真源：`docs/design-docs/s3-skill-interaction-source.md`，已会签
- S4 技术输入补充契约：`docs/architecture/009-s4-technical-input-supplement.md`，已会签
- S3 UI 设计真源草稿：`docs/design-docs/s3-ui-design-source.md`，当前作为 `Web / UI` 候选分支暂停

## S4 已会签交付物

- S4 技术架构：`docs/architecture/s4-technical-architecture.md`，独立技术复审 `PASS / 98`，已会签
- S4 执行计划：`docs/exec-plans/completed/s4-technical-architecture.md`，已归档

## 当前交付物

- P5 主路线活动计划：`docs/exec-plans/active/p5-product-implementation-milestones.md`，V1 已 formally-completed，V2 入口评估已通过，但首个产品 packet 尚未授权
- P5 可承受性护栏计划：`docs/exec-plans/active/p5-scalability-guardrails.md`，三个互斥 SG package gate 与 cumulative gate 均已通过，但 CR-006 未自动关闭，也不提前满足 PC-12、PC-19、V2 或 V4
- P3 版本与里程碑拆解：`docs/exec-plans/completed/p3-version-and-milestone-breakdown.md`，已会签并归档
- 当前变更入口：`docs/change-requests/006-scalability-guardrails.md`，状态为 `cumulative-gate-passed-v2-entry-reassessment-pass`；`change_request_closed=false`，attempt 3 独立 `PASS / 100`，下一唯一入口为形成并请求 `V2/S2.1 attempt 1` packet CAS 精确授权；CR-005 已完成并关闭，SG-3 前序 contract-revision 与 V2 entry attempt 1/2 历史保留
