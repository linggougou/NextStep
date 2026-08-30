# A3.0 累计验收 Generation 1 修订计划候选

## 1. 性质、身份与实时基线

- 本文件是 A3.0-A/B 完成 package acceptance 与状态同步后的累计验收修订计划候选，不是 gate packet、claim/fence、dispatch、Result、S3.2 packet 或完成结论。
- 固定身份：`stage_id=P5/V3/M3.1/A3.0/cumulative-acceptance`、`task_id=A3.0-I-X-P`、`route_generation=1`、`plan_generation=5`、`v3_plan_generation=2`、`task_attempt=1`。
- 验收维度固定为 `I / X / P / Profile / Budget`。A3.0 是 M3.1 的入口修复且不拥有 PC-14；累计 PASS 也不完成 M3.1、V3、CR-006 或 P5。
- 当前 governance/source baseline 固定为 main=`71085626b518ce5f8ebf5bfa546f96ea2f834730`、tree=`229f2e05cd7bc54541cc11cf376119a9a01af6bd`、唯一父=`7cd3dd1fe3aae23a1759d604783b182558fb4c15`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`；parent-recorded control=`55e942b0bdc1318372f6c6226f8a469f7fa894e8`。
- `7108562...` 是已通过 exact-eleven 的 A3.0-B 状态同步：它承载当前路线/顺序与源码构建入口；`7cd3dd1...` 是 A3.0-B 产品 integration/review。两者不得混淆，状态文档后继不得冒充产品实现改动。
- 历史存在 `two superseded invalid entry attempts`，均为 `REVISE / 90`；其精确 plan/review 身份由 control/state logs 管理，只用于审计，不是当前 packet prerequisite、reviewer parent、累计 authority 或必须可寻址对象。独立 clone 中无法到达这些历史对象不影响当前计划 integrity。
- attempt3 entry 因把不可达 prior invalid OID 升级为 addressability prerequisite 而 REVISE；attempt4 entry 因未闭合 authority provisioning 而 REVISE；attempt5 entry 因 ref-free ACK discoverability 尚无机械锚点而 REVISE；attempt6 entry 因 result-control reachability 未闭合而 REVISE。原因仅作审计说明，精确 candidate/review OID 不在本计划硬编码并继续由 control/state logs 管理。
- 本修订计划候选提交必须以 `7108562...` 为唯一父，仅新增本文件。未来 packet 必须冻结该提交的精确 commit/tree/parent 与 digest；不得把本节任一预先已知 OID 冒充尚未产生的修订计划 commit。
- control 是运行时易变值：packet 创建前必须从 `refs/nextstep/control` fresh reread，并把当时 live OID 写为 `packet.control_expected_old`；parent 之后的正常单父 control 前进不要求修改本计划，也不单独触发重新 entry review。
- packet 前同时 fresh 复核 main/formal、全局与 V3 代际、A/B authority、pending dispatch。只有 main/formal/generation/A-B authority 漂移才停止并重做 entry；control CAS 竞争则按 expected-old fail closed、fresh reread 后重新准备独立 packet CAS，不得盲重试。
- 本计划及其 entry review 不移动 main/formal/control，不修改产品代码，不创建或接触 `genealogy-hub` 及任何真实项目的 live `refs/nextstep/*`。

## 2. A/B 与状态同步不可变 authority

### 2.1 A3.0-A：只读 inspect

| 对象 | 精确绑定 |
|---|---|
| accepted subject | commit=`696b03ec25e97c30e52576d971d14f1f565ea729`；tree=`ec27d6e4a13ba8e03678e1d816cc0d0c41fd7aa6`；唯一父=`4d07fde2790a6e3a357268922168ee5efa013c0b` |
| execution Result | `results/result-execution-a3.0-a-g5-v3p2-a1-f174-20260830.json`；digest=`sha256:27a16eebd860df60108448409ab9732d06e07d28304b9a3432725fad1a12df79` |
| acceptance Result | `results/result-package-acceptance-a3.0-a-g5-v3p2-a2-f176-20260830.json`；digest=`sha256:3c8203c1baea88227621eb1c1fe02f20e329e8bbd1e940610a8d147b140298f6`；Result control=`6677d0fcce3e6820f79aa0a8b7e619c9efa5152a` |
| independent review / integration | commit=`1825bcfd01feb796a795d20005577b5e7f26eae4`；tree=`5b9d932d96786183a213b358c2cc1de379b9b242`；唯一父=`696b03ec25e97c30e52576d971d14f1f565ea729`；`PASS / 100` |

### 2.2 A3.0-B：可信激活、状态、恢复与回滚

| 对象 | 精确绑定 |
|---|---|
| accepted product subject | commit=`60d373aef79141a03418aca5c75447742c6a87b5`；tree=`35cec7e7f509c3e3cef01a338def9d9b9c2935f2`；唯一父=`8de049251439ac7f09a23b29acc2f1bc86d49888` |
| cumulative implementation chain | `5bc681d4eb34aa7fd4f3d64585116723e87eaf16 -> a2d3b014f9fcf4050e3fc6f31b930ea89d8b9ad9 -> ab844fef05fb7b05c01fd486fb16ce2fe813c77c -> 8de049251439ac7f09a23b29acc2f1bc86d49888 -> 60d373aef79141a03418aca5c75447742c6a87b5`，全为单父链 |
| execution Result | `results/result-execution-a3.0-b-g5-v3p2-a5-f186-20260830.json`；digest=`sha256:05d2c3d0be9f241a4c6796ce64d6861051442b46b605054b0ac1f9339f419050` |
| acceptance Result | `results/result-package-acceptance-a3.0-b-g5-v3p2-a6-f187-20260830.json`；digest=`sha256:b49fc780024d0fd50ab5190b7827db2089ff5552753a2f413dc375e98c29343e`；Result control=`37e51936d7b23132fd8b5216800ba469bea80756` |
| product integration / independent review | commit=`7cd3dd1fe3aae23a1759d604783b182558fb4c15`；tree=`462fb1877b42410acb0ffe2106be20dac7dc31c9`；唯一父=`60d373aef79141a03418aca5c75447742c6a87b5`；`PASS / 100` |
| current state sync | commit=`71085626b518ce5f8ebf5bfa546f96ea2f834730`；tree=`229f2e05cd7bc54541cc11cf376119a9a01af6bd`；唯一父=`7cd3dd1fe3aae23a1759d604783b182558fb4c15`；exact-eleven state/doc-only |

- `7cd3dd1...` 仍是 accepted product integration 与产品测试基线；`7108562...` 只以前向 exact-eleven 状态同步把当前入口推进到“修订累计计划与 fresh entry review”，不产生第二个产品 subject。
- 当前路线锁、活动里程碑计划与 CR-007 在 `7108562...` 已一致声明 A3.0-A/B 验收集成完成、累计验收尚未开始。adoption amendment 中早于本同步的状态文字仅作为历史结构合同使用，不能覆盖 `7108562...` 的当前顺序。
- 本节“必须可寻址并独立复算”的对象精确限定为：2.1/2.2 A3.0-A/B authority tables、current state sync，以及本次 attempt7 计划候选和其 fresh entry review 对象。superseded invalid entry attempts 明确排除在 addressability prerequisite 之外。
- tree 等价、文字引用或 live main 的更晚后继均不能替代上述有效 authority。superseded invalid entry 对象即使不在独立 clone 可达集合，也不影响本计划完整性或 packet 放行判断。
- A/B 历史 REVISE、环境失败与修复 attempts 保持原结论，不得被累计 PASS 改写；累计验收必须在同一新鲜上下文重新证明端到端闭环，不能拼接两个 package PASS。

### 2.3 post-review Result 的时间与交叉绑定

- A3.0-A attempt2 acceptance Result 是 A3.0-A 独立 review 完成后由 controller 固化的 artifact；A3.0-B attempt6 acceptance Result 同样是 review=`7cd3dd1...` 完成后由 controller 固化的 artifact。
- 因时间顺序，A3.0-B attempt6 scorecard 只能引用当时已存在的 prior attempt5/fence184 acceptance Result，不能自引用尚未生成的 attempt6 Result；A3.0-A attempt2 review 也不得被要求自引用其 post-review Result。这不是 authority 缺口，不能据此降级。
- 累计 gate 必须交叉绑定：ready-control tree 中 post-review Result 的 exact path/JCS digest/Result control ancestry，产品 ancestry 中对应 independent review commit/tree/parent/scorecard，以及二者共同绑定的 accepted subject、attempt/fence、packet/ACK identity。Result 与 review 任一侧缺失或错绑都 fail closed。

- A Result control 精确为 `6677d0fcce3e6820f79aa0a8b7e619c9efa5152a`，B Result control 精确为 `37e51936d7b23132fd8b5216800ba469bea80756`；二者都是对应 post-review Result 的创建 commit，不能由 main tree、review commit 或 scorecard 自引用替代。

### 2.4 plan entry review clone 的 control authority provisioning

- fresh plan entry review 开始前，controller 必须创建 no-local、无 remote、无 alternates、非 shallow、detached 到本次 plan candidate 的独立 clone，并从 controller-owned store 无-ref导入当时 current control graph 与 formal object graph。
- controller 只以 expected-missing 创建 `refs/nextstep/formal=ea04b57de83d6c548dcb1629b1f61832db8375ad` 与 `refs/nextstep/control=<entry-review-current-control-oid>` 两个 frozen refs；不得新增第三 ref、evidence ref、remote、alternates 或改变 `FETCH_HEAD`。
- entry reviewer 必须用 `git cat-file` 证明 `6677d0fcce3e6820f79aa0a8b7e619c9efa5152a` 与 `37e51936d7b23132fd8b5216800ba469bea80756` 均是 frozen current control 的可达单父祖先，并从各自 commit tree 的第 2.1/2.2 节 exact Result path 读取 JCS、复算精确 digest；缺一对象、父数不是 1、不可达、path 缺失或 digest 不符即 `REVISE`。
- 产品 main 不含 control-only objects 属于正常边界，不得据此降级；只有 controller provisioning 或上述 ancestry/path/digest 证明失败才 `REVISE`。entry review 全程冻结两 ref，结束后再次证明 ref 数为 2、remote=0、alternates=0、`FETCH_HEAD` 未新增/未变。

## 3. donor 与隔离硬合同

### 3.1 唯一合格 donor

- 只允许选择一个**非 NextStep-native 的真实项目**，并仅在其可销毁隔离副本运行。真实项目表示已有独立业务目的、真实历史与活动真源，不是为本验收临时生成的 synthetic 仓库或 NextStep 仓库复制品。
- 明确禁止：NextStep 自仓、synthetic-only fixture、`genealogy-hub`、用户正在工作的 live checkout、任何 live `refs/nextstep/*`、网络仓库和含敏感凭证的副本。
- packet 创建前由主控只读选定 source，并冻结：`source_identity_digest`、`source_commit_oid`、`source_tree_oid`、object format、`source_repository_digest`。其中 repository digest 固定为 RFC8785/JCS 对 `{source_identity_digest,source_commit_oid,source_tree_oid,object_format,tracked_tree_manifest_sha256}` 的 SHA-256；只落摘要，不落真实绝对路径。
- `tracked_tree_manifest_sha256` 对 `git ls-tree -r -z --full-tree <source_commit_oid>` 原始 bytes 计算。source identity、commit、tree 或 manifest 任一漂移即淘汰该 attempt，不从移动中的 source 重建同 attempt。
- donor 通过本地 `git clone --no-local` 从固定 source commit 创建，随后移除全部 remote；必须无 alternates、非 shallow、单一 worktree、clean，branch/HEAD/index/worktree 基线稳定，整个 `refs/nextstep/*` namespace 为空。donor 自身 `AdoptionCandidate.repository_identity`、candidate digest 与副本路径身份另行冻结，不能用 source identity 冒充。
- source 必须在固定 commit 中真实包含 `PROJECT_ROUTE_LOCK.md`、唯一活动计划和 `.codex/verification-report.md`；这些只从 Git blobs 读取。副本不满足 inspect 合同则更换 donor 并新建 attempt，不放宽产品合同。

### 3.2 source-execution clone、review-output clone 与 donor 分离

- source-execution clone 必须 no-local、无 remote、无 alternates、detached 到 current source baseline=`71085626b518ce5f8ebf5bfa546f96ea2f834730`、clean；累计验收的 install/build/targeted/full 都只在该源码树运行。
- product identity 仍绑定 `7cd3dd1...` 的 product integration tree；必须机械证明 `7108562...` 相对 `7cd3dd1...` 只有已批准 exact-eleven 状态/文档同步，产品、schema、tests、Skill、依赖与构建输入未被其改写。
- review-output clone 必须以**本修订计划候选 commit**为唯一基线；未来 packet 冻结其精确 commit/tree/parent。reviewer 的 exact-three 提交以该计划 commit 为唯一父，不得以 `7cd3dd1...`、`7108562...`、superseded invalid entry 对象或 entry review commit 为父。
- donor 是第三个可销毁目录，初始 NextStep namespace 必须为空；不得把 source-execution clone 的 formal/control 注入 donor，也不得把 donor 接入结果写回 source。
- 三个目录都禁止网络、依赖升级、全局配置写入、Git replace/graft、浅化、对象借用或第二 worktree；reviewer 对三者的身份与用途分别记录，不能交叉冒充。

### 3.3 controller-only authority provisioning 与 readiness

1. gate packet、claim/fence、dispatch-ready/outbox 必须先分别完成 CAS；ready CAS 成为本 attempt 唯一 `ready_control_oid`。
2. ready/outbox CAS 后、reviewer readiness 前，controller 从 controller-owned control store 一次性向 source-execution clone 导入 exact ready-control object graph 与 formal object graph；导入只增加对象，不创建 remote/alternates，不借用本地 objects。
3. controller 只以 expected-missing create-once 创建两个 refs：`refs/nextstep/formal=ea04b57de83d6c548dcb1629b1f61832db8375ad` 与 `refs/nextstep/control=<ready_control_oid>`。ref 集合必须精确为这两个，不得创建 evidence ref、第三个 NextStep ref 或其他辅助 ref。
4. future cumulative packet 必须分别冻结 `a3.0_a_result_control_oid=6677d0fcce3e6820f79aa0a8b7e619c9efa5152a` 与 `a3.0_b_result_control_oid=37e51936d7b23132fd8b5216800ba469bea80756`；readiness 必须证明两 OID 都是 frozen ready-control 的可达单父祖先。缺任一对象、父数不是 1 或不可达，均不得 ACK。
5. reviewer readiness 从两个 frozen result-control commit tree 对 A/B acceptance Result 分别执行 `git show <result_control_oid>:<Result path>`，并从 frozen control tree 读取 A/B execution Result exact path，逐一按 RFC8785/JCS 复算 digest。A/B acceptance Result 的 control OID、单父、tree path、record identity 与 JCS digest 必须同时精确匹配 packet 及第 2.1/2.2 节；不得从工作树、main tree、fixture 或人手复制件读取。
6. reviewer 从 product HEAD/main ancestry 使用 `git cat-file -e/-t`、raw commit/tree 与直接父复算 A/B subjects、implementation/review commits、trees、parents、scorecards 和 state sync；必要父链/tree/blob 任一缺失、类型错误、shallow/graft/replace 或错绑都为 `readiness-failed`，禁止 ACK。
7. readiness 还须证明 clone detached HEAD=`7108562...`、clean、remote=`0`、alternates absent、仅两个 frozen refs、formal/control 值精确、四个 Result 可读、两个 result-control 单父 ancestry 与产品 ancestry authority 可达；这些断言未全部通过不得返回 READY。
8. formal/control 从 readiness 前开始冻结；reviewer 测试、donor 流程、exact-three 提交前后都必须保持不变。

### 3.4 ref-free ACK handoff 与机械验证

1. ACK CAS 成功后，controller 取得 exact `ack_control_oid`，先在 controller-owned store 以 raw commit 证明其唯一父=`ready_control_oid`，并证明 ACK commit tree 内含 packet 冻结的 exact `ack_message_path`。
2. controller 对 `git cat-file commit <ack_control_oid>` 返回的 raw commit bytes 计算 `ack_commit_raw_digest`；对 `git show <ack_control_oid>:<ack_message_path>` 的 raw bytes 与 RFC8785/JCS 分别计算 ACK message raw/JCS digest。message 必须绑定 packet、claim、fence、host task、reviewer identity 与 ready control。
3. controller 使用 `git fetch --no-tags --no-write-fetch-head <controller-store> refs/nextstep/control`，或语义等价的无-ref object import，把 exact ACK object graph 导入 source-execution clone。fetch 时 controller store ref 必须仍精确等于 `ack_control_oid`；若已前进，只能改用按 exact OID 固定的等价 object import，不得导入未冻结后继冒充 ACK。导入前后 clone refs、`FETCH_HEAD` raw digest/不存在状态、remote list、alternates、HEAD/tree/worktree 必须完全不变。
4. controller 通过已持久化的 host-task continuation event，把 `{ack_control_oid,ack_parent_oid,ack_message_path,ack_message_jcs_digest,ack_commit_raw_digest}` 组成 exact continuation envelope 交给**同一 reviewer**；envelope 另含自身 JCS digest、host task identity、packet/claim/fence 与唯一 event path。
5. 该 continuation event 是 dispatch ACK 后唯一允许的继续指令；其 event path、event digest 与 envelope digest 必须由 exact-three `adoption-cumulative-acceptance.json` 和最终 cumulative Result 精确绑定。它只提供不可歧义的 ACK OID 寻址，不替代 Git 对象、父链、tree 或消息证明。
6. reviewer 只能使用 envelope 给出的 `ack_control_oid` 做发现锚点，执行 `git cat-file -e/-t/-p` 与 raw `git cat-file commit`，复算 raw commit digest、唯一父、tree、ACK message path/raw/JCS digest，以及 packet/claim/fence/host/reviewer identity；不得扫描猜测 ACK OID。
7. reviewer 在开始正式 review 前再次证明 `refs/nextstep/control=<ready_control_oid>`、`refs/nextstep/formal=ea04...`、NextStep refs 精确为 2、remote=`0`、alternates absent、`FETCH_HEAD` 未新增/未变化、HEAD/tree/worktree clean。任一 envelope、Git object、digest、parent、message、identity 或不变性不匹配均不得开始 review。

## 4. 实际可信动作门禁

- `adoption inspect` 完成后，可信宿主必须把 exact `confirmation_view`、`view_digest`、candidate digest、拟议 stage/milestone/scope、副作用、未知历史门禁与回滚限制真实展示给用户。
- 用户接入确认必须是该次展示后的新鲜动作，绑定可信 `session_identity`、host verifier identity、trusted clock、`user_action_ref`、nonce/replay key、exact view digest 与最终 envelope digest。当前聊天中的泛授权、计划批准、stdin/argv/env、自述字符串、fixture verifier、test verifier 或预制 JSON 都不能替代。
- 激活并恢复 receipt 后，可信宿主还必须展示 exact activation receipt、当前 namespace digest 与回滚限制，并取得第二个新鲜 rollback action；它绑定同一受控 session 的新 action ref、新 nonce、trusted clock、receipt digest 与当前 namespace digest，不得预授权或复用接入 nonce。
- 可信宿主必须以生产等级 in-process verifier/clock/user-action capability 调用现有 ports；如果当前宿主不能证明这些绑定，本验收状态只能是 `blocked-awaiting-trusted-user-action`，不得以测试 harness 降级。
- 上述两次动作可安排在同一个短监督窗口，构成本计划执行中唯一预期需要用户交互的暂停点；用户未在线时应持久化无副作用的 blocked 状态并等待，不得继续激活。

## 5. 端到端执行序列

同一 donor、同一 candidate、同一 reviewer attempt 必须按以下顺序完成，任何换 donor、换 candidate、换 reviewer 或身份漂移都生成新 attempt：

1. **基线快照**：记录 source 不变摘要；记录 donor branch ref/或 detached marker、HEAD commit/tree、`git write-tree`、porcelain-v2 clean、worktree-list digest、完整 namespace digest、remote/alternates/shallow 状态。
2. **inspect**：运行公开只读入口生成 candidate；重复 inspect 必须同内容，且 branch/HEAD/index/worktree/namespace 零变化。
3. **trusted confirmation**：可信宿主展示 exact view，接受用户 fresh action，重构 view 并生成 verified envelope；先执行 replay、过期、digest 与自述确认的负例，全部在 verifier/Git/ref 副作用前 fail closed。
4. **drift preflight**：激活前重新读取 HEAD、候选 blobs、worktree projection、worktree list 和整个 namespace；与 candidate 不一致则 `ADOPTION_CANDIDATE_STALE`，不创建 refs。
5. **activation**：只允许创建零父 control genesis、以 genesis 为唯一父的 activation，并在同一 prepare+commit transaction 以 expected-missing 原子创建 `refs/nextstep/formal=<candidate HEAD>` 与 `refs/nextstep/control=<activation>`；不得以业务 HEAD 为 control parent。
6. **status**：公开 `project-status`/`nextstep status` 必须只显示 adopted baseline、user-declared/unknown 历史证据、未知门禁与 rollback-eligible；不得生成历史 version signoff、任务、dispatch、PC-14 或已完成结论。
7. **activation receipt-loss recovery**：在 ref transaction 成功后注入 receipt 丢失；以 exact candidate+confirmation 重放，必须恢复同一 receipt/genesis/activation，不能生成第二套对象或 refs。
8. **eligible rollback**：展示 exact receipt/namespace 后取得 fresh rollback action；先证明 successor control、task/outbox/claim/ACK/Result/promotion、namespace drift、旧 nonce 或 forged receipt 任一存在时均阻塞。仅在全部 guard 空且 identity 精确时原子删除 pair。
9. **rollback receipt recovery**：在 pair 删除成功后注入 post-transaction receipt 丢失；以 exact receipt+action 重放，从同一内容寻址 blob 恢复同一 rollback receipt，namespace 仍为空且不发生第二次删除。
10. **终态不变性**：donor branch/HEAD/index/worktree/worktree-list 与步骤 1 完全一致，namespace 从 empty 精确变为 pair 再回到 empty；source 全程不变，source-execution clone 的 formal/control/HEAD/tree 不变，真实项目 refs 写入数为 0。

## 6. 累计验收硬门

1. **HG1 authority/provisioning**：第 2 节 A/B tables、current state sync、本次 attempt7 plan 与 fresh review 可寻址且摘要匹配；entry review clone 与 cumulative reviewer clone 都按第 2.4/3.3 节完成 control graph provisioning，并证明 A Result control `6677d0fcce3e6820f79aa0a8b7e619c9efa5152a`、B Result control `37e51936d7b23132fd8b5216800ba469bea80756` 是各自 frozen control 的可达单父祖先，对应 Result tree path/JCS digest 精确。A/B post-review Result 通过 Result path/digest/control ancestry 与对应 review commit/scorecard 交叉绑定，不要求 scorecard 自引用未来 Result；superseded invalid entry attempts 不属于可达性 prerequisite。
2. **HG2 ACK handoff**：第 3.4 节 continuation envelope 唯一、持久化且摘要匹配；ACK object/parent/tree/message/packet/claim/fence/host identity 全部复算，frozen refs/FETCH_HEAD/remote/alternates 不变。envelope 只作 OID 锚点，不替代 Git 证明。
3. **HG3 donor provenance**：第 3 节五项 source identity、donor 资格、真实项目属性、零 live refs 与三目录隔离全部成立。
4. **HG4 trusted actions**：两次实际用户动作各自 fresh 且完整绑定；无 stdin/argv/env/fixture/test verifier 替代，无 replay。
5. **HG5 inspect/drift**：候选只读、Git blobs 唯一、candidate TTL 有效；HEAD/blob/worktree/worktree-list/namespace 任一漂移均在写入前 fail closed。
6. **HG6 raw Git shape**：raw object 证明 genesis 零父，activation 唯一父=genesis，tree entry mode/type/OID 精确；symlink、executable、tree/submodule、malformed commit/tree、shallow/graft/replace 均拒绝。
7. **HG7 atomic pair/status**：formal/control 仅以一次原子 expected-missing transaction 创建；single-ref、extra-only、pair+extra 分类精确；status 无 fabricated signoff、任务或完成声明。
8. **HG8 activation recovery**：receipt-loss 后恢复相同 receipt/effect/genesis/activation，零重复副作用。
9. **HG9 rollback/recovery**：fresh rollback action 与全部 guard/current namespace 匹配；存在后继时阻塞，合格时 pair 原子删除；post-delete receipt-loss 重放返回同一 receipt/blob，丢 blob 时安全阻塞。
10. **HG10 zero side effects**：步骤 10 全部成立；不得修改 source、真实项目、accepted product subject、依赖或 refs。
11. **HG11 Profile/Budget**：Skill-only/headless Profile 适用；缺 trusted-host capability 即 blocked。第 8 节预算与三项 carry-forward 风险完整披露。
12. **HG12 verdict**：只有 I/X/P/Profile/Budget=`20/20/20/20/20`、`PASS / 100`、P0/P1=`0/0`、无 required fixes 且没有新增残余风险时，主控才可固化 Result。既有三项命名 P2 可以 carry forward，但必须逐项在报告中保留，不能静默清零。

## 7. Fresh 源码验证与 exact-three 输出

### 7.1 命令、源码与发行边界

以下命令只在 detached `71085626b518ce5f8ebf5bfa546f96ea2f834730` 的 source-execution clone 中运行：

```sh
corepack pnpm install --offline --frozen-lockfile
corepack pnpm build
node --test --experimental-test-coverage \
  --test-coverage-include='dist/src/domain/adoption-candidate.js' \
  --test-coverage-include='dist/src/domain/adopted-baseline.js' \
  --test-coverage-include='dist/src/domain/adoption-activation.js' \
  --test-coverage-include='dist/src/adapters/node/adoption-inspect-source.js' \
  --test-coverage-include='dist/src/adapters/node/adoption-ref-store.js' \
  --test-coverage-include='dist/src/adapters/node/project-status-source.js' \
  dist/tests/domain/adoption-candidate.test.js \
  dist/tests/domain/adopted-baseline.test.js \
  dist/tests/domain/adoption-activation.test.js \
  dist/tests/domain/project-status-projection.test.js \
  dist/tests/adapters/node/adoption-inspect-source.test.js \
  dist/tests/adapters/node/adoption-ref-store.test.js \
  dist/tests/adapters/node/project-status-source.test.js \
  dist/tests/cli/adoption-inspect.test.js \
  dist/tests/cli/project-status.test.js \
  dist/tests/cli/nextstep.test.js
corepack pnpm check
git diff --check
```

- targeted 必须 failed/skipped/cancelled/todo=`0/0/0/0`，changed-scope Lines/Branches/Functions 至少 `90/85/95`；full 必须至少 `600/600` 且全零失败，整体覆盖率至少 `93.00/87.70/98.70`。数字只能来自本 attempt fresh raw output。
- 第 5 节真实 donor 流程必须作为同 attempt 的行为证据；单元测试、fixture 或源代码存在不能替代它。
- install downloaded 必须为 0；测试前后 source-execution clone、review-output clone 与 donor 的冻结状态分别复核，尤其证明 `refs/nextstep/formal` 与 frozen ready `refs/nextstep/control` 精确不变；禁止测试污染被 clean/reset 掩盖。
- 旧 `v0.2.0-alpha` tarball 只包含其已评审的 13 个公开命令，不包含 repository source 后续增加的 `adoption-inspect`，也不包含任何公开 activation/rollback 写入口。本累计验收不得安装或测试旧 tarball 来冒充 adoption 能力。
- 任何累计 PASS 仅是 `7108562...` 源码级 A3.0 gate 证据，不证明旧 tarball 具有该能力，不构成稳定发行、tag、publish、正式安装或普通用户可用结论。

### 7.2 正式 reviewer 输出

- 唯一独立 reviewer 必须未参与 A/B 实现、其 package acceptance、本修订计划、superseded entry attempts、control 写入、状态同步、authority/ACK provisioning 或 donor 选择。
- reviewer 在 review-output clone 中只提交专属目录 exact-three：`adoption-cumulative-acceptance.json`、`scorecard.json`、`verdict.md`。该提交的唯一父必须是**本修订计划候选 commit**；packet 必须先冻结其精确 commit/tree/parent/digest。不得使用 `7cd3dd1...`、`7108562...`、superseded invalid entry 对象或未来 entry review commit 作为 reviewer parent。
- `adoption-cumulative-acceptance.json` 至少绑定：本修订计划、product baseline=`7cd3dd1...`、source/state baseline=`7108562...`、ready/frozen control、A/B authority 与四个 Result、A/B result-control OIDs、packet/claim/fence/ACK、host continuation event path/digest、continuation envelope digest 与五项 ACK 字段、sanitized source/donor digests、两次 trusted action digest、candidate/envelope/activation/rollback receipt digests、raw Git shape、状态投影、recovery injections、基线/终态、targeted/full/coverage、Budget 与未完成/发行边界。
- `scorecard.json` 固定 I/X/P/Profile/Budget 五维及 HG1-HG12；`verdict.md` 用简体中文给出结论、required fixes、P2 carry-forward 与下一唯一动作。三文件都不得记录绝对 donor/source 路径、用户原始文本或敏感字段。
- reviewer 不得修改本修订计划、`7108562...` source tree、`7cd3dd1...` product tree、Result、control 或任何 refs；exact-three review commit 是审查证据，不是产品 integration 或新的 source baseline。

## 8. Budget 与 carry-forward 风险

- accepted product surface 固定为 A/B union exact-26；A=exact-11、B=exact-16，交集只允许既有共享路径。`7108562...` 的 exact-eleven 状态同步和本修订计划均不得计入或改写 product surface。
- 累计验收不新增产品路径、依赖、公开写 CLI、网络、数据库、守护进程或编排层。
- 预算上限：dependency diff=`0`、public write CLI=`0`、Git ref transaction implementation=`1`、real project live ref write=`0`、review output=`exact-three`、donor=`1`、trusted user action=`2`。
- 若实际验收需要新增产品代码、测试、schema、fixture 或 host adapter，本 attempt 必须停止并进入 Change Intake/独立 remediation packet；不得在 acceptance 输出中顺手修复。
- 允许显式 carry forward 的 P2 仅三项：
  1. `adoption-ref-store` 与 `project-status-source` 双 raw parser 未来可能漂移；现有交叉测试缓解，但不视为已消除。
  2. rollback receipt blob 不可达时可能被 aggressive GC 清除；发生时只允许安全阻塞恢复。
  3. 超长 raw ancestry 的性能上界尚未量化；当前只证明语义正确，不承诺任意历史长度的性能。
- 出现任何新增 P2、任一 P1/P0、预算超限或 donor 不合格，verdict 必须 REVISE/REJECT，不能用 carry-forward 吸收。

## 9. 控制面顺序、失败恢复与 PASS 后边界

严格顺序如下，每个箭头两侧都不得合并为同一 CAS：

```text
revision plan candidate (parent=7108562...)
  -> fresh independent entry review
  -> gate packet CAS (runtime control_expected_old)
  -> claim/fence CAS
  -> dispatch-ready/outbox CAS = ready_control_oid
  -> controller-only formal/ready-control object+two-ref provisioning
  -> fresh reviewer readiness-only
  -> dispatch ACK CAS = ack_control_oid
  -> controller-only no-ref ACK object import
  -> exact host-task continuation envelope to same reviewer
  -> reviewer ACK object/envelope/ref invariance verification
  -> cumulative execution + exact-three review
  -> immutable Result CAS
  -> S3.2 Execution Packet CAS
```

- entry review 必须先按第 2.4 节完成独立 clone provisioning，再复核本修订计划 commit/tree/唯一父、`7108562...` live order、A/B authority（含两条 result-control 单父可达性与 exact Result path/JCS digest）、superseded invalid entry attempts 不属于可达性 prerequisite、control 运行时语义、post-review Result 时间边界、ref-free ACK handoff、donor/trusted-action 门、HG1-HG12、源码/发行边界、命令、预算、角色与时序；只有 `PASS / 100`、P0/P1/P2=`0/0/0` 才放行 packet。
- packet 必须冻结本修订计划 digest、`7cd3dd1...` product baseline、`7108562...` source/state baseline、fresh reread 的 `refs/nextstep/control` 作为 `control_expected_old`、A/B 四个 Result paths/digests、`a3.0_a_result_control_oid=6677d0fcce3e6820f79aa0a8b7e619c9efa5152a`、`a3.0_b_result_control_oid=37e51936d7b23132fd8b5216800ba469bea80756`、ACK message path、唯一 donor/source 五项身份、reviewer host、fence 和所有 hard gates；未知 donor 或可信宿主不可用时不得创建 ready/outbox。
- reviewer readiness 必须在第 3.3 节 provisioning 全部成功后进行，并逐项证明 packet 冻结的 A/B result-control OID 为 frozen ready-control 的可达单父祖先且 exact Result tree path/JCS digest 匹配；缺 formal/control/object/path/ancestry 任一项都不 ACK。ACK 必须绑定同一 reviewer。
- ACK 后严格执行第 3.4 节：root/controller 无-ref导入 exact ACK objects，以唯一持久化 continuation envelope 精确传入 ACK OID，同一 reviewer 复算 Git 证明并复核 refs/FETCH_HEAD/remote/alternates。formal/control 在测试与验收前后都精确不变。
- cumulative Result 必须绑定 continuation event path/digest、envelope digest、ACK OID/parent/message path/JCS digest/raw commit digest；不得把 continuation event 自身包装成 Git 证明。
- 任一 identity/CAS/ACK/evidence 漂移都持久化 blocked/recovery；不得盲重试、换 reviewer 冒充同 attempt、合并 CAS 或重写旧 Result。正常 control 前进只影响下一 CAS 的 fresh expected-old，不改写 plan authority。
- receipt-loss 是计划内故障注入；除此之外若 donor/source、用户动作、trusted clock/verifier 或 namespace 失效，本 attempt 终止并保留只读证据，副本可销毁，source 不变。
- 累计 PASS 后，主控只允许先以**独立单父 expected-old CAS**创建 immutable A3.0 Result；复算 Result 后，才允许以**另一独立单父 expected-old CAS**创建 S3.2 Generation 2 packet。不得在 Result CAS 中夹带 S3.2 packet。
- A3.0 Result 不移动 formal，不完成 PC-14/M3.1/V3，不授权任何真实项目接入或开发，也不形成稳定发行。S3.2 仍使用历史计划冻结的 exact-14，职责仅为幂等 dispatch/control，不吸收 adoption。

## 10. 未决外部条件

1. 仍需选定一个满足第 3 节的真实、非 NextStep-native donor source，并在 packet 中冻结五项身份；本计划不预选、读取或修改任何真实项目。
2. 仍需确认执行宿主能提供生产等级 in-process verifier/clock/session/user-action capability；没有该能力时不能用临时 test verifier 替代。
3. 用户需在执行窗口看到 exact confirmation view 与 activation receipt 后分别完成接入确认和 rollback action；这两次动作尚未发生，任何既有泛授权均不计入。

上述条件未满足不影响本修订计划接受 fresh 独立 entry review，但会阻止 packet 进入 ready/ACK/执行；阻塞状态不得包装为 A3.0 PASS 或稳定发行。
