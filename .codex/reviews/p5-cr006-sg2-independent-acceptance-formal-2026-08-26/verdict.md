# 结论

`PASS / 99`。固定候选 `a348029016638c4e619c4cb90c2511cac8615e7e` 通过 SG-2 generation 5 attempt 1 的唯一正式 package acceptance；P0/P1/P2 为 `0/0/1`。

本结论只表示 SG-2 只读项目状态投影 package 可用。它不表示 PC-12、V2、V4、P5、`full` host 或 formal promotion 完成，也不授权 user-signoff。

# 为什么

- 验收 packet、dedup、subject digest 独立复算完全匹配；实现 ACK `46ec6a66...` 之后的验收 `packet -> claim/fence 121 -> unique host ACK` 均为单父链，当前 ACK 为 `08841982204814cfbeda28c5297ac30745d57cfd`。
- 候选 commit/tree/parent 精确为 `a348029` / `fe43d55` / `044937f`，真实写集恰为八条 SG-2 allowlist：schema 1、adapter 1、cli 1、domain 1、tests 3、fixture 1；没有依赖、control/formal、项目配置或其他生产路径变更。
- 预算恰好压线但未越界：生产与 Schema `4 文件 / 440 行`，测试与 fixture `4 文件 / 460 行`，新增运行时依赖 `0`。
- 独立 acceptance worktree 中，定向测试为 `15/15`；全量 `corepack pnpm check` 为 `493/493`，失败、跳过、取消、todo 均为 `0`，覆盖率 Lines/Branches/Functions=`93.41/88.35/99.19`。
- live smoke 对真实 control worktree 的 `next_stage` 进行了只读验证：文本里含有隔离验收与 `fence 121` 语义时，CLI 没有做猜测式脱敏，而是直接返回 `status=unavailable`、`next_action=null`，stdout/stderr 都没有泄漏 `claim/fence`。
- 唯一 P2：首次 RED 终端输出没有内容寻址固化；本评审只能结合父提交缺少 SG-2 八路径、测试绑定关系和后续 GREEN 结果来确认 RED 先于实现存在。

# 必须修改

无。`required_fixes=[]`。

下一步只允许主控固化独立 immutable Result、将候选与评审按正确顺序整合到 `main`，并同步 route/docs/log；不得把本 PASS 扩大为 V2、formal 移动或 P5 完成。

# 证据

- Subject：`a348029016638c4e619c4cb90c2511cac8615e7e`；tree=`fe43d550abf7d1fe8bfbbe01a68e4cc53ea0b38e`；parent=`044937fd8f73cd42e60d0b7ad5321dfecce040f5`。
- Acceptance packet：`sha256:027e0e436b597280e92b8e15e7312b12925cc862cdcd4b0842e1af085d32a72c`；dedup=`sha256:cae525b7024dae7e5db0b06a0126c96d4cc81188682598d69a1f354943777645`；subject digest=`sha256:c9c521ed16f18f72146cfac1e8eda50590b8e54ef4d4701c5f77de3eff8a4fa5`。
- Control：implementation ACK=`46ec6a66ae8ff6bc2cf97a45731415b5091e2807`；acceptance packet=`cc0b8597e2545c5452d9dd2aa1b28091a01d55ef`；claim=`de4059145b8630fbd61b492229f45ded4a51620f`；ACK=`08841982204814cfbeda28c5297ac30745d57cfd`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- 验证：`corepack pnpm build && node --test dist/tests/domain/project-status-projection.test.js dist/tests/adapters/node/project-status-source.test.js dist/tests/cli/project-status.test.js` 为 `15/15`；`corepack pnpm check` 为 `493/493`；`git diff --check` 通过；live smoke `node dist/src/cli/project-status.js --project-root /private/tmp/nextstep-sg2-control-IyGkOE` 返回 `PROJECT_STATUS_UNAVAILABLE:unproven-next-action` 且输出不含 `claim/fence`。
