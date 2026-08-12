# 结论

`REVISE / 92`。项目整体没有跑偏，上一轮 `REVISE / 75` 的四项必改已关闭；但 CR-005 仍有一处 formal 推进与失败恢复的硬冲突，当前不能批准实施，也不能启动 generation 4。

# 为什么

generation 4、S1.2 先行完整正式提升、Product Definition 2.0、legacy 1.0 拒绝和消费者迁移已经明确。control 仍为 `9230a79d...`、`plan_generation=3`，generation 4/attempt 3 均未授权；formal 仍为 `f3fdd265...`。`git diff --check`、JSON 和变更 Markdown 链接检查均通过。本轮文档未改生产代码，沿用最近 HEAD 的 `123/123` 证据合理。

剩余冲突在 CR-005 自身：第 8 节要求 S1.2 完成 formal promotion 后读取新 formal 作为 S1.3 baseline；第 11 节却称完整新链通过前 formal 保持 `f3fdd265...`，并在新链失败时保留该旧值。若 S1.2 已正式提升而 S1.3 失败，这两种状态无法同时成立。按现有 P4 机制，formal 应单向推进，不能为了恢复 S1.3 而回退已完成的 S1.2 promotion。

# 必须修改

把 formal 写成明确的两段式单向推进：S1.2 promotion 前保持 `f3fdd265...`；S1.2 promotion 后指向 S1.2 新锚并作为 S1.3 baseline；S1.3 失败时停留在该 S1.2 formal；S1.3 通过后再推进到 S1.3 新锚。同步修正 CR 第 2、8、11、13 节，避免任何“完整新链通过前 formal 不变”或失败后回到旧 formal 的表述。

# 证据

- `docs/change-requests/005-product-definition-semantic-contract-gap.md:170-174`：S1.2 promotion 后读取新 formal，再执行 S1.3。
- `docs/change-requests/005-product-definition-semantic-contract-gap.md:217,221`：完整新链通过前保持旧 formal，失败时保留旧 formal。
- `docs/design-docs/p4-execution-mechanism-design.md:91-94,168`：基线变化提高 plan generation，任务身份必须绑定 formal baseline。
- `refs/nextstep/control=9230a79d...`，`refs/nextstep/formal=f3fdd265...`；未授权、未启动、未移动。
