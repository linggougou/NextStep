# 结论

`REVISE`，独立 L2 评分 `87 / 100`，`P0 = 0`、`P1 = 1`。设计中的控制、恢复、独立复验与 S4 边界已完整迁移，显式上游也保持 `007 -> 008 -> S3 -> 009`；但唯一详细交互协议的真源切换未闭合，当前包仍存在两个可被解释为详细设计真源的文件，因此不满足职责唯一性硬门禁。

# 为什么

1. 007、008、S3 正文与 009 的字段覆盖和分层基本准确。007 只约束产品交互边界；008 定义五类独立结论并禁止集成 Agent 自批；S3 正文完整定义任务包、结果/控制信封、代际、墓碑、恢复、迟到/冲突结果、最终内容快照、项目外凭证、审计锚和 CAS；009 只把两阶段 preflight、三态结论、能力对象和风险验证留给 S4，未冻结实现。
2. 设计第三次复审关闭的 P0/P1 均在 S3 正文与 009 中保留。迁移材料没有把文档约束包装成真实 Codex 宿主能力验证；宿主组合能力仍需 S4 的 `host-bootstrap` / `project-probe` 证明。
3. 迁移计划明确 `docs/design-docs/s3-skill-interaction-source.md` 是“唯一交互协议真源”，该正文也明确控制信封、任务包、结果信封、代际/恢复和最终提升必须遵守“本文唯一详细协议”。但原设计稿状态仍为“独立复审通过，待迁移”，并继续自称 CR 002 的“设计真源”；CR 002 又将原设计稿标为“详细设计真源”。原设计稿仍保留同一套完整协议，且没有被明确降级为只读迁移来源/历史复审证据，造成当前协议职责重复和迁移状态冲突。
4. 四份正式材料仍为待会签，CR 002 为已迁移待复审，S4 未开始；迁移复审没有替代会签。该 P1 可通过状态与引用归属的小步修订关闭，不需要重写协议，因此结论为 `REVISE` 而非 `REJECT`。

# 必须修改

- 将 `docs/design-docs/s3-main-conversation-agent-orchestration-design.md` 明确降级为已迁移的历史设计/复审证据，并同步其状态与迁移章节；不得继续让它自称当前设计真源或待迁移材料。
- 将 CR 002 第 6 节的“详细设计真源”引用改为 `docs/design-docs/s3-skill-interaction-source.md`；原设计稿只能标注为迁移来源与历史复审证据。修订后重新检查所有“真源”“详细协议”“待迁移”引用，确保只有 S3 正文承载当前详细交互协议。

# 证据

- 唯一职责要求：`docs/exec-plans/active/s3-main-conversation-agent-orchestration-migration.md:24`、`:28`、`:51`、`:53`。
- S3 正文的唯一协议声明与完整覆盖：`docs/design-docs/s3-skill-interaction-source.md:202`、`:218`、`:233`、`:253`、`:279`、`:438`。
- 冲突状态与真源指向：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md:3`、`:353`；`docs/change-requests/002-main-conversation-agent-orchestration.md:3`、`:32`、`:107`。
- 上游与阶段门禁：`docs/design-docs/s3-skill-interaction-source.md:6`、`:13`、`:14`；`docs/architecture/009-s4-technical-input-supplement.md:6`、`:10`、`:11`、`:12`；`PROJECT_ROUTE_LOCK.md:43`、`:56`、`:70`、`:108`。
- 正式材料状态：`docs/product-specs/007-s3-skill-interaction-contract.md:3`；`docs/product-specs/008-downstream-interaction-product-acceptance-contract.md:3`；`docs/architecture/009-s4-technical-input-supplement.md:3`；`docs/design-docs/s3-skill-interaction-source.md:3`。
