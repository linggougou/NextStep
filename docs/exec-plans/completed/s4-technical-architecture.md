# S4 技术架构执行计划

状态：已完成，用户会签通过
记录日期：2026-07-13

## 1. 阶段目标

基于已会签的 P2 技术前置清单、007、008、S3 Skill 交互真源和 009，形成可审核、可验证、可回滚的 S4 技术架构候选，回答 NextStep 在 `Skill 主载体 + 文档真源承载` 路线下如何实现。

## 2. 当前阶段

- 生命周期阶段：S4 技术架构。
- 里程碑编号：S4。
- 阶段名称：技术架构。

## 3. 可验收交付物

- `docs/architecture/s4-technical-architecture.md`
- `PROJECT_ROUTE_LOCK.md`
- `docs/PLANS.md`
- `.codex/operations-log.md`
- `.codex/verification-report.md`

## 4. Definition of Done

- 技术目标与已会签产品、交互和验收真源一致。
- 至少给出推荐技术栈、备选方案及不选原因。
- 核心对象、数据模型、阶段门禁和状态机边界明确。
- 主对话、集成、执行职责能映射为可实现的系统边界。
- `host-bootstrap`、`project-probe` 与 `full / manual-isolated / blocked` 有实现选择和验证方案。
- 项目根解析、事务式写入、冲突、部分写入和安全恢复有技术方案。
- 不可变候选、最终内容快照、项目外凭证、审计锚和正式引用 CAS 有完整技术闭环。
- 权限、敏感信息、审计和数据保护原则明确。
- 每个高风险假设都有本地可重复验证方式、失败标准和回滚方案。
- S4 候选通过独立技术审查，并由用户会签后才允许进入后续阶段。

## 5. 明确非目标

- 不编写真实产品实现代码。
- 不冻结 P3 版本路线、大里程碑或小里程碑。
- 不生成具体执行任务包。
- 不恢复 Web / UI 候选分支。
- 不把宿主能力假设写成已经验证的事实。

## 6. 阶段出口

`docs/architecture/s4-technical-architecture.md` 已完成独立技术复审 `PASS / 98`，并于 2026-07-14 由用户会签通过。S4 阶段出口已满足，下一阶段进入 P3 版本与里程碑拆解。

## 7. 验证方式

- 对照 005 与 009 检查全部必填字段和必答问题。
- 检查 007、008、S3 正文到架构决策的追踪关系。
- 对高风险能力设计最小本地探针或可重复验证方案。
- 检查技术选择、备选、不选原因、风险和回滚是否可判定。
- 扫描 P3 里程碑、真实代码和 Web / UI 路线偷跑。
- 运行独立技术审查和 `git diff --check`。

## 8. Project Provenance 分流边界

用户于 2026-07-14 进一步澄清：后来提出的 `Project Provenance Store`，即长期记录每个 Agent、任务尝试、文件贡献、正式采纳关系和按归属安全回退的能力，不属于 NextStep 当前项目，也不进入本项目的 S4、P3、P4 或 Backlog。

NextStep 继续按已会签产品定义落地：

- 主对话 Agent 负责持续引导用户、接收决定和扁平分派独立任务。
- 开发、文档、测试、评估、审查、验证和集成仍由独立 Agent 任务完成。
- NextStep 继续生成执行任务包、维护项目真源和阶段门禁，并完成测试、合入、交互、产品及条件性 UI 验收闭环。
- 任务 ID、控制身份、不可变候选、精确最终复验、审计锚和正式引用 CAS 只服务于当前执行链的幂等、隔离、验收和正式状态正确性，不扩展为长期的 Agent 文件贡献归因系统。
- 本项目不建立 `Task -> Attempt -> Candidate -> Integration -> Rollback` 的长期溯源库，不建设 `.codex/provenance/`、Agent 可信身份体系、Git 双向归因索引或按 Agent 贡献回退能力。
- 原始 `Project Provenance Store` 设想如未来继续，应作为另一个独立 Skill / 项目重新进入需求入口；不得反向成为 NextStep 的依赖或扩大本项目范围。

本次澄清是移除尚未进入正式 S4 架构的新增增强项，恢复既有产品边界；不修改已会签的 007、008、009 或 S3 正文，也不需要在 NextStep 内建立 CR 003。

## 9. Codex 宿主能力研究证据

2026-07-14 使用当天更新的 Codex 官方手册与本机 `codex-cli 0.144.1` 生成协议 Schema 完成第一轮核验：

- Codex 当前原生支持主任务委派直接子 Agent，默认最大嵌套深度为 1，符合“三层职责、物理扁平调度”的路线；子 Agent 线程可被查看，结果由主任务汇总。
- 自定义 Agent 可以设置 `sandbox_mode = read-only`；Codex SDK 和 App Server 也允许在线程或 turn 上设置只读、工作区写入等沙箱策略。
- Codex App 的受管 worktree 从选定分支的 `HEAD` 启动；若选择包含本地变更的分支，未提交改动也可能被应用到新 worktree，因此 NextStep 仍必须验证精确输入快照，不能只信任 worktree 路径或 `HEAD`。
- App Server 提供 `thread/start`、`thread/resume`、`thread/fork`、`thread/list`、`thread/read`、`thread/archive`、`turn/start`、`turn/steer` 和 `turn/interrupt` 等接口，并可流式接收线程、turn、命令和文件变化事件。
- App Server 的 `thread/start` / `turn/start` 支持 `cwd`、沙箱和审批策略；本机生成的 Schema 与当前 CLI 版本绑定，可用于运行时 capability preflight。
- Codex SDK 适合在服务端或本地控制面中程序化启动和恢复线程；App Server 更适合需要完整线程生命周期、审批和事件流的深度集成。
- Codex 原生线程 ID、worktree 和事件流可以作为宿主关联证据，但不能替代 NextStep 的任务注册表、控制代际、幂等键、最终内容快照、项目外凭证和正式引用 CAS。
- Codex 的 `thread/rollback` 已标记为将废弃，且只修改对话历史，不回退本地文件；NextStep 不得把它作为项目安全回退机制。

上述能力仍需 S4 定义 `host-bootstrap` 与一次性 `project-probe` 的实测矩阵；官方文档和本机 Schema 证明接口存在，不等于目标宿主、权限和项目组合已经通过运行时预检。
