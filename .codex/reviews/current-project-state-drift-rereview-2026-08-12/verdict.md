# 结论

`REVISE / 75`。上次 `REVISE / 66` 的四个方向性问题已经基本关闭，项目没有继续跑偏；但修订版 CR-005 仍不能授权实施，也不能启动所谓 generation 3 attempt 3。

# 为什么

非目标五态、澄清五态、工作日提醒的 S1.2 字段归属和候选前累积门已经明确，README/QA/当前阶段也已同步。control `1e8892ab...` 正确记录 `attempt_3_authorized=false`，formal 保持 `f3fdd265...`；当前 `pnpm check` 为 `123/123`。

剩余问题集中在实施协议。CR-005 要求重建两类 S1.2 版本并明确旧 S1.2 credential/promotion 不得复用，却仍把下一任务叫作 S1.3 attempt 3，也没有要求 S1.2 新版本先走完 CV/I/X/P/L3/最终复验/Anchor/formal promotion。该范围已改变冻结任务输入与依赖，按 P4 必须推进新 plan generation，先闭合 S1.2，再从新的 formal baseline 生成 S1.3。

同时，`prd.non_goals` 将从事实数组变成 `status/items/source` 对象，这是 wire contract 破坏性变化。当前运行时只支持 `schema_version: 1.0`，修订版尚未明确精确 JSON 形状、版本号、旧版处理和 machine-receipt/CLI/Skill/fixture 迁移，不能直接修改生产 Schema。

# 必须修改

1. 获批后推进新的 `plan_generation`，先创建并完成 S1.2 上游修复及完整正式证据链；再以新 formal baseline 生成 S1.3 任务，不沿用 generation 3 attempt 3。
2. 明确 `non_goals` 精确 JSON 结构和版本策略：保持 1.0 兼容或升版二选一，并覆盖旧版拒绝/迁移、machine receipt、CLI、Skill 和 fixture。
3. 将关闭条件写成 `S1.2 新版本正式提升 -> S1.3 新链正式提升 -> M1.1 attempt 2 -> 用户会签`，消除 S1.2 旧结论是否仍可复用的歧义。
4. 修正 PRODUCT_SENSE 的“当前交付物”，它仍指向不存在的 P3 active 计划。

# 证据

- CR-005 第 73-77 行要求重建 S1.2；第 116 行又明确旧 S1.2 promotion/credential 不得复用；第 111、131 行只明确 S1.3 正式链。
- P4 §9/§18 规定计划或冻结任务范围变化时提高 `plan_generation` 并重新生成任务包。
- `ProductDefinitionCandidate.prd.non_goals` 当前为 `ProductFact[]`，Schema `facts` 强制数组；`contract-version.ts` 只支持 `1.0`。
- `docs/PRODUCT_SENSE.md:95` 指向不存在的 `docs/exec-plans/active/p3-version-and-milestone-breakdown.md`。
- 当前 `pnpm check` 通过 `123/123`，覆盖率 `90.78% / 82.15% / 98.26%`；formal/control 引用核对通过。
