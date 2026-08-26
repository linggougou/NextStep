# 可承受性护栏：复杂度预算、状态投影与真实项目价值验证

- 状态：sg1-sg2-package-accepted-sg3-attempt1-contract-revision-required（SG-3 attempt 1 未执行 RED、无候选；下一步只允许 corrected attempt 2 packet）
- 记录日期：2026-08-25
- 来源：V1 完成后的项目分析与用户对工作膨胀风险的明确反馈
- 所属阶段：P5 / 跨版本可承受性护栏

## 1. 变更描述

V1 已证明 NextStep 的可靠性内核和证据链可以运行，但控制提交、审查包、不可变证据和人工会签的数量已形成明显的维护压力。若不在进入 V2 前建立可量化的复杂度预算、单一的人类状态投影和真实项目价值验证框架，后续 V2..V4 可能在不改变产品能力的情况下持续膨胀。

本变更只承接三个方向：

1. 建立可机器判定的复杂度预算，超限时要求例外或 Change Intake，不以预算为由删除既有安全、验证或会签门禁。
2. 从现有 Git/JSON 正式身份只读生成简洁状态投影，让用户只需看到当前阶段、范围、结论、阻塞、下一步和风险；审计细节按需展开。
3. 建立真实项目价值验证框架，定义如何测量用时、人工介入、误阻塞、恢复和完成结果；本轮不伪造也不提前宣称已完成三次真实运行。

## 2. 分流结论

- 类型：当前阶段增强项，同时是 V2..V4 的跨版本基础护栏。
- 是否改变当前路线：否。保持 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`，不新增产品版本，不改变 PC 主版本归属、技术栈、主载体、正式提升或验收门禁；但本 CR 新增计划范围、任务和 DoD，必须按 P4/S4 把 `plan_generation` 从 4 单向推进到 5。
- 是否影响当前阶段出口：不替代任何既有出口。三个护栏任务包通过，只证明可承受性工具和验证框架可用。
- 是否需要更新 `PROJECT_ROUTE_LOCK.md`：不改变路线结构，但必须同步当前阶段、代际缺口和授权停点；本 replacement 已更新路线锁的状态字段。若实施发现必须改变 PC、数据模型、正式 ref、控制协议或门禁，再停止并另开 Change Request。
- 与当前入口的关系：V1 仍为 formally-completed；V2 入口评估 PASS 仍只允许规划。SG-1、SG-2 的 generation 5 包级实现与正式独立验收链已经固化；SG-3 attempt 1 因 P1 契约歧义在 RED 前停止且无候选。下一动作仅为创建 corrected SG-3 attempt 2 packet，并分配新 fence 与新 worker；本文不创建或授权 V2 首个产品 packet。

### 2.1 控制代际影响

- 继续使用 `plan_id=p5-product-implementation`、`route_generation=1`；不得建立第二套 control ref 或并行计划身份。
- `plan_generation=4` 的 V1 完成、Result、signoff、formal 和历史失败保持不可变，不因推进 generation 5 失效或被重写。
- generation 5 只承接 CR-006 获批后的新 SG 任务及其后续新计划任务；任何迟到 generation 4 活动结果均按既有规则分类，不能驱动 generation 5。
- 推进顺序固定为：replacement 规划验收 PASS → 用户精确授权 generation-advance CAS → 独立 generation-ack CAS → 用户精确授权 SG-1 packet CAS → 后续 claim/fence/dispatch 仍需各自既有授权边界。
- generation-advance 与 generation-ack 必须是两个单父 expected-old control CAS；不得与 SG-1 packet、claim/fence、dispatch-ready 或 dispatch ACK 合并。

## 3. 受影响与不受影响范围

### 3.1 受影响范围

- 新增独立的复杂度预算 Schema、纯领域判定与测试。
- 新增只读状态来源适配、状态投影 Schema/领域规则/CLI 与测试。
- 新增真实项目价值验证 Schema、纯领域判定、CLI、协议文档与测试。
- 新增一份活动执行计划，冻结三个任务包的允许路径、DoD、TDD、复杂度上限、回滚和独立验收。

### 3.2 明确不受影响

- `PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、既有 P3/P4/S4 真源和既有 PC/TG/Q 定义。
- `refs/nextstep/formal`、`refs/nextstep/control`、既有 Result、Credential、Audit Anchor、Anchor Proof 和历史验收结论。
- V2 的 S2.1..S2.4、PC-09..13 交付声明；尤其不以状态投影提前满足 PC-12。
- V4 的 S4.1..S4.3、PC-19..20 交付声明；尤其不以价值验证框架或三份测试 fixture 提前满足 PC-19。
- 现有 Skill 交互、数据库/服务边界和宿主支持等级。

