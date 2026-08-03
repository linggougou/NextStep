# S4 技术架构独立复审任务

## 任务目标

对 `docs/architecture/s4-technical-architecture.md` 执行独立 L2 技术复审。只审查，不修改候选正文、已会签真源、路线锁或计划。

## 必读材料

- `docs/architecture/s4-technical-architecture.md`
- `docs/product-specs/005-stage-document-contracts.md`
- `docs/architecture/009-s4-technical-input-supplement.md`
- `docs/design-docs/s3-skill-interaction-source.md`
- `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`
- `PROJECT_ROUTE_LOCK.md`
- `.codex/reviews/project-provenance-design-2026-07-14/verdict.md`

## 已知边界

- NextStep 保留原产品闭环：主对话引导与扁平分派，独立 Agent 开发/测试/评估/审查/集成，文档真源、阶段门禁、任务包和验收闭环。
- 后来新增的长期 Agent 贡献溯源与按 Agent 回退能力已经排除；不得要求把 `Project Provenance Store` 加回本项目。
- 当前推荐为轻量架构：Skill + TypeScript/Node 按需工具 + JSON Schema + Markdown/JSON/Git 真源；无常驻服务、数据库或独立编排平台。
- 当前是 S4，不得冻结 P3 版本、里程碑、具体开发任务或发布计划。

## 自查证据

- 断言输出：`S4_ARCHITECTURE_SELF_CHECK_OK`。
- 自查期间补齐：`Write Transaction`、`Capability Preflight` 数据对象；低代际结果统一为 `stale-result`。
- `git diff --check` 通过。
- 送审候选 SHA-256：`26d66146c2a44d6e958d5c7c3775a68f838d08884decd083c62b9cbbeaa263c6`。
- 冻结只读副本：`/tmp/nextstep-s4-review-input/`。

## 重点审查

1. 是否完整满足 005 的 S4 必填字段和 009 的对象、能力、必答问题及风险验证。
2. 轻量文件台账、不可变最终快照、项目外凭证、审计锚和 CAS 是否形成无循环、自洽、可恢复的技术闭环。
3. 主对话/集成/执行职责是否可在 Codex 原生扁平调度下实现，是否错误假设宿主能力。
4. TypeScript/Node、JSON Schema、Markdown/JSON/Git 的裁决是否有充分理由，备选与回滚是否成立。
5. 是否偷跑 P3/P4 实例、重新引入 Provenance Store、复杂多 Agent 平台、数据库或常驻服务。
6. 权限、敏感信息、用户改动保护、脏工作区、冲突、部分写入、只读验证和最终提升是否存在 P0/P1。
7. 文档是否过度设计、存在重复真源、未定义术语、内部矛盾或不可验证承诺。

## 输出要求

在 `.codex/reviews/s4-technical-architecture-2026-07-14/` 写入：

- `verdict.md`
- `scorecard.json`

使用 `judge-harness` L2 契约，最终结论只能为 `PASS`、`REVISE` 或 `REJECT`。发现问题时按 P0/P1/P2 排序，必须提供精确文件行号和可执行修复。无 P0/P1 时明确写出。最终回复只返回结论、分数、P0/P1 摘要和产物路径。
