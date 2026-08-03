# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

NextStep 是一个 AI 项目闭环落地系统：它先把用户的模糊想法整合成完整项目真源，再裁决主交互载体与真源承载方式，随后按选定分支建立 `Skill` 或其他交互真源，再进入技术、里程碑、执行与验收闭环，并通过阶段门禁、执行任务包、验收指标和变更管理推动项目持续交付。

## 2. 当前阶段

- 生命周期阶段：P4 执行机制设计
- 里程碑编号：P4
- 阶段名称：执行机制设计
- 阶段目标：基于已会签 P3 计划、S4 技术架构和交互/验收真源，设计从小里程碑到任务包、派发、隔离执行、候选验证、集成、最终复验、正式提升、验收、恢复和变更分流的完整机制，作为 P5 产品落地的直接设计上游。
- 可验收交付物：
  - `docs/exec-plans/completed/p4-execution-mechanism-design.md`
  - `docs/design-docs/p4-execution-mechanism-design.md`
  - `docs/PLANS.md`
  - `PROJECT_ROUTE_LOCK.md`
  - `.codex/operations-log.md`
  - `.codex/verification-report.md`
- Definition of Done：
  - P3 PC-09..PC-20、TG 风险和 Final Acceptance 均有执行机制承接位置。
  - 任务包、控制信封、结果信封、台账、代际、幂等和过期规则可判定。
  - 主对话、集成、执行、验证、评估、审查、最终复验和锚验证职责分离。
  - 宿主 `full / manual-isolated / blocked` 三态与派发边界明确。
  - 候选、五类独立结论、最终快照、项目外凭证、审计锚、锚验证和正式引用 CAS 形成闭环。
  - Acceptance Profile、I/X/P、条件性 UI、Final Acceptance 和宿主归档边界明确。
  - 阻塞、失败、迟到结果、代际推进、确认丢失、CAS 竞争和归档失败均可恢复或明确阻塞。
  - Change Intake 有唯一分流规则，不允许范围静默扩张。
  - P4 候选通过有效 L3 独立规划审查并由用户会签。
  - 本轮操作和验证有 `.codex` 留痕。
- 阶段出口：用户确认 P4 执行机制设计可作为 P5 实现执行任务包、隔离执行、验证、集成、验收、正式提升、恢复和变更治理的正式设计真源；独立审查通过不替代用户会签。
- 最小可验收闭环：形成从已会签小里程碑到可拒绝任务包、独立执行、五类结论、最终快照、凭证、锚、CAS、验收、恢复和 Change Intake 的完整设计候选，通过专项断言和 L3 独立规划审查后提交用户会签。
- 明确非目标：
  - 不编写产品实现代码、测试代码或脚本。
  - 不生成或派发真实执行任务包，不开始 P3 小里程碑或 V1 实施。
  - 不修改目标项目，不进入 P5 产品落地。
  - 不改变已会签 S4 架构、技术栈或正式提升边界；需要改变时先进入 Change Request。
  - 不恢复 `Web / UI` 候选分支。
  - 不建设 Project Provenance Store、长期 Agent 贡献归因或按 Agent 贡献回退能力。
  - 不把文档存在、宿主接口存在或人工样例包装成运行能力已验证。
- 禁止提前进入的阶段：P5 产品落地及任何编码阶段。
- 允许进入下一阶段的条件：P4 候选通过有效 L3 独立规划审查并由用户会签；若设计要求改变已会签产品、交互、技术、P3 范围或验收边界，必须先完成 Change Request。
- 当前状态：门禁通过；P5 尚未启动

## 2.1 里程碑路线图

| 阶段 | 目标 | 交付物 | DoD | 门禁 | 状态 |
|---|---|---|---|---|---|
| P0 项目真源建立 | 记录原始需求、定位和路线锁 | 原始需求文档、产品原则、路线锁、留痕 | 用户确认当前真源可用于后续规划 | 不得进入实现 | 门禁通过 |
| P1 完整项目蓝图 | 把原始需求整合成完整项目 | PRD、用户旅程、完整能力地图、非目标 | 项目范围、成功指标和失败边界明确 | 用户确认 | 门禁通过 |
| P2 产品原型、设计真源与技术前置 | 把产品定义转成原型，并准备设计与技术输入 | 产品原型、用户会签标准、UI 设计输入要求、技术前置清单 | 原型可会签，设计与技术输入明确，且不提前冻结后续阶段 | 用户确认 | 门禁通过 |
| P2.1 后续真源文档契约 | 定义后续关键真源的格式和禁止提前内容 | S3/S4/P3/验收报告文档契约 | 每类契约有字段、合格标准、禁止提前写入内容 | 用户确认 | 门禁通过 |
| P2.2 产品载体与交互形态裁决 | 决定主载体、真源承载方式与后续分支顺序 | 产品载体裁决真源、分支条件、候选分支说明 | 主交互载体、真源承载方式、后续入口和候选分支边界明确 | 用户确认 | 门禁通过 |
| S3 Skill 交互真源 | 产出可用于 Skill 主载体落地、会签、真源回写、主对话编排、下游验收和 S4 输入的补充契约与交互真源 | Skill 补充契约、下游验收补充契约、S4 技术输入补充契约、交互真源、主对话编排交互契约、调用方式、确认节点、写入一致性、异常与阻塞处理 | 用户知道怎么调用、写到哪里、主对话如何保持语义隔离、哪些自动、哪些确认、失败后如何恢复，以及后续如何验收和进入技术架构 | 迁移包先独立复审；随后用户分别确认三份补充契约和交互真源 | 门禁通过 |
| S3 UI 设计真源（Web/UI 候选分支） | 在未来恢复可视化工作面时产出可用于 UI 还原验收的设计真源 | UI 设计真源、设计稿链接、截图证据、版本号、UI 验收清单 | 页面、状态、组件、响应式和验收证据完整 | 用户确认 | 候选暂停 |
| S4 技术架构 | 基于已会签的 Skill 交互真源和 S4 技术输入补充契约明确怎么实现 | 架构、技术栈、Interaction Source 模型、数据模型、风险与回滚 | 技术路线、高风险点和真源写入一致性可验证 | 独立技术审查与用户确认 | 门禁通过 |
| P3 版本与里程碑拆解 | 把完整项目拆成版本路线、大里程碑和小里程碑 | 版本路线图、大里程碑计划、小里程碑清单、验收矩阵 | 每个小里程碑有输入、输出、DoD、测试方式、非目标和验收方式 | 用户确认 | 门禁通过 |
| P4 执行机制设计 | 定义执行任务包、测试验收、合入、交互验收、产品验收和变更管理机制 | 设计文档、流程图、状态机、数据模型 | 执行、测试、交互验收、合入、变更可闭环 | 独立规划审查与用户确认 | 门禁通过 |
| P5 产品落地 | 按已确认小里程碑逐步实现并合入大里程碑 | 可运行产品、测试报告、交互验收报告、产品验收报告、交付清单 | 本地验证、交互验收和产品验收通过；含 UI 分支额外通过 UI 还原验收 | 阶段会签 | 未开始 |

