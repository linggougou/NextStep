# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

NextStep 是一个 AI 项目闭环落地系统：它先把用户的模糊想法整合成完整项目真源，再拆成版本路线和可量化闭环小里程碑，并通过阶段门禁、执行任务包、验收指标和变更管理推动项目持续交付。

## 2. 当前阶段

- 生命周期阶段：S2 产品原型
- 里程碑编号：P2
- 阶段名称：产品原型、设计真源与技术前置
- 阶段目标：基于已会签的 P1 完整项目蓝图，先产出产品原型和用户会签标准，再为后续 UI 设计真源与技术架构准备输入。
- 可验收交付物：
  - `docs/product-specs/002-complete-project-blueprint.md`
  - `docs/product-specs/003-user-journey.md`
  - `docs/product-specs/004-capability-map.md`
  - `docs/design-docs/p2-product-prototype.md`
  - `docs/design-docs/p2-ui-design-source-requirements.md`
  - `docs/architecture/p2-technical-prep.md`
  - `docs/exec-plans/active/p2-product-prototype-design-tech-prep.md`
  - `docs/PLANS.md`
  - `.codex/operations-log.md`
  - `.codex/verification-report.md`
- Definition of Done：
  - 产品原型覆盖核心页面、主流程、关键交互和不可偏离项。
  - 用户原型会签标准明确。
  - UI 设计真源的输入要求明确，但不直接生成高保真设计稿。
  - 技术选型与架构准备项明确，但不直接冻结技术栈。
  - P2 不冻结版本路线、大里程碑和小里程碑。
  - 本轮操作和验证有 `.codex` 留痕。
- 阶段出口：用户确认产品原型、UI 设计真源输入要求和技术前置清单可作为后续设计与架构阶段输入。
- 最小可验收闭环：产出可供用户审核的产品原型文档，并明确下一步 UI 设计和技术架构输入。
- 明确非目标：
  - 不实现 Web 应用、Skill、Agent 编排或自动化流程。
  - 不冻结最终技术栈。
  - 不生成高保真 UI 设计稿。
  - 不冻结版本路线、大里程碑或小里程碑。
  - 不把 MVP 当成完整落地路线。
- 禁止提前进入的阶段：S3 UI 设计真源、S4 技术架构、S5 里程碑计划、S6 小里程碑开发。
- 允许进入下一阶段的条件：用户确认 P2 产品原型和设计/技术前置输入。
- 当前状态：进行中

## 2.1 里程碑路线图

| 阶段 | 目标 | 交付物 | DoD | 门禁 | 状态 |
|---|---|---|---|---|---|
| P0 项目真源建立 | 记录原始需求、定位和路线锁 | 原始需求文档、产品原则、路线锁、留痕 | 用户确认当前真源可用于后续规划 | 不得进入实现 | 门禁通过 |
| P1 完整项目蓝图 | 把原始需求整合成完整项目 | PRD、用户旅程、完整能力地图、非目标 | 项目范围、成功指标和失败边界明确 | 用户确认 | 门禁通过 |
| P2 产品原型、设计真源与技术前置 | 把产品定义转成原型，并准备设计与技术输入 | 产品原型、用户会签标准、UI 设计输入要求、技术前置清单 | 原型可会签，设计与技术输入明确，且不提前冻结后续阶段 | 用户确认 | 进行中 |
| P3 版本与里程碑拆解 | 把完整项目拆成版本路线、大里程碑和小里程碑 | 版本路线图、大里程碑计划、小里程碑清单、验收矩阵 | 每个小里程碑有输入、输出、DoD、测试方式、非目标和验收方式 | 用户确认 | 未开始 |
| P4 执行机制设计 | 定义执行任务包、测试验收、合入、UI 验收、产品验收和变更管理机制 | 设计文档、流程图、状态机、数据模型 | 执行、测试、验收、合入、变更可闭环 | 用户确认 | 未开始 |
| P5 产品落地 | 按已确认小里程碑逐步实现并合入大里程碑 | 可运行产品、测试报告、UI 验收报告、产品验收报告、交付清单 | 本地验证、UI 验收和产品验收通过 | 阶段会签 | 未开始 |

## 3. 产品真源

- PRD：`docs/product-specs/002-complete-project-blueprint.md`
- 用户旅程：`docs/product-specs/003-user-journey.md`
- 能力地图：`docs/product-specs/004-capability-map.md`
- 非目标：见 `docs/PRODUCT_SENSE.md`

## 4. 设计真源

- UI / 原型来源：`docs/design-docs/p2-product-prototype.md`；后续 UI 设计输入要求见 `docs/design-docs/p2-ui-design-source-requirements.md`
- 高保真或截图证据：无
- 不允许偏离的页面 / 交互：见 `docs/design-docs/p2-product-prototype.md`

## 5. 技术真源

- 架构入口：`docs/architecture/p2-technical-prep.md`
- 技术栈：未选择
- 数据模型：未建立
- API 契约：未建立
- CodeGraph 自动初始化：需询问

## 6. 验收门禁

- 本地测试：当前阶段无代码测试要求。
- 构建命令：当前阶段无构建要求。
- 真机 / 浏览器 / E2E：当前阶段不适用。
- 发布或阶段门禁：P2 产品原型、设计真源输入要求和技术前置清单均需用户确认。
- 阶段 DoD 覆盖证据：`.codex/verification-report.md`
- 会签或用户确认：待用户确认。

## 7. 禁止无确认改动

- 禁止重写：产品定位、原始需求、阶段门禁。
- 禁止删除：路线锁、原始需求文档、`.codex` 留痕。
- 禁止替换：将 NextStep 降级为单纯 Prompt 工具、普通项目管理工具或一次性 MVP 生成器。
- 禁止新增：未经过变更分流的 Agent 市场、多 Agent 编排、知识库平台、团队协作大功能。

## 8. 变更入口

- Backlog：待建立。
- Change Request：`docs/change-requests/index.md`
- 当前阶段缺口：P2 产品原型、UI 设计真源输入要求和技术前置清单已建立，待用户会签。
- 后续阶段需求：UI 设计真源、技术架构、版本路线、大里程碑计划、小里程碑清单、验收矩阵、量化指标口径、产品实现、集成外部 Agent。
- 已拒绝需求：无。

## 9. 改路线流程

1. 写明现路线问题。
2. 列出受影响文件和门禁。
3. 给出迁移 / 回滚方案。
4. 说明生命周期阶段、里程碑、DoD 和验收门禁的变化。
5. 用户确认后再执行。
6. 更新本文件和 `.codex/operations-log.md`。
