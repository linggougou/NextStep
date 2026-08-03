# S3 Skill 交互真源执行计划

状态：已完成，用户会签通过
记录日期：2026-07-10

## 1. 阶段目标

基于已会签的 `P2.2 产品载体与交互形态裁决`，建立 `S3 Skill 交互真源`，明确 NextStep 在 `Skill 主载体 + 文档真源承载` 路线下的入口、推进方式、确认节点、回写真源规则，以及主对话 Agent 扁平调度独立任务时的上下文隔离契约。

## 2. 当前阶段

- 生命周期阶段：S3 Skill 交互真源。
- 里程碑编号：S3。
- 阶段名称：Skill 交互真源。

## 3. 可验收交付物

- `docs/design-docs/s3-skill-interaction-source.md`
- `docs/product-specs/005-stage-document-contracts.md`
- `docs/product-specs/006-product-carrier-decision.md`
- `docs/product-specs/007-s3-skill-interaction-contract.md`
- `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`
- `docs/architecture/009-s4-technical-input-supplement.md`
- `docs/change-requests/002-main-conversation-agent-orchestration.md`
- `docs/design-docs/s3-main-conversation-agent-orchestration-design.md`（迁移来源与历史复审证据）
- `docs/exec-plans/active/s3-main-conversation-agent-orchestration-migration.md`
- `docs/PLANS.md`
- `PROJECT_ROUTE_LOCK.md`
- `.codex/operations-log.md`
- `.codex/verification-report.md`

## 4. Definition of Done

- 主入口、触发方式和默认禁止行为明确。
- 主对话 Agent 是唯一用户沟通入口，只沟通、决策和扁平调度，不读取或修改项目文件；集成与执行任务职责隔离，集成 Agent 不得自我批准。
- 独立任务只接收最小任务包，结果信封、控制信封、代际/去重/恢复和最终提升协议完整，普通执行消息不进入主对话。
- 主对话默认安静、按需展开，计划内自动分派和阻塞/决策例外边界明确，目标是保护语义稳定性与用户心流而不是减少 Token。
- 当前项目与当前阶段识别规则明确。
- 项目标识到唯一绝对项目根的解析、同名、越界和权限规则明确。
- Skill 的主流程、自动建议边界和显式确认节点明确。
- 真源回写映射明确。
- 候选变更、事务式写入、业务状态逻辑原子性、版本冲突、部分写入、验证失败和回滚规则明确。
- 多项目切换、阻塞与异常状态明确。
- 验收矩阵和变更入口完整。
- S4 的 Skill-first 补充技术输入、对象、能力和风险验证要求完整。
- 候选验证、产品与交互评估、独立审查、精确最终复验和正式提升门禁相互独立；最终内容变化后旧结论失效。
- 两阶段 capability preflight、三态结论、不可变候选/最终内容快照、项目外凭证、项目根审计锚与正式引用 CAS 已作为 S4 技术输入，未冻结实现。
- `Web / UI` 候选分支被保留但不作为当前主路线。
- 本阶段不进入技术架构、版本路线或执行任务包。

## 5. 明确非目标

- 不设计 Web 页面。
- 不定义具体 Skill 参数、MCP 协议字段或 API 契约。
- 不实现 Agent 编排，不冻结控制信封、任务包或结果信封的最终 API、MCP 或 schema。
- 不冻结技术栈。
- 不拆版本路线、大里程碑或小里程碑。
- 不写代码。

## 6. 阶段出口

用户已按 `007 -> 008 -> S3 -> 009` 顺序分别审核并会签四份材料，S3 阶段出口已于 2026-07-13 满足，下一阶段进入 S4 技术架构。

CR 002 的迁移包第二次独立 L2 复审为 `PASS / 96`；四份材料随后分别会签通过。迁移复审与用户会签证据保持独立。

## 7. 验证方式

- 当前阶段文档存在性检查。
- 入口、触发方式、当前项目识别、当前阶段识别覆盖检查。
- 自动建议边界、显式确认节点和真源回写规则覆盖检查。
- 主对话唯一入口、三层职责、扁平调度、独立任务隔离、默认安静和例外上报覆盖检查。
- 任务包、结果信封、`dispatch-ready` / `dispatch-ack`、控制代际、去重、恢复和最终提升字段覆盖检查。
- 五类独立验收结论、最终内容变化失效、项目外凭证、项目根审计锚与 CAS 门禁覆盖检查。
- `host-bootstrap` / `project-probe`、`full` / `manual-isolated` / `blocked` 和禁止同任务静默降级覆盖检查。
- 项目根解析、写入一致性、验收矩阵和变更入口覆盖检查。
- 显式上游保持 `007 -> 008 -> S3 -> 009` 且无循环检查。
- 四份材料状态、迁移包复审门禁与 S4 未开始状态检查。
- `Web / UI` 候选分支暂停状态检查。
- 占位文本和补丁残留检查。
- `git diff --check`。
