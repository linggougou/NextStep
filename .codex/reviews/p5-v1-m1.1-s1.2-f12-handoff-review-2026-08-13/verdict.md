# 结论

`REVISE / 84`，P0/P1/P2 = `0/2/0`。S1.2 已正式提升到 F12，这一核心结论通过；返工仅针对 F12 到 S1.3 的交接，不要求重做 Audit Anchor、Anchor Verification、Proof 或 CAS。

# 为什么

formal 当前精确指向 `8540763a9719cda5c5632b68bb770c95f0ceaecf`。promotion 回执记录 expected-old=`f3fdd265...`、CAS success 和 observed F12；control `62b78f03...` 将 S1.2 标为 `formally-promoted`。Anchor Verification、项目外 Proof、Credential 和 219 条受保护路径绑定均可复核，S1.3 generation 4 packet 未创建，S1.4 未启动。对方关于 S1.2 完成和 S1.3 实施范围的主体描述属实。

当前不能直接启动 S1.3：路线锁、README、PLANS、PRODUCT_SENSE、QA index 和活动计划仍写“等待 Final Content Snapshot / formal F0”，与真实 F12 冲突。main 仍在 `1fc2eb42...`，且工作区含两个 tracked 文件的锚后增量和多份未跟踪审查证据；直接执行 `git merge --ff-only refs/nextstep/formal` 会中止，不能把“妥善处理”留作未定义动作。

# 必须修改

1. 保全当前所有锚后审查证据及 `operations-log`、`verification-report` 的锚后增量；随后将 main 以 `ff-only` 同步到 F12，再恢复这些锚后内容。不得重建或改写 `8540763...`。
2. 将路线锁和全部状态入口统一更新为 S1.2 已 formal F12、S1.3 generation 4 仅规划且 packet 未创建、S1.4 未启动。
3. 将上述内容作为独立的锚后状态同步提交；确认 formal/control 未移动且工作区干净或只有明确列出的用户改动后，才允许生成 S1.3 packet。

# 证据

- formal：`8540763a9719cda5c5632b68bb770c95f0ceaecf`
- control：`62b78f035df2512ba35560a67aa3b200737ec52c`
- promotion：`sha256:bbbc068e5ed1963be2c12d5c5c86f7911485f3923bbaf784e67c846013fdfd7d`
- Anchor Verification：`sha256:e92c75f70a00479094acadff845dbfe25344b317a349d9079eaaf8097878c3c3`
- Anchor Proof：`sha256:0e073010540db26b75aace463c704c4d1f7138c359b675eada217d00cdb832e8`
- main：`1fc2eb42f1d399df1aa37eec244f3229a123af89`，是 formal 的直接父提交。