## 4. 可承受性硬边界

### 4.1 运行复杂度默认预算

预算是“超限即停下来解释”的护栏，不是删减正确性门禁的授权。首次实现冻结以下默认上限：

| 计量单位 | 默认上限 | 超限动作 |
|---|---:|---|
| 单个 Execution Packet attempt 的 control CAS 次数 | 12 | 标记 `exception-required`，不得静默追加状态转换 |
| 单个 attempt 新增的不可变证据文件 | 24 | 先合并重复证据引用或提交例外说明 |
| 单个 attempt 的用户可见确认点 | 2 | 不得把内部 ACK 逐条升级为用户确认；既有强制会签不可删除 |
| 单个小里程碑连续非 PASS 实施 attempt | 2 | 第三次前必须进入 Change Intake 或形成明确复杂度例外 |
| 单个小里程碑同时活动的 plan generation | 1 | 旧 generation 必须先墓碑失效或关闭 |
| 单个 packet 同时活动的独立执行/验收任务 | 5 | 超限时先证明职责不可合并，禁止递归扩散 |

若现有强制协议天然超过预算，结论必须是“预算不适配/需要例外”，不得跳过独立验收、身份绑定、证据、用户会签或 CAS。预算值后续只能通过新 Change Request 调整。

### 4.2 本变更实施规模上限

- 只允许三个互斥任务包，不再拆第四个功能包，不嵌套派生功能。
- 不新增运行时依赖、数据库、常驻服务、远程控制面或新的正式 Git ref。
- 三包合计最多新增 9 个生产/Schema 文件、7 个测试文件、16 个 fixture；净新增生产代码不超过 1,200 行，测试与 fixture 代码不超过 1,800 行。
- 任一包触及其冻结路径外文件、超过本包行数/文件数上限，或需要修改既有契约时，必须退回计划修订，不能以“顺手修复”扩张。

## 5. 风险、回滚与隐私

- 预算风险：阈值过严可能把必要门禁误判为复杂。处理方式是 fail closed 并申请例外，不自动删减步骤。
- 状态风险：投影可能把派生摘要误当正式事实。投影必须携带 formal/control OID 与来源摘要，冲突、过期、缺失时输出不可用状态，不猜测下一步。
- 价值验证风险：为了交付“三次运行”而使用 fixture、复制项目或补写数据。框架必须区分 `synthetic` 与 `real`，前者只能测试框架，计数恒为 0。
- 隐私边界：真实项目证据只记录经同意的度量、摘要和不可逆身份，不收集完整聊天、源代码、密钥或业务内容。
- 回滚：每个任务包均只新增独占路径；未通过独立验收时直接丢弃该候选或逆向撤销其新增文件，formal/control 保持不变，另外两包不受影响。

## 6. 用户决定与授权解释

- 用户于 2026-08-25 明确赞同上述三个方向并授权实施。
- 该授权允许建立本 Change Request 和活动计划，并在后续按精确任务包实施三个护栏。
- 该授权不扩大为 V2 首个产品 packet、claim/fence/dispatch、PC-12/PC-19 完成、V2/V4 版本验收、formal promotion 或 P5 完成授权。
- 每个真实执行任务仍需遵守当前 control 身份、不可变 packet、独立验收和正式提升协议；本文不能替代对应 control CAS。
- 用户对三个方向及实施的批准不自动授权 generation 5 advance/ack；replacement 规划门禁关闭后必须提交精确 control 身份请求。

## 7. 关闭条件

