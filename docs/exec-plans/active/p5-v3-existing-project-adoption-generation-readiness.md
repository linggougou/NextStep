# CR-007 V3 Generation 2 代际准备与实时状态对齐

## 1. 目的与授权

- 用户最终批准 CR-007，接受候选 `36242fbb2e938225c438871ada0731e06b9c37a4` 与独立评审 `288c1ca0d92c7c1834a0c65bc2c4cb8efe86e504`。
- 本文只把该批准转换为 generation-advance/ack 的独立准备条件；不执行 CAS，不创建 packet/claim/fence/dispatch/Result，不编码，不移动 formal/control/main，不创建 genealogy-hub 或其他真实项目 refs。
- CR-007 的架构合同保持批准；本文只纠正 A8 之后发生的 live-state 时间漂移。

## 2. 固定审计事实

2026-08-30 准备复核观察到：

- main/working baseline=`6ce2fa0e2b957fc0fab49d5ee2d62c503b9cc478`；
- formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`；
- live control=`007467180e32a866cbb15eba98a6c79b93b34529`，唯一父=`6890040ce346038d368eb2b0d6097c1163dc96e2`；
- control 链共 791 个 commit：1 个零父根、790 个单父提交、无 merge；
- checkpoint `plan_generation=5`，最高尝试为 `S3.1=5`、`S3.1-I-X-P=5`；
- S3.1 acceptance attempt 5/fence 171=`revision-required`，Result digest=`sha256:fc3db53b61e8ecc1d2d31d7faa8bd278a08942ccbb58d44b85e77572426046a4`，review=`92c5891711c52d46573e709eca8c91a9f5525258`；
- S3.1 repair attempt 5/fence 172=`running`，packet digest=`sha256:ab90f8ce53f7e2949b19519946f29ad3632ee21543665a1ff5a341e6b0e361f0`，dispatch ACK accepted、outbox closed、execution Result 未持久化；
- repair worker candidate=`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a`，parent=`e92b5c778e154915bcdd926c2d506a48959e5b3e`，tree=`82a6adc6cacd6ac99f7196214633fe0b9487bdff`；其 581/581 自测只属于 worker 报告，不是独立验收。

以上 OID 是准备阶段观察值，不是 CAS 授权。live control 在先决处理后必然变化，因此 generation-advance expected-old 不得写成 `007467...`。

## 3. A8 结论的继续适用范围

- 继续适用：零父 genesis/单父 activation、业务 HEAD 不进入 control ancestry、adopted-baseline 与 version signoff 分离、可信进程内确认、expected-missing 双 ref 原子激活、fail-closed namespace、精确恢复/回滚、A3.0 与 S3.2 职责隔离。
- 不再作为实时依据：A8 关于“Generation 1 仍在 entry review、S3.1 尚未创建 packet/claim/dispatch/编码”的判断。
- 这是一项时间快照失效，不撤销 CR-007 的架构批准，也不把 A8 的历史 PASS 改写为 REVISE。

## 4. 唯一推荐的先决路径

优先采用路径 A，保存已经完成的 repair candidate，同时补齐正式证据链：

1. 另行授权并以最新 expected-old 固化 S3.1 attempt 5/fence 172 execution Result；
2. 创建唯一 S3.1-I-X-P attempt 6，使用新 claim/fence 与角色隔离 reviewer；
3. fresh 独立验收必须 PASS，随后完成必要集成与 control gate；
4. 对 CR-007 与 S3.1 做 compatibility audit，绑定 accepted subject、execution Result、acceptance review 与最终 Generation 2 plan digest；
5. 完成上述步骤后重新读取 formal/control/registry/checkpoint，才可生成精确 generation-advance proposal。

备选路径 B 只在用户明确拒绝收口 Generation 1 时使用：使当前 running attempt/fence 失效并留 tombstone，在 Generation 2 重跑 S3.1。路径 B 不能继承 worker 自测、REVISE 或 running 证据，也不在本次批准范围内。

## 5. Future generation-advance 字段约束

准备阶段可冻结语义，不能冻结运行时 OID：

- `plan_id=p5-product-implementation`、`route_generation=1`、全局 `plan_generation=5` 保持；V3 子计划 `1 -> 2`；
- CR、设计、计划、独立评审身份必须显式绑定；
- S3.1 在路径 A 下先登记 `carry-forward-pending`，只有 compatibility audit 与 generation-ack 后才成为显式 carry-forward；路径 B 下登记 rerun，不得伪装承接；
- S3.2..S3.5 当前没有 Generation 1 packet，登记 `superseded-before-packet`，不伪造 tombstone；
- formal 不移动；advance 与 ack 均为独立单父 expected-old CAS；
- advance `control_expected_old_oid` 必须是先决链完成后的 fresh live control；
- `does_not_authorize` 至少包含 A3.0 packet、claim/fence、dispatch、编码、真实项目 refs、formal movement、V3/P5 completion。

## 6. Future generation-ack 字段约束

- expected-old 必须精确等于 generation-advance control OID；
- 绑定 generation-advance message id/digest/control OID；
- 明确 S3.1 的最终 `carry-forward` 或 `rerun` 裁决与证据身份；
- 明确 S3.2..S3.5 的 `superseded-before-packet` 状态；
- post-ack 只允许另行准备 A3.0-A execution packet，不自动创建 packet 或启动编码；
- 继续排除 formal movement、真实项目 refs、V3/P5 completion。

## 7. 准备门禁与退出

本准备候选必须经过 fresh 独立 Judge Harness 评审，门槛为 `PASS / 100`、P0/P1/P2=`0/0/0`。评审应确认：

1. live control/S3.1 状态与 worker/control 漂移被正确区分；
2. A8 架构 PASS 与其过期 live-stage 快照被正确分开；
3. 当前 expected-old 未被提前冻结；
4. 推荐路径 A 与备选路径 B 均不偷渡控制授权；
5. carry-forward、rerun、superseded-before-packet 与 future ack 语义完整；
6. 本写集没有产品代码、Generation 1 计划正文或 refs 变更。

fresh PASS 只证明“可以向用户请求下一项精确授权”。下一项最小授权应是路径 A 的 S3.1 attempt 5 Result 固化与唯一 attempt 6 独立验收链；它不是 generation-advance CAS 授权。
