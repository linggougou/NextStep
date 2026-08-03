# 结论

`REVISE`，独立评分 `89 / 100`。上一轮四类缺口中的宿主能力预检与 Change Intake 已闭合，调度握手和最终复验也已形成主体流程；但最终正式状态写入顺序仍与“精确最终快照独立复验”互相冲突，当前不应迁移到 007、008、009、S3 正文，也不能进入 S4。

# 为什么

1. **P0：复验后的正式状态仍可能发生未复验写入。** 设计第 8.1 节先要求把“所有计划内正式真源和状态变更”纳入最终集成快照并独立复验，但随后又规定正式提升成功后才更新任务状态、会签状态和阶段状态；第 4.2 节也写成提升后再更新真源、注册表、检查点和验证留痕。若这些更新会改变项目文件或正式状态，它们不在已绑定摘要内；若它们只是使快照内既有内容生效，则文档需要明确“只移动引用/提交事务，不再写内容”。CR 002 第 5 节仍保留“先合入主工作区、更新正式真源，再完成整体验证”的旧顺序，进一步造成两个可执行解释。
2. **P1：旧基线控制信封的失效传播仍不完整。** `dispatch-ready` 有过期时间和 `invalidated_by`，也规定计划或基线变化时拒绝，但没有定义基线变化后由谁发送不可变撤销信封、主对话如何在不读项目文件时获得当前控制代际，以及撤销与旧 `dispatch-ready` 乱序到达时的优先级。`dedup_key` 含基线，反而会让同一 `task_id` 的新旧基线得到不同键；仅查询相同键不能证明迟到旧信封已失效。需要单调 `plan_generation` / `task_attempt` 或等价的撤销墓碑，并把它纳入恢复重放规则。
3. 两阶段 `capability-preflight` 已避免预检循环：主对话先做不读项目文件的 `host-bootstrap`，只有证明独立任务创建与查询后才创建 `project-probe`；结论严格限定为 `full`、`manual-isolated`、`blocked`，串行同任务执行不能静默冒充严格隔离。
4. CR 002 已补齐运行时风险、验证成本、迁移失败回滚和宿主能力不可用处理；索引也保持“待独立复审、迁移前暂停会签”的正确门禁状态。

# 必须修改

- 统一最终事务边界：最终独立复验必须绑定将被正式提升的全部内容和正式状态；复验通过后只能原子移动引用或提交同一快照。任何真源、会签、阶段、验证留痕或其他受门禁状态的内容写入都必须预先进入快照；提升后的非内容副作用需明确列出，并证明不会改变已复验身份。同步修正 CR 002 第 5 节的旧顺序。
- 为控制面增加可被主对话验证的单调代际或撤销协议，明确产生者、字段、持久化位置、送达确认、乱序优先级和恢复重放。迟到的旧基线 `dispatch-ready` 必须在主对话不读项目文件的前提下确定性拒绝。

# 证据

- 最终快照包含状态：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:262`。
- 内容不变提升与提升后更新状态的冲突：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:264`、`:266`；集成职责另见 `:97`。
- CR 002 保留的旧集成顺序：`docs/change-requests/002-main-conversation-agent-orchestration.md:90`；独立审批边界见 `:92-96`，后置精确复验控制见 `:126`、`:142`。
- 控制信封字段与握手：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:180-204`；恢复重放见 `:240-242`。
- 两阶段预检和降级矩阵：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:29-57`。
- CR 风险、成本、回滚和能力不可用处理：`docs/change-requests/002-main-conversation-agent-orchestration.md:120-171`。
- 索引门禁：`docs/change-requests/index.md:3-6`。
- 本地断言：`REREVIEW_INPUT_ASSERTIONS_OK`；`git diff --check` 在审查包写入后复核。
- Codex 官方手册助手失败：响应缺少 `x-content-sha256`；当前环境未提供 OpenAI Docs MCP。因而本轮不把未公开宿主行为视为保证，以设计中的 capability preflight 作为运行时证明门禁。
