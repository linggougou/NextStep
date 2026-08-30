# 结论

`PASS / 100`。P0/P1/P2=`0/0/0`，`required_fixes=[]`。

这次 attempt 6 的独立验收通过：冻结身份、ACK/control 单父链、packet/ready/outbox/Result 摘要、隔离 clone 边界、repair exact-two、累计 exact-eleven、targeted/Profile/full-check 与 scoped coverage 都完成了独立复核，而且此前缺 `verifyHost` / `verifyProject` 时会冒出原生异常的风险已经被修成稳定 fail closed。

# 为什么

- 身份与控制链都对上了：HEAD=`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a`，parent=`e92b5c778e154915bcdd926c2d506a48959e5b3e`，tree=`82a6adc6cacd6ac99f7196214633fe0b9487bdff`，formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`，ACK control=`d6726b695c52cb55499df97a2f8c7d9ec892d02d`，且 ACK 的唯一父就是 ready control `8bae9d92e81229fc7b0204c6e185c41f2c817dbc`。packet → claim → ready → ACK 的单父链可机械复核。
- 摘要与去重都能独立复算：packet digest=`sha256:e1f9727527244f1833cec91bfee38318ae6c7666e347d5b8ac9d83a9bc95266e`，dedup=`sha256:97b728a065b4d1d9a9a57148192c77755ee2d8612a2b7743a74677b9f214fb62`，subject digest=`sha256:1c8f587230a574a67f7b58fd4d68c8e0f3fbe9c32a74768bc4520a59cec66c3b`，execution Result digest=`sha256:9dbf9d3574d3f65800eafe5d526b7718d6d3f7bcd1f34dd35d8c6a7ab010f35f`，ready payload digest=`sha256:7c8e75d60c6c044d78cff3ae6252dd1e486f9974956694e5a1273dbea5887dbe`，并与 outbox payload_digest 一致，outbox 已闭合。
- 变更范围守住了：本次 repair 相对父提交精确只改 `src/domain/capability-preflight.ts` 和 `tests/domain/capability-preflight.test.ts`；累计实现相对基线 `6ce2fa0e2b957fc0fab49d5ee2d62c503b9cc478` 仍精确保持 packet 允许的 exact-eleven，没有额外产品写集，也没有新增依赖。
- 关键回归真正关掉了：我复现了“缺 `verifyHost` 或缺 `verifyProject`”这两个此前风险点。现在两种场景都稳定返回 `CAPABILITY_EVIDENCE_UNTRUSTED`，没有原生 `TypeError`，而且非预期 verifier 方法调用数保持 0，符合 fail-closed 目标。
- 验证结果满足门禁：S3.1 四模块 targeted `26/26` 通过；scoped coverage 总计 `91.31/83.98/97.37`；Profile targeted `20/20` 通过；完整 `pnpm check` 为 `581/581`；`git diff --check` 干净。

# 必须修改

无。

# 证据

- 冻结身份：`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a` / `e92b5c778e154915bcdd926c2d506a48959e5b3e` / `82a6adc6cacd6ac99f7196214633fe0b9487bdff`
- authority：`formal=ea04b57de83d6c548dcb1629b1f61832db8375ad`，`ACK=d6726b695c52cb55499df97a2f8c7d9ec892d02d`，`ACK parent=8bae9d92e81229fc7b0204c6e185c41f2c817dbc`
- packet / dedup：`sha256:e1f9727527244f1833cec91bfee38318ae6c7666e347d5b8ac9d83a9bc95266e` / `sha256:97b728a065b4d1d9a9a57148192c77755ee2d8612a2b7743a74677b9f214fb62`
- subject / result / ready digest：`sha256:1c8f587230a574a67f7b58fd4d68c8e0f3fbe9c32a74768bc4520a59cec66c3b` / `sha256:9dbf9d3574d3f65800eafe5d526b7718d6d3f7bcd1f34dd35d8c6a7ab010f35f` / `sha256:7c8e75d60c6c044d78cff3ae6252dd1e486f9974956694e5a1273dbea5887dbe`
- 边界：remote=0、无 alternates、node_modules 非 symlink、起始 clean
- 变更范围：repair exact-two；累计 exact-eleven
- 测试：targeted `26/26`、Profile `20/20`、`pnpm check` `581/581`
- 覆盖率：scoped total `91.31/83.98/97.37`
- 质量门：`git diff --check HEAD^ HEAD` 与 `git diff --check` 均通过
