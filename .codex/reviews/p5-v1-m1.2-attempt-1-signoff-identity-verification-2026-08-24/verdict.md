# M1.2 attempt 1 会签身份核验

## 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。`CAS_ALLOWED=true`：只允许以 `eaefc1b92f9248ae9d07562d3c1284e82c409202` 为唯一 expected-old 执行一次 M1.2 attempt 1 user-signoff control CAS；formal 必须保持 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`。

## 为什么

- Result 去除 `result_digest` 后独立 JCS 复算精确得到 `sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`，并绑定 M1.2 attempt 1、F16、plan_generation=4、PASS/100 与空 required fixes。
- 会签请求完整绑定 packet/dedup、claim/fence/ack、Result、报告 subject `6a80b8f...`、终审 commit `18178a7...`、报告与两份终审摘要；所有摘要独立复算匹配。当前评审 subject `cc4f4c1...` 与 `18178a7...` 具有相同直接父 `6a80b8f...` 和相同 tree `60b769b...`。
- registry/checkpoint 仍将 M1.2 标记为 `awaiting-user-signoff`、`not-completed`、`pending`，pending dispatch=0；M1.1 attempt 2 的正式完成和历史会签记录保持原样。
- 用户已明确表示“我确认并批准 M1.2 attempt 1 会签，授权执行 user-signoff control CAS。”该授权足以执行一次精确 CAS，但不授权移动 formal、重写历史证据、启动 V2 或宣称 V1/P5 完成。

## 必须修改

- 无。执行前必须再次原子比较 control 是否仍为 `eaefc1b92f9248ae9d07562d3c1284e82c409202`；不一致时 `CAS_ALLOWED` 立即失效，必须阻断、不盲重试并重新做独立身份核验。
- CAS 成功内容仅可登记本次用户批准、将 M1.2 attempt 1 固化为 formally-completed，并把下一步限定为单独评估 V1 的 S1.1-S1.6 累计验收入口；formal 仍须为 F16。

## 证据

- expected-old control：`eaefc1b92f9248ae9d07562d3c1284e82c409202`；`checkpoint.json`、`registry.json`。
- Result：`results/result-milestone-acceptance-m1.2-g4-a1-f112-20260824.json`，JCS digest `sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`。
- 会签请求：`messages/msg-user-signoff-request-m1.2-g4-a1-20260824.json`。
- 报告：subject `6a80b8fd8d701b37738f80eb482af330c79b51dd`，`docs/qa/p5-v1-m1.2-acceptance-attempt-1-2026-08-24.md`，raw digest `sha256:e98caaaf4e099bec95e8cebecab52cb0e723699eabb16a350245454093add7b0`。
- 会签包终审：`18178a7ef7e89f9274022be3b39a2884fec64049`；scorecard JCS `sha256:444b6c8a189cfc7225e564076d5483cd7134922b28f6d9fbaffbc45fa38b7eba`；verdict raw `sha256:c0a619437f924557dc91d81ff1796d36ad6c7a1c48e9cbe121abaf5bac7a46ea`。
