# S1.6 入口评估结论

## 结论

`PASS / 95`。F15 `7169e9b019fe2213ca76babb4122a84760bdf112` 与 control `b6b5e2f4ed559cad8f0bea4e962ea308f88c7f96` 的入口依赖成立，路线锁、活动计划和 S1.6 候选对 `PC-08`、`TG-05/17/19`、`S4 §18 + 009 §7` 的边界一致。当前可以继续推进到“计划冻结与 packet 准备”，但还不能直接编码或派发。

## 为什么

- 候选把 S1.6 精确限定为技术架构读取、20/20 风险承接与回滚入口行为证据，没有偷跑到 Web/UI、真实宿主、`full`、P4 API/Schema 冻结或 formal promotion 产品能力。
- 首批 RED、三路互斥 worktree、共享文件归属、CV/I-X-P/L3/FV/AV/F16 门禁链都已写明，且顺序正确：entry review 与 packet/control CAS 前不得编码或派发。
- `manual-isolated` 与 `headless` 边界被保留，三类 fixture 只证明 consumer contract，不冒领真实宿主、真实 host bootstrap/probe 或 `full` 支持。
- 用户未跟踪的 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md` 已被明确保护，不会被吸入 packet、snapshot 或清理动作。

## 必须修改

- 先把 `required_field_bindings` 冻结成与 `005 §4.2` 精确一一对应的十个 machine keys；packet、schema 与 CV 对缺失、额外、错拼、别名全部 fail closed。
- 先把 `risk_bindings` 冻结成精确 20 项 allowlist：`S4 §18` 的 19 条风险/假设逐项命名，加上 `009 §7` 的“归档失败”；missing、duplicate、unknown、source 错绑都必须拒绝。
- 先把 `rollback_entries` 冻结成精确 5 项枚举，并补齐 `terminal_state`、`next_action`、`proof expectation`，至少覆盖停止自动写入/进入 Change Request、`manual-isolated`、`blocked`、待正式提升、待归档。

## 证据

- 候选计划：`.codex/exec-plan-s1.6-generation-1.md`
- 路线锁与当前状态：`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、`docs/exec-plans/active/p5-product-implementation-milestones.md`
- 上游口径：`docs/exec-plans/completed/p3-version-and-milestone-breakdown.md`、`docs/product-specs/005-stage-document-contracts.md`、`docs/architecture/s4-technical-architecture.md`、`docs/architecture/009-s4-technical-input-supplement.md`、`docs/design-docs/p4-execution-mechanism-design.md`
- control 入口状态：`b6b5e2f4ed559cad8f0bea4e962ea308f88c7f96:checkpoint.json`，其中 `formal_oid=7169e9b...`、`pending_dispatch_messages=[]`、`next_stage="S1.5 formally promoted as F15; evaluate S1.6 entry"`
