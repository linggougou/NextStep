# 结论

`REVISE / 74`。P0 = 0，P1 = 3。

P3 候选当前不具备用户会签条件。保持 P3，禁止归档活动计划、切换 P4、进入 P5 或编码。

# 为什么

1. V1/V2、大里程碑和小里程碑把现有需求、PRD、版本表、里程碑表等手工真源产物列为未来版本输出，却没有明确要求“可运行的 NextStep 能力 + 目标项目 fixture + 产品行为证据”。这会允许后续用本仓库已有文档误判 PC-01..PC-13 已交付。
2. Acceptance Profile 的适用性应由目标项目已接受路线决定，独立验收任务只能提供证据。当前冻结表与验收矩阵又把 NextStep 自身交付对象标成 `UI 条件`，存在错误向 headless 的 NextStep 索要 UI 证据的路径。
3. 既有 L3 审查包声明扣 5 分却未计入总分，且缺少 L3 强制的 Anti-Slop Judge，不能支撑“独立规划审查已通过”的状态事实。

# 必须修改

1. 重写 V1-V4、9 个大里程碑和 18 个小里程碑的交付物/DoD/证据口径：现有项目文档只作为 bootstrap 输入；版本完成必须证明 NextStep 能在目标项目 fixture 上可运行地产生、校验、阻塞、恢复和验收对应能力。
2. 拆开两层验收：NextStep 自身当前路线固定 `I/X/P`；Acceptance Profile 用 `headless`、含 UI、路线冲突三类 fixture 验证条件规则。UI 设计真源和还原证据是含 UI 目标项目的外部输入，不是 NextStep 自身交付物。
3. 修复后重新生成 L3 独立审查包：计分可复核，包含 Generator、Verifier、Strict Judge、Anti-Slop Judge、Chief Reviewer，绑定固定摘要和行级证据；再同步 P3、路线锁和 PLANS 状态。

# 证据

- 产品交付物混淆：`docs/exec-plans/active/p3-version-and-milestone-breakdown.md:232-235,249-257,263-280`
- Acceptance Profile 混淆：`docs/exec-plans/active/p3-version-and-milestone-breakdown.md:150,157-173,203-212,291,299-316`
- 评分算术：`.codex/reviews/p3-planning-review-2026-07-15/scorecard.json:84-99`
- L3 角色契约：`/Users/ling/.codex/skills/judge-harness/references/review-core.md:17-23`
- 新鲜复核：`P3_FRESH_COUNTS_OK pc=20 major=9 small=18 metrics=12 matrix=14 versions=5`、`P3_FRESH_FORMAT_OK`、`P3_FRESH_STATUS_GATE_OK`
