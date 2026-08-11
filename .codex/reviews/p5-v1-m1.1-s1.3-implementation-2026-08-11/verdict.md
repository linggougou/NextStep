# 结论

`REVISE / 72`。P0 = 0，P1 = 4，P2 = 1。固定候选不得进入 Final Content Snapshot。

# 为什么

候选身份、formal ancestry、L3 packet、originating packet、execution/CV/I-X-P 摘要、13 条 changed paths 和 allowlist 均复算匹配；disposable clone 的 `pnpm check` 通过 113/113，覆盖率为 90.97% / 82.87% / 98.11%。

但独立反证证明四项 P1：目标 A 的 start 可为目标 B 的 complete 提供全局状态，B 随后取得伪完成指标；confirm 后的 cancel 或新 display 不会使旧 session 失效；同一 scenarios fact 可同时承担五个产品角色；Skill frontmatter、阶段守卫和项目阶段真源仍不允许进入 S1.3。既有 CV 与 I/X/P 没有覆盖这些边界。

# 必须修改

1. 建立会签当前状态和吸收终态，失效 reject/cancel/expiry/view-change 前的旧 confirm session。
2. 将旅程状态连续性绑定 semantic_source，并让指标引用同来源的完整合法完成链。
3. 防止产品角色坍缩，补充产品特定动作与结果，而不是仅用 start/complete 和状态词充当用户旅程。
4. 修正 Skill 的 S1.3 触发与阶段守卫，并由主管同步路线锁、PLANS 和 P5 活动计划。
5. 把负例 fixture 变成实际回放输入，固定上述反证后重新执行 CV、I/X/P、Skill validator 和 L3。

# 证据

L3 packet 摘要为 `sha256:609d6df7e4de29af9e49da289f86c21bd1d4fc6a25cf09314599adaa17933047`；originating packet、execution、CV、I/X/P 与 subject 摘要均匹配。跨来源完成探针返回 accepted；confirm 后 cancel 与 view-change 探针仍可签署；正例 role-reuse 统计为同一 pointer 使用 5 次。独立官方 Skill validator 未完成，按 skipped 处理。
