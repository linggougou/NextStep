# 结论

`PASS`，L2 评分 `98 / 100`。P0 = 0，P1 = 0，P2 = 1。

第二次复审剩余的 2 个 P1 和 1 个 P2 均已关闭，未发现范围、上游契约或证据生命周期回归。该结论仅表示 S4 技术架构候选具备提交用户会签的条件；候选仍为待会签，不开放 P3、P4 或编码。

# 为什么

1. 宿主副作用已收敛为 Adapter 接收端原子 `create-or-return(effect_key, fence_token, payload_digest)`：同一临界区校验最高 fence、按稳定键创建一次或返回原任务 ID，并明确拒绝旧 fence、同 fence 不同 payload 和无法证明原结果的请求；非原子“先查询、后创建”不算幂等，能力不足禁止 `full`。旧 claim 迟到、新 claim 接管和 ack 丢失恢复均有对应协议与故障注入，第二次复审 P1-1 已关闭。证据：`s4-technical-architecture.md:353-358,514-516`。
2. Verification Credential 与 Anchor Proof 的最终摘要路径使用 no-replace 原语发布：临时文件 exclusive-create、文件刷盘、`RENAME_NOREPLACE`/hard-link install、父目录刷盘、临时名清理后再次刷盘，以及目标已存在时逐字节校验均已明确；平台缺少 no-replace 或目录持久化保证时 fail closed，第二次复审 P1-2 已关闭。证据：`s4-technical-architecture.md:423-434,521-522`。
3. `formal-promote` 在 expected-old CAS 前强制验证审计锚是旧正式基线的后代并满足快进，首次初始化是唯一无前驱例外；逻辑命令契约和非后代故障注入同步覆盖，第二次复审 P2 已关闭。证据：`s4-technical-architecture.md:436-447,503,524-525`。
4. `Stage`、Interaction Source 追踪、005 必需模型、008 五类门禁和 009 强制输入仍完整；正式 ref 不检出到编辑工作树，dirty/staged/untracked 用户内容不会被正式提升覆盖。证据：`s4-technical-architecture.md:179-225,241-267,401-421,449-460`；`005-stage-document-contracts.md:98-127`；`008-downstream-interaction-product-acceptance-contract.md:72-110`；`009-s4-technical-input-supplement.md:47-125`。
5. 项目外凭证、项目内审计锚、独立 Anchor Proof 和正式 ref CAS 的生成顺序未形成 Git 对象自引用，也没有提升后项目内补写；证据保留、缺失/篡改和基线变化均 fail closed。证据：`s4-technical-architecture.md:423-447,484-488`。
6. 修订未引入常驻服务、数据库、独立编排平台或 Project Provenance Store，也未写入版本、里程碑、开发任务、代码实现或发布计划。证据：`s4-technical-architecture.md:34-43,533-562,578-599`；`PROJECT_ROUTE_LOCK.md:32-42,56-58`。

# 必须修改

## P0

无。

## P1

无。

## P2

1. 实现期建议把“更高 fence 但同一 `effect_key` 携带不同 `payload_digest`”作为单独的 identity-conflict 用例，明确只能恢复完全相同的宿主副作用，不能因 fence 更新而接受语义变化。当前协议已通过稳定 effect key、payload digest、原结果证明和同代际身份冲突形成约束，因此不阻塞 S4 会签。证据：`s4-technical-architecture.md:355-357,374,516`。

# 证据

- 固定候选：`/tmp/nextstep-s4-rereview2-input/s4-technical-architecture.md`，SHA-256 `68d90c936ae1c842949322647dc362923fcb2505f4d5dd90f7f469a3d8c16e30`，与复审 brief 一致。
- 固定上游：`/tmp/nextstep-s4-rereview2-input/005-stage-document-contracts.md`、`008-downstream-interaction-product-acceptance-contract.md`、`009-s4-technical-input-supplement.md`、`s3-skill-interaction-source.md`、`PROJECT_ROUTE_LOCK.md`。
- 上轮结论：`.codex/reviews/s4-technical-architecture-rereview-2026-07-14/verdict.md`，`REVISE / 90`，P0 = 0，P1 = 2，P2 = 1。
- 修订差异只涉及接收端原子 fencing/idempotency、凭证 no-replace/刷盘、正式 ref 后代/快进检查及对应故障注入；固定候选差异格式检查无空白错误。