- 三个互斥任务包均在各自冻结路径内完成 RED、GREEN、受影响测试和全量 `pnpm check`。
- 三个包分别由未参与实现的唯一独立验收者绑定候选 commit/tree/digest 给出 PASS；随后再做一次累积只读验收。
- 复杂度预算超限、状态来源不一致、合成价值运行冒充真实运行三类负例均 fail closed。
- formal/control、用户工作树和既有产品真源未被修改。
- 关闭本 CR 不得写“PC-12 完成”“PC-19 完成”“V2/V4 完成”或“三个真实项目已验证”。

## 8. Generation 5 replacement 规划验收

- 固定候选：`82efe16f978b0269b7034a856643b7fea24abda0`，tree=`068f6da861ed181eca7864c1ae190a4a26fde60c`。
- 独立 L3 评审提交：`8e77ccec90c98445c5cbfd6d435f72fb5c24b4b0`，唯一父为固定候选，exact-2 评审写集。
- 裁决：`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。
- generation 5 control 结果：advance=`11cfbf71dfb4b8cd691588ea12a19bb32f759d9c`，唯一父为授权 expected-old `6d5120078a137ecf74b4a4b58cbcba37a61b7148`；ack=`83ef8b4361c96641e54d85acda6134a1cc75420e`，唯一父为 advance。formal 保持 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`，pending dispatch=0。
- SG-1 packet 结果：control=`12ab4aaffda6ee44853d4014230b9a85c1ad8944`，唯一父=`83ef8b4361c96641e54d85acda6134a1cc75420e`；packet digest=`sha256:04d13a57ce82419534255d126184dc35d6cfce4e35b4c878f0200bf43302be52`，dedup=`sha256:62e7a40290d06d58050d3fff80f9315fa246465f08dc5a5943381386ca8f45c7`，registry=`packet-prepared`，pending/活动任务=0。
- SG-1 claim/fence 结果：control=`042e007d5d342c90f6370212549963bae6a2db95`，唯一父/expected-old=`12ab4aaffda6ee44853d4014230b9a85c1ad8944`；claim=`claim-sg1-g5-a1-f118-20260826`，fence=118，lease=`2026-08-26T18:34:25Z`。写集 exact-2，只更新 `checkpoint.json` / `registry.json`；outbox/宿主均为空，pending dispatch=0，formal/main 未移动。
- SG-1 dispatch/实现结果：ready/outbox=`96c6bcbfe766cab6c30aab5be4877e36ef75e6ab`，implementation ACK=`e0394c27d70ae522ebc1ae754124124d0a9f3242`，候选=`9fc9dc2e51790e868d30d23fd28c8b8f17d67935`。同一补丁曾在正式验收前提前 cherry-pick 为 main `3464fbc6b117fe4ee3b1d8b6c921a2f3dc43fd4c`，审计封存=`abbf865878a842a47591fb294981e0244b2fec72`；异常历史不被事后 PASS 改写。
- SG-1 正式验收结果：packet=`91cdc9f2963201fa6d69704a1484ef73f02b48fb`，claim/fence 119=`4676b97a879baa7de2072878e437354d758936e9`，ACK=`e9100f0e41182135e10fb5997900060918c75aeb`，Result control=`830d831808a92f53dfca4dea87bb98c71e448fb1`；review=`690da53026ed4c06778ecf46e8f3172fadb0c140`，`PASS / 98`，P0/P1/P2=`0/0/2`，Result digest=`sha256:e04bd4b0c8efea41eb6015628205752624d58e92400d02565e01c61b244592e4`。
- SG-2 后续状态：implementation attempt 2 已合入，独立验收 attempt 7=`PASS / 99`，immutable Result 已固化；这不等于 PC-12 或 V2 完成。
- SG-3 attempt 1：P1 指出真实资格、证据绑定、整批拒绝/合法排除、CLI 与 aggregate 的机械契约不充分；该 attempt 固定为 `contract-revision-required`，未执行 RED、未生成候选。
- 当前下一动作：不改变三个任务包、路径、规模上限、DoD 或 `plan_generation=5`，只允许以澄清后的同一 SG-3 范围创建 corrected attempt 2 packet，使用新 fence 与唯一新 worker；不得自动宣称 SG-3/PC-19、V2/V4/P5 完成或移动 formal。
