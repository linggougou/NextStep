# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

NextStep 是一个 AI 项目闭环落地系统：它先把用户的模糊想法整合成完整项目真源，再裁决主交互载体与真源承载方式，随后按选定分支建立 `Skill` 或其他交互真源，再进入技术、里程碑、执行与验收闭环，并通过阶段门禁、执行任务包、验收指标和变更管理推动项目持续交付。

## 2. 当前阶段

- 生命周期阶段：S5 开发落地
- 里程碑编号：P5
- 阶段名称：产品落地
- 阶段目标：基于已会签的 P3 版本与里程碑、S4 技术架构和 P4 执行机制，按 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance` 顺序实现可运行 NextStep，并用目标项目 fixture、本地测试、独立 I/X/P、适用 Profile 验收和用户会签证明 `PC-01..PC-20`。
- 可验收交付物：
  - `docs/exec-plans/active/p5-product-implementation-milestones.md`
  - 可运行的 Skill 主入口与 TypeScript/Node 按需辅助工具
  - 版本化结构契约、领域规则、状态机、Git/文件工具和必要宿主适配
  - 目标项目 fixture、单元/集成/故障注入测试和宿主探针
  - V1..V4 的测试、交互、产品验收报告与风险反扫证据
  - Final Acceptance 报告、交付清单、正式引用/归档证据和回滚说明
  - `docs/PLANS.md`
  - `PROJECT_ROUTE_LOCK.md`
  - `.codex/operations-log.md`
  - `.codex/verification-report.md`
- Definition of Done：
  - P3 的 4 个版本、9 个大里程碑、18 个小里程碑、12 项指标和 14 个验收对象均有可运行证据。
  - `PC-01..PC-20` 全部通过目标项目 fixture 行为验证，文档存在不替代产品能力。
  - P4 的 8 个逻辑工具入口、12 个对象、8 类职责和 18 个失败/恢复场景均被实现与验证承接。
  - 至少一个正式支持主宿主为 `full`，其他声明支持者至少为 `manual-isolated`。
  - 五类独立结论、最终快照、项目外凭证、审计锚、Anchor Proof 和 formal ref CAS 形成可运行闭环。
  - NextStep 自身通过 headless I/X/P；Acceptance Profile 与目标项目路线一致，冲突 fail closed。
  - Change Intake、恢复、Final Acceptance、交付和宿主归档边界通过故障注入和反扫验证。
  - V1..V4 与 Final Acceptance 分别完成本地验证、适用验收和用户会签。
- 阶段出口：V1..V4 和 Final Acceptance 全部通过；正式 OID、交付清单、风险、回滚和 PC-20.AR 状态可追溯，并由用户明确确认 P5 产品落地完成。
- 最小可验收闭环：`P5-M0 实施就绪门禁` 已通过；`V1 / M1.1 / S1.1` attempt 2 候选已完成执行验证、独立候选验证、I/X/P 和 L3，当前进入 `Final Content Snapshot -> 独立最终复验 -> Verification Credential -> Audit Anchor -> Anchor Proof -> formal ref CAS`。S1.1 只承接需求入口，不生成开发任务；正式提升前不得进入 S1.2。
- 明确非目标：
  - 不恢复 NextStep Web/UI 候选分支。
  - 不引入常驻服务、数据库、远程控制面或通用多 Agent 编排平台。
  - 不建设 Project Provenance Store、长期 Agent 贡献归因或按 Agent 贡献回退。
  - 不一次性实现全部版本，不绕过小里程碑和版本门禁。
  - 不让主对话读写项目或让集成任务自我批准。
  - 不把 fixture、dry-run、文档或接口存在包装成正式产品能力。
  - 不自动覆盖、重置、推送、发布或归档用户工作区。
  - 不改变已会签产品、交互、S4/P3/P4 或验收边界；需要改变时先进入 Change Request。
- 禁止提前进入的阶段：S7 最终发布判断和 S8 交付归档；V1..V4 也不得跳过前序门禁并行宣告完成。
- 允许进入下一阶段的条件：P5 Final Acceptance 通过本地可重复验证、独立验收和用户会签；若实现要求改变已会签产品、交互、技术、版本范围、正式提升或验收边界，必须先完成 Change Request。
- 当前状态：进行中；P5-M0 门禁通过，S1.1 attempt 2 已获 `L3 PASS / 97`，正在执行最终快照与正式提升链

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
| P5 产品落地 | 按已确认小里程碑逐步实现并合入大里程碑 | 可运行产品、测试报告、交互验收报告、产品验收报告、交付清单 | 本地验证、交互验收和产品验收通过；含 UI 分支额外通过 UI 还原验收 | 版本与阶段会签 | 进行中（S1.1 attempt 2 双前置门禁与 L3 通过；待最终复验和正式提升） |

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

- 本地测试：P5-M0 固定 Node 内置测试运行器和 fixture harness；后续每个小里程碑运行受影响测试，大里程碑和版本收口运行累积回归。
- 构建命令：P5-M0 中固定依赖安装、类型检查、测试和构建命令；在命令通过前不得进入 S1.1。
- 真机 / 浏览器 / E2E：NextStep 当前 Skill-only 路线不要求浏览器 E2E；宿主探针、真实 Git fixture 和 I/X/P 行为回放按里程碑启用。
- 发布或阶段门禁：P4 已通过 `PASS / 95`、`PASS / 94` 和用户会签；用户于 2026-08-08 授权启动 P5。P5-M0 固定候选 `8cc0f3d` 经第七轮 L3 `PASS / 97`，P0/P1 = 0，门禁通过；S1.1 必须在任务包和 `dispatch-ready` 持久化后才可派发。
- 阶段 DoD 覆盖证据：`docs/exec-plans/active/p5-product-implementation-milestones.md`、`.codex/verification-report.md`，后续补充 `docs/qa/` 与 `docs/releases/` 证据。
- 会签或用户确认：P5 启动已获用户确认；V1..V4 和 Final Acceptance 仍需各自按计划完成门禁与会签。

## 7. 禁止无确认改动

- 禁止重写：产品定位、原始需求、阶段门禁。
- 禁止删除：路线锁、原始需求文档、`.codex` 留痕。
- 禁止替换：将 NextStep 降级为单纯 Prompt 工具、普通项目管理工具或一次性 MVP 生成器。
- 禁止新增：未经过变更分流的 Agent 市场、多 Agent 编排、知识库平台、团队协作大功能。

## 8. 变更入口

- Backlog：待建立。
- Change Request：`docs/change-requests/index.md`
- 当前阶段缺口：S1.1 attempt 2 已完成任务包、候选、独立候选验证、I/X/P 与 L3；当前缺口为 Final Content Snapshot、独立最终复验凭证、Audit Anchor、Anchor Proof 和 formal ref CAS。任一缺失时不得进入 S1.2 或宣称 S1.1 正式完成。
- 后续阶段需求：V1..V4 和 Final Acceptance 按活动计划顺序推进；P4 第 12 节“运行集成验收”只允许落实为集成诊断预检，正式 I/X/P 四态结论仍由独立门禁和最终复验链产生。若未来恢复 `Web / UI` 分支，需重新确认其与当前 Skill 主路线的关系。
- 已拒绝需求：无。

## 9. 改路线流程

1. 写明现路线问题。
2. 列出受影响文件和门禁。
3. 给出迁移 / 回滚方案。
4. 说明生命周期阶段、里程碑、DoD 和验收门禁的变化。
5. 用户确认后再执行。
6. 更新本文件和 `.codex/operations-log.md`。