## 3. 产品真源

- PRD：`docs/product-specs/002-complete-project-blueprint.md`
- 用户旅程：`docs/product-specs/003-user-journey.md`
- 能力地图：`docs/product-specs/004-capability-map.md`
- 后续真源文档契约：`docs/product-specs/005-stage-document-contracts.md`
- 产品载体裁决：`docs/product-specs/006-product-carrier-decision.md`
- S3 Skill 补充契约：`docs/product-specs/007-s3-skill-interaction-contract.md`
- 下游交互与产品验收补充契约：`docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`
- S4 技术输入补充契约：`docs/architecture/009-s4-technical-input-supplement.md`
- 非目标：见 `docs/PRODUCT_SENSE.md`

## 4. 设计真源

- 当前已会签交互真源：`docs/design-docs/s3-skill-interaction-source.md`
- Web / UI 候选来源：`docs/design-docs/p2-product-prototype.md`、`docs/design-docs/p2-ui-design-source-requirements.md`
- Web / UI 候选草案：`docs/design-docs/s3-ui-design-source.md` 当前仅为 `Web / UI` 候选分支草案，不构成当前阶段正式设计真源
- 当前交互边界：以已会签的 006、007、008、009 与 `docs/design-docs/s3-skill-interaction-source.md` 为准；若未来恢复 `Web / UI` 分支，则必须先完成变更分流并重新确认对应设计真源

## 5. 技术真源

- 架构入口：已会签的 `docs/architecture/p2-technical-prep.md` 与 `docs/architecture/009-s4-technical-input-supplement.md`
- 当前技术架构：`docs/architecture/s4-technical-architecture.md` 已会签，独立技术复审 `PASS / 98`
- 技术栈：`Codex Skill + TypeScript/Node 按需辅助工具 + JSON Schema + Markdown/JSON/Git 真源`
- 数据模型：S4 已定义领域对象、执行控制对象、状态机和正式提升边界
- API 契约：未建立
- CodeGraph 自动初始化：需询问

## 6. 验收门禁

- 本地测试：当前阶段无代码测试要求。
- 构建命令：当前阶段无构建要求。
- 真机 / 浏览器 / E2E：当前阶段不适用。
- 发布或阶段门禁：P4 已通过 L3 规划审查 `PASS / 95` 和 P4 -> P5 上游可用性独立审查 `PASS / 94`，用户于 2026-07-28 会签通过；P4 门禁已关闭，P5 尚未启动。
- 阶段 DoD 覆盖证据：`.codex/verification-report.md`
- 会签或用户确认：用户于 2026-07-28 明确确认 P4“审核通过”，P4 活动计划已归档。本次不启动 P5、不编码、不生成真实执行任务包。

## 7. 禁止无确认改动

- 禁止重写：产品定位、原始需求、阶段门禁。
- 禁止删除：路线锁、原始需求文档、`.codex` 留痕。
- 禁止替换：将 NextStep 降级为单纯 Prompt 工具、普通项目管理工具或一次性 MVP 生成器。
- 禁止新增：未经过变更分流的 Agent 市场、多 Agent 编排、知识库平台、团队协作大功能。

## 8. 变更入口

- Backlog：待建立。
- Change Request：`docs/change-requests/index.md`
- 当前阶段缺口：无。P4 已覆盖任务包、派发、候选、五类结论、集成、最终复验、正式提升、验收、恢复和 Change Intake，通过两轮有效 L3 审查并由用户会签。
- 后续阶段需求：P5 产品落地为下一阶段入口，但尚未启动；启动时须建立 P5 活动里程碑，并把 P4 第 12 节“运行集成验收”落实为集成诊断预检，正式 I/X/P 四态结论仍由独立门禁和最终复验链产生。若未来恢复 `Web / UI` 分支，需重新确认其与当前 Skill 主路线的关系。
- 已拒绝需求：无。

## 9. 改路线流程

1. 写明现路线问题。
2. 列出受影响文件和门禁。
3. 给出迁移 / 回滚方案。
4. 说明生命周期阶段、里程碑、DoD 和验收门禁的变化。
5. 用户确认后再执行。
6. 更新本文件和 `.codex/operations-log.md`。
