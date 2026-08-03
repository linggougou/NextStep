# 结论

`REVISE`，独立评分 `88 / 100`。上一轮剩余的 P0 最终事务边界和 P1 派发控制代际已经关闭，但全量回归发现两项新引入的 P1，当前仍不应迁移到 007、008、009、S3 正文，也不能进入 S4。本轮没有 P0。

# 为什么

1. **P1：控制代际只关闭了派发乱序，未关闭旧任务结果乱序。** `dispatch-ready`、墓碑和主对话缓存已经绑定 `plan_generation` / `task_attempt`，但结果信封仍只要求任务 ID、基线和状态。旧代际任务可能在墓碑确认前已经创建或执行，其迟到结果、候选验证或审查结论到达集成控制面时，当前设计没有要求携带代际，也没有规定低代际结果必须拒绝、隔离或仅供诊断。这样仍可能把已被新任务包或新依赖语义取代的产出纳入最终快照。
2. **P1：新最终事务依赖未进入宿主预检，且项目内最终留痕尚未闭合。** 最新方案依赖项目外不可变复验凭证、凭证摘要绑定和正式引用的 compare-and-swap/原子移动，但 capability preflight 表和 `project-probe` 没有验证这些能力，也没有规定不可用时进入 `manual-isolated` 还是 `blocked`。同时全局留痕协议要求验证和审查结论写入项目根 `.codex/verification-report.md`，设计却把最终复验结论只写入项目外凭证，并禁止提升后补写任何项目内验证留痕；当前快照只能预写 `verification_run_id`，不能包含尚未产生的最终结论。需要明确既不产生自引用、又能满足项目内最终结论留痕的可执行方案。
3. **上一轮 P0 已关闭。** 最终快照现已预先包含全部项目内真源和受门禁状态；独立凭证绑定 `verification_run_id`、最终摘要和预期基线；提升只允许 CAS/快进/等价原子引用移动，任何冲突、补写或基线变化都使凭证失效并重新复验。CR 002 的旧顺序也已同步修正。
4. **上一轮派发侧 P1 已关闭。** 集成控制面是代际唯一产生者，先持久化 `generation-advance` 墓碑并取得 `generation-ack`，之后才发送新代际任务；主对话持久化最高代际，恢复时先合并 `generation-snapshot`，可以在不读项目文件的情况下确定性拒绝低代际派发信封。

# 必须修改

- 把 `plan_generation`、`task_attempt`、任务包摘要和控制消息身份加入任务包、执行结果、候选验证、审查及最终复验信封；集成控制面在采纳任何结果前按持久化最高代际校验。低代际结果必须确定性标为失效并禁止驱动依赖、集成或正式状态，只能按规则保留诊断证据；恢复流程也要先合并代际再重放结果。
- 将“项目外不可变凭证存储、凭证读取与摘要校验、预期基线 CAS/原子引用移动、提升失败恢复”加入 `project-probe`、能力矩阵和 `full/manual-isolated/blocked` 决策。同步定义最终复验结论如何满足项目根 `.codex` 留痕：可以区分被复验内容与不可变验收元数据，但不能只存在项目外，也不能通过提升后改写已复验内容来伪装闭环；CR 002 需补充相应风险、成本和回滚。

# 证据

- 派发代际与墓碑闭环：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:180-219`；恢复顺序见 `:255-257`。
- 结果信封缺少代际：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:164-174`；状态规则仅明确墓碑优先于低代际 `dispatch-ready`，见 `:263-266`。
- 最终事务已闭合上一轮 P0：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:272-285`；CR 同步见 `docs/change-requests/002-main-conversation-agent-orchestration.md:53-57`、`:90`、`:127-128`。
- capability preflight 未覆盖新依赖：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:29-55`；项目外凭证和 CAS 新依赖见 `:278-283`。
- 项目留痕协议要求：`/Users/ling/.codex/project-codex-traceability.md:22`、`:76-82`；开发工作流收口要求见 `/Users/ling/.codex/codex-development-workflow.md:14-20`。
- CR 风险和验证成本当前覆盖到派发墓碑与提升后补写，但未覆盖项目外凭证存储/CAS 能力不可用及项目内最终结论留痕：`docs/change-requests/002-main-conversation-agent-orchestration.md:120-148`、`:169-173`。
- 路线门禁保持正确：`docs/change-requests/index.md:3-6`；`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:334-345`。
- 本地输入断言：`REREVIEW2_INPUT_ASSERTIONS_OK`；审查包写入后复核 JSON、四段结构、文件范围和 `git diff --check`。
