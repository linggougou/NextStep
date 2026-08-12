# 结论

`REVISE / 66`。项目主路线没有跑偏，但执行重心和 CR-005 的修复方向已经出现偏移。当前不应按 CR-005 原文批准 S1.3 attempt 3。

# 为什么

Skill 主载体、文档/Git 真源、P5 顺序和 S1.4 关闭状态都仍与路线锁一致；blocked、墓碑、未创建候选、control/formal 引用也可复核。技术问题不是虚构：现有 Schema 确实强制 `non_goals` 非空，领域规则确实允许 constraint 充当 non-goal，attempt 2 的新测试也没有独立绑定 S1.2 回放。

偏移发生在修复层。CR-005 尚未逐态裁决 `non_goal_gaps` 的 `identified/none/rejected/deferred` 产品语义，就直接建议把多种状态统一映射为 `non_goals=[]`；同时准备扩大 `clarification_gaps` 的下游来源资格，以承接实际是产品行为的“工作日早上提醒”。这可能把 S1.2 的字段归类或完成度缺口固化进 S1.3 v1 契约。

流程上也出现倒置。活动计划要求每个小里程碑运行累积回归，但 S1.3 已完成 122/122、L3 PASS/96、最终复验、Anchor Proof 和 formal promotion，M1.1 才发现三类 S1.2->S1.3 连续率为 0/3。27 个 review 目录和完整证据链没有在高成本提升前发现最小跨阶段问题，说明当前审计强度高于产品门禁成熟度。

# 必须修改

1. 修订 CR-005：逐态定义 `non_goal_gaps` 如何映射到产品定义，并明确哪些状态必须退回 S1.2；不能把 `none`、`rejected`、空值混成一个规则。
2. 裁决“工作日早上提醒”的上游字段归属。若它不是澄清缺口，应重建受影响的 S1.2 真源链，而不是全局放宽 `clarification_gaps` 的 activity/result/capability 来源资格。
3. 把三类 S1.1->S1.2->S1.3 累积回放和产品语义断言前移到 S1.3 候选形成前；通过后才允许进入 CV/I/X/P/L3 和正式证据链。
4. 同步 README、PRODUCT_SENSE 和 QA index 的当前阶段，消除与路线锁冲突的旧状态。

# 证据

- `refs/nextstep/control=d48b544aa3566d3e6a5bd985054301dfdc52326c`；`refs/nextstep/formal=f3fdd26542e5e562f0b01a9a716d3eb8b46cae36`。
- 当前 `pnpm check` 为 `123/123`，覆盖率 `90.78% / 82.15% / 98.26%`；`125/125` 是已 blocked、未创建候选的 attempt 2 暂存结果。
- PC-03 要求 PRD 含非目标且缺项不得进入原型；S1.3 DoD 要求目标用户、范围、非目标和成功指标齐全。
- M1.1 attempt 1 在 S1.3 正式提升后发现三类跨阶段连续率为 `0/3`。
- README 仍停在 P5-M0，PRODUCT_SENSE 仍停在 P3，QA index 仍称暂无代码测试。
