# 结论

`PASS / 99`。固定候选 `989ba2fcd75f0466239e1957c880e6a0ce4b1b83` 通过 SG-2 generation 5 attempt 7 的唯一正式 package acceptance；P0/P1/P2 为 `0/0/1`。

本结论只表示 SG-2 项目状态当前任务选择修复与只读投影 package 可用。它不表示 PC-12、V2、formal promotion、P5 或 `full` host 完成，也不授权 user-signoff。

# 为什么

- packet、dedup、subject、execution Result、attempt6 Result 的 RFC8785 摘要均独立复算一致；控制链 `d403cfa -> 5d7da27 -> 16738fc -> 2c1bb7d -> 57bf49c` 为单父闭合，fence 固定为 `128`。
- 候选 `989ba2f` 相对父提交 `8842e02` 的真实写集精确为两条允许路径：`src/domain/project-status-projection.ts` 与 `tests/domain/project-status-projection.test.ts`；formal/control 在验证前后保持 `ea04b57` / `57bf49c` 不变。
- 修复正确关闭了回归：较旧 sibling 的未知状态不再抢先污染更新的当前任务；但当被选中的当前任务状态本身未知时，投影仍返回 `unknown-status` fail closed。
- 定向验证为 `16/16`；全量 `corepack pnpm check` 为 `494/494`，`fail/skip/cancel/todo=0/0/0/0`，覆盖率 Lines/Branches/Functions=`93.44/88.38/99.19`。
- live-shaped smoke 通过两条关键分支：敏感 `next_stage` 返回 `status=unavailable`、`next_action=null`、`reason=next-action-sensitive` 且不泄漏 `claim/fence/绝对路径`；被选中的当前任务设为未知状态时返回 `unknown-status`。
- 唯一 P2：RED 阶段只有 execution Result 中的摘要化 observed 说明，没有把首次失败命令的原始终端输出固化成独立 immutable transcript。

# 必须修改

无。`required_fixes=[]`。

下一步只允许主控固化 immutable Result，并按正确顺序收敛 route/docs/state；不得把本 PASS 扩大为 user-signoff、formal 移动、PC-12、V2 或 P5 完成。

# 证据

- Subject：`989ba2fcd75f0466239e1957c880e6a0ce4b1b83`；tree=`18de6e08c8617961e0c710d74e86e35193e203a6`；parent=`8842e025088ba6a217fa098c82d788a5d603ef3d`；subject digest=`sha256:54a7bb97c2f8cf1459ac6362312ac85695fa7b629334c55829aaa00d213e567d`。
- Packet：`sha256:f58f4a616e1665562aacc4e244801b56a1544c5b5433c148b0adc5db88bb48c2`；dedup=`sha256:e9ebe4af95981d5fe67425a58fdc3895d9400e223ad86e5201640ce76f5bb9d6`；execution Result=`sha256:7fede5869f27f843a40d8f7877046d44f60e505d37f496523d9a7fffa896ce16`；attempt6 Result=`sha256:8e79a7642dce9edc8357790c63a8a477e1582b4b92ccd91d090192374296a2fa`。
- Control：packet=`5d7da2782179ab185fc3ac09735acd0bc6cbadbe`；claim=`16738fc1de1db9c59fd8777c004bdf178f8e3fde`；ready=`2c1bb7d265a2a7309eb385f2ef0070dc88617721`；ACK=`57bf49c7ca65828c0002553ec80412238c42943f`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- 验证：`corepack pnpm build && node --test dist/tests/domain/project-status-projection.test.js dist/tests/adapters/node/project-status-source.test.js dist/tests/cli/project-status.test.js` 为 `16/16`；`corepack pnpm check` 为 `494/494`；`git diff --check` 通过；live-shaped smoke 两条分支分别返回 `next-action-sensitive` 与 `unknown-status`，输出均未泄漏敏感值。
