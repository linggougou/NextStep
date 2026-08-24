# V1 累计验收 Generation 1 计划评审

## 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。计划候选完整承接 V1 累计验收入口，但本评审不授权生成 packet、改变 control 或执行正式验收。

## 为什么

- F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad` 的 tree、parent 与三元组 JCS digest 独立复算匹配；入口 control `a99593f940c6f38fba2147fc9b2c5bb5594c93a7`、plan_generation=4、pending=0 与路线锁一致。
- 计划冻结 PC-01..08、十二个适用 TG、I/X/P/Profile 和三个目标项目，并要求每个项目在同一 exact-F16 隔离上下文中重新跑通 S1.1→S1.6；历史 M1.1/M1.2 Result 仅为 `entry_evidence_only`，不能拼接为 V1 PASS。
- Q1/Q2/Q3/Q6=100%、Q11=20/20、474/474、覆盖率不低于 93.41/88.84/99.15、write 13/13、架构负例 15/15、rollback 5/5 均有机器证据槽；完整 fail-closed 并集要求稳定 ID、预期阻断阶段、实际结果与证据摘要。
- M1.1 的三项 P2 被完整继承：manual-isolated/headless 不证明 trusted-host/full 或真实用户动作；因果顺序以 control Git 父链为准；长驻 trusted-host session registry 的生命周期与容量上界仍未证明。
- V1 Result、报告、用户会签和最终 control CAS 被分离为独立门禁；formal 必须保持 F16，V1/P5 未完成，V2 未授权。

## 必须修改

- 无。
- 唯一 `next_allowed_action`：`REQUEST_OR_WAIT_FOR_NEW_EXPLICIT_CONTROL_AUTHORIZATION_TO_GENERATE_FIRST_V1_PACKET`。在新的明确控制授权到达前，只能请求或等待该授权；不得自行生成首次 V1 packet 或任何 dedup/ready/outbox/claim/fence/ack/Result，不得派发、移动 formal/control、宣称 V1/P5 完成或授权 V2。

## 证据

- 评审 subject：`556e17d8eeb5e5e6f56f2a56f55d0d0c3b95f10f`，tree `66ebd95677e2c303355f415797789adfcf816854`，parent `d9bd61f80875fa3716f0004d6bfe34d70bc01300`。
- 计划候选：`.codex/exec-plan-v1-cumulative-acceptance-generation-1.md`。
- 入口裁决：`.codex/reviews/p5-v1-cumulative-acceptance-entry-evaluation-2026-08-24/scorecard.json`。
- 路线与阶段真源：`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、`docs/exec-plans/active/p5-product-implementation-milestones.md`。
- 只读 control：`a99593f940c6f38fba2147fc9b2c5bb5594c93a7:checkpoint.json` 与 `registry.json`。
