# CR-007 V3 Generation 2 代际准备与 S3.1 兼容性候选

## 1. 目的与边界

- 用户已批准 CR-007 候选 `36242fbb2e938225c438871ada0731e06b9c37a4` 与独立评审 `288c1ca0d92c7c1834a0c65bc2c4cb8efe86e504`。
- 本候选把已完成的 S3.1 正式收口转换为 V3 子计划 `1 -> 2` 的 carry-forward 证据，并冻结 generation-advance/ack 所需语义。
- 本候选和其独立评审不创建 control 消息、不执行 CAS、不创建 A3.0 packet/claim/fence/dispatch/Result、不修改产品代码、不移动 formal、不创建 genealogy-hub 或其他真实项目 refs。

## 2. 新鲜实时身份

- main=`e3df650a6861274ff076c72276281cbf528e9188`；tree=`f16068e11a5ff24728055854338b473e8f909630`。
- formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- control=`c8cbba15a3b08f49b8e0d1bfaa7549b15a24dbe9`，唯一父=`f8aaed500cc13ba0a3b12906e7b51faaf16b41a1`。
- 全局 `route_generation=1`、`plan_id=p5-product-implementation`、`plan_generation=5` 保持；仅 V3 子计划候选为 `v3_plan_generation=2`。
- control checkpoint 无 pending dispatch；S3.1 在 registry 中为 `present-in-main-valid-acceptance`。

以上 OID 是本 readiness 候选的审计基线。实际 generation-advance 必须重新读取 formal/control/main；任一漂移均使本候选不可直接执行。

## 3. S3.1 carry-forward 证据

- implementation/repair subject=`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a`。
- execution Result=`results/result-execution-s3.1-g5-v3p1-a5-f172-20260830.json`，digest=`sha256:9dbf9d3574d3f65800eafe5d526b7718d6d3f7bcd1f34dd35d8c6a7ab010f35f`。
- fresh package acceptance attempt 6 Result=`results/result-package-acceptance-s3.1-g5-v3p1-a6-f173-20260830.json`，digest=`sha256:5bff9b08619f4f1d71367e7df0cab697ebc08d7d2eb430171d170b4be1539678`。
- independent review=`a625089bf2828c7ccee7a286ef0c66a1c28c3457`，`PASS / 100`，P0/P1/P2=`0/0/0`。
- integration checkpoint=`e3df650a6861274ff076c72276281cbf528e9188`；其 tree 与 review tree 均为 `f16068e11a5ff24728055854338b473e8f909630`。
- fresh root `corepack pnpm check`=`581/581`，失败/跳过/取消/待办均为 0；Lines=`94.49%`、Branches=`89.90%`、Functions=`99.45%`。
- integration control=`c8cbba15a3b08f49b8e0d1bfaa7549b15a24dbe9`；通过前向补齐恢复并保留并发提交历史，没有 reset 或改写已接受证据。

## 4. 兼容性判断

S3.1 accepted exact-eleven 为 capability-preflight schema/domain、host-bootstrap、project-probe、CLI、Skill 说明和对应测试/fixture。CR-007 已批准候选和本 Generation 2 文档在当前候选阶段只修改文档与 `.codex` 证据，不修改这 11 个产品路径，因此不会改变已验收的 S3.1 运行语义、PC-14 子结论或风险裁决。

A3.0 的未来实现会在独立 packet 下增加 adoption 能力，并可能对共享的 `skills/nextstep/SKILL.md`、`src/cli/nextstep.ts` 和 project-status surface 做加法式扩展；这些修改不得回退 capability-preflight 三态或 S3.1 fail-closed 合同，必须由 A3.0 自身 TDD、I/X/P/Profile 和独立 package acceptance 负责。故 S3.1 可以 carry forward，但不能把未来共享路径改动冒充为已经由 S3.1 验收。

## 5. Generation 1 future entry 处理

- S3.2..S3.5 尚无 Generation 1 packet，不创建伪 tombstone。
- generation-advance 登记这些入口为 `superseded-before-packet`；任何迟到的 Generation 1 packet/claim/dispatch/Result 均按 stale generation 拒绝。
- S3.1 登记为 `carry-forward-pending`；只有 generation-ack 绑定本候选的独立 PASS 后才成为 `carry-forward-confirmed`。
- 历史 Generation 1 计划、Result、review 和 control commit 永久保留。

## 6. 两个分离 CAS 的候选合同

V3 子计划没有既有 CAS 先例，禁止把它冒充为全局 `plan_generation 5 -> 6`。冻结的 scoped state 为：

- `checkpoint.v3_plan_generation=2`，`registry.v3_plan_generation=2`；全局 `checkpoint.plan_generation` 与 `registry.plan_generation` 继续为 5；
- advance 在 `checkpoint.unconfirmed_tombstones` 增加唯一 `subplan_id=V3` 条目，并在 `registry.v3_generation_tombstones` 登记完整未确认记录；ack 确认该记录并从 checkpoint 清除未确认项；
- 旧未来入口精确为 `S3.2`、`S3.3`、`S3.4-A`、`S3.4-B`、`S3.4-C`、`S3.5-A`、`S3.5-B`；A3.0-A/B 是新入口，不伪造为旧代际墓碑；
- 每个 CAS 的写集均为 exact-three：`checkpoint.json`、`registry.json` 和自身唯一 message；不得夹带 packet、Result 或其他 control 文件。

### 6.1 generation-advance

- expected-old 在执行前必须精确等于 fresh live control；当前观察值为 `c8cbba15a3b08f49b8e0d1bfaa7549b15a24dbe9`。
- 唯一 message 路径为 `messages/msg-generation-advance-p5-g5-v3p2-20260830.json`，带 `subplan_id=V3`、`previous_v3_plan_generation=1`、`v3_plan_generation=2`。
- 单父 control commit，绑定 CR candidate/review、Generation 2 plan candidate/review、S3.1 subject/Result/review/main tree。
- V3 子计划 `1 -> 2`；全局 `plan_generation=5` 不变。
- S3.1=`carry-forward-pending`；S3.2..S3.5=`superseded-before-packet`。
- 不创建 A3.0 packet，不移动 formal，不创建真实项目 refs。

### 6.2 generation-ack

- expected-old 必须精确等于刚完成的 generation-advance control OID。
- 唯一 message 路径为 `messages/msg-generation-ack-p5-g5-v3p2-20260830.json`；绑定 advance message id、message digest 与 control OID。
- 另一单父 control commit，复核 advance message/digest/control 与全部不变量。
- S3.1=`carry-forward-confirmed`；post-ack 唯一入口为另行创建 A3.0-A execution packet。
- 不自动创建 packet、claim/fence、dispatch 或代码，不移动 formal，不完成 V3/P5。

## 7. 独立评审门禁

fresh reviewer 必须在隔离环境只读核对候选，并只写自身 exact-two review artifact。放行门槛：

1. `PASS / 100`，P0/P1/P2=`0/0/0`；
2. CR、设计、Generation 2 计划与本 readiness 一致；
3. S3.1 subject、Result、review、main/review tree 和 control 状态精确匹配；
4. 当前文档候选未修改 S3.1 exact-eleven、S3.2 exact-14、Generation 1 正文或 refs；
5. carry-forward、superseded-before-packet、两个 CAS 与 A3.0 后续入口分离；
6. 真实项目 refs、formal movement、V3/P5 completion 均未被偷渡。

未达到精确门槛则保留 verdict、窄修候选并启动新 attempt。PASS 只放行两个分离 generation CAS，不放行 A3.0 packet。
