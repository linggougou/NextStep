# CR-007：既有项目安全接入（Existing Project Adoption）

- 状态：已由用户最终批准；V3 Generation 2 已生效，A3.0-A/B 已通过独立验收并集成；A3.0 cumulative acceptance 尚未开始，当前等待修订计划与 fresh 独立 entry review
- 记录日期：2026-08-30
- 来源：genealogy-hub 在已有 `S5/M1` 路线锁与计划的情况下，`nextstep status` 因无 formal/control 返回 `source-unavailable`
- 所属阶段：P5 / V3 当前阶段缺口候选
- 计划影响：全局 `plan_generation=5` 保持；V3 子计划已推进为 `v3_plan_generation=2`

## 1. 问题与用户价值

NextStep 当前可以校验或生成部分候选，并读取已经初始化的 formal/control 状态；它不能安全接入一个已经开发到中途、拥有路线锁、活动计划和验收证据但没有 `refs/nextstep/*` 的项目。

这使“选择已有项目、识别当前阶段、继续推进”的已会签交互目标无法形成可运行闭环。用户只能继续用 Codex 自身流程，或者错误地从 S1.1 重跑、伪造历史会签或手工创建 refs；后三种路径均不可接受。

## 2. Change Intake 分流结论

- 类型：**V3 当前阶段缺口候选，高风险基础变更**。
- 当前阶段必要性：V3/PC-14 要求至少一个正式支持主宿主完成 full 自动分派与恢复；已有项目如果不能先建立可信控制身份，就无法进入该运行链。CR-006 的真实项目验证也不能由 NextStep 自测仓库或复制 fixture 替代。
- 路线影响：不改变 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`，不新增大里程碑，不改变 PC 主版本归属、技术栈、主载体或最终提升门禁。
- 计划影响：不能原地扩大 S3.2 exact-14。Generation 1 的 S3.1 已完成 fresh acceptance、main 集成与 control gate；Generation 2 只能在 compatibility audit PASS 后显式 carry forward。A3.0 仍位于 S3.1 与 S3.2 之间，S3.2 原职责与 exact-14 保持不变。
- 当前许可：用户已接受候选 `36242fbb2e938225c438871ada0731e06b9c37a4` 与独立评审 `288c1ca0d92c7c1834a0c65bc2c4cb8efe86e504`，并指示持续开发直到稳定版。Generation 2 的两个分离 expected-old CAS 与 A3.0-A/B 的独立 packet/acceptance/integration 均已完成；持续授权仍不允许跳过 A3.0 cumulative acceptance 的修订计划和 fresh 独立 entry review，不允许直接创建 cumulative packet/claim/dispatch，也不允许把 donor 副本或真实项目 refs 用作首轮开发证据。

## 2.1 最终批准后的时间漂移说明

- A8 的架构、信任、恢复、回滚和范围结论继续作为已批准依据。
- A8 关于“V3 仍处于 entry review、S3.1 尚未实施”的判断是当时的时间快照，已被后续 control 历史超越，不能作为 generation CAS 的实时依据。
- 2026-08-30 路径 A 已收口：subject=`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a`，fresh acceptance attempt 6 Result=`sha256:5bff9b08619f4f1d71367e7df0cab697ebc08d7d2eb430171d170b4be1539678`，review=`a625089bf2828c7ccee7a286ef0c66a1c28c3457`，main integration=`e3df650a6861274ff076c72276281cbf528e9188`。
- historical readiness control=`c8cbba15a3b08f49b8e0d1bfaa7549b15a24dbe9` 已登记 S3.1 valid acceptance/integration；后续 Generation 2 advance/ack 均已按 expected-old 分离完成。
- A3.0-A candidate=`696b03ec25e97c30e52576d971d14f1f565ea729`，independent review/integration main=`1825bcfd01feb796a795d20005577b5e7f26eae4`，review tree=`5b9d932d96786183a213b358c2cc1de379b9b242`；package acceptance attempt 2=`PASS / 100`、Result=`sha256:3c8203c1baea88227621eb1c1fe02f20e329e8bbd1e940610a8d147b140298f6`，integration control=`c9935db2d39d7990f7e28c8f70aecc7eb953b25e`。formal 仍为 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，真实项目 refs 未创建。
- A3.0-B accepted subject=`60d373aef79141a03418aca5c75447742c6a87b5`、tree=`35cec7e7f509c3e3cef01a338def9d9b9c2935f2`，execution Result=`sha256:05d2c3d0be9f241a4c6796ce64d6861051442b46b605054b0ac1f9339f419050`；independent acceptance attempt 6/fence 187=`PASS / 100`、P0/P1/P2=`0/0/3`，acceptance Result=`sha256:b49fc780024d0fd50ab5190b7827db2089ff5552753a2f413dc375e98c29343e`，Result CAS control=`37e51936d7b23132fd8b5216800ba469bea80756`。main/integration/review=`7cd3dd1fe3aae23a1759d604783b182558fb4c15`、tree=`462fb1877b42410acb0ffe2106be20dac7dc31c9`，post-integration control=`55e942b0bdc1318372f6c6226f8a469f7fa894e8`；formal 仍未移动，真实项目 refs 仍为 0。
- 详见 `docs/exec-plans/active/p5-v3-existing-project-adoption-generation-readiness.md`；该准备文档及其独立评审不执行任何控制副作用。

## 3. 产品语义

### 3.1 Adoption 的含义

Adoption 只表示：

- 用户确认某个不可变 Git commit 是 NextStep 首次接入的现有业务基线；
- 用户确认该 commit 中指定 Git blobs 所表达的当前阶段、里程碑、非目标和已知门禁状态；
- NextStep 为后续新活动建立专用 control 身份；
- 后续 `status` 能区分 adopted baseline 与 NextStep-native version signoff。

Adoption 不表示：

- NextStep 验证过接入前的全部历史开发、测试或会签；
- 现有阶段已经完成、可发布或满足后续 PC；
- 用户授权自动编码、派发、formal promotion 或阶段切换；
- 路线锁、活动计划、业务历史或当前分支被改写。

### 3.2 历史证据分类

每条接入前证据必须且只能标记为：

| 分类 | 含义 | 可支持的结论 |
|---|---|---|
| `verified` | NextStep 在接入时可从候选 HEAD 的 blob 与可重复本地命令机械复核 | 仅支持被复核的精确事实 |
| `user-declared` | 用户明确确认，但 NextStep 未独立验证 | 可展示，不得提升为 NextStep PASS |
| `unknown` | 无充分证据或未执行 | 保持未完成/待验证 |

禁止把 `user-declared` 或 `unknown` 写入 `version_signoffs`，禁止生成伪造的 V1/V2 formally-completed 记录。

## 4. 最小运行流程

1. **只读检查**：公开 `adoption-inspect` 读取候选 HEAD、路线锁 blob、活动计划 blob、验证摘要 blob、Git 状态和 refs namespace，输出 canonical candidate。
2. **候选展示**：宿主 AI 可以提出阶段映射，但必须展示来源 blob、证据分类、未知项、非目标和激活后果；kernel 不从自然语言自行猜阶段。
3. **可信确认**：用户对 exact candidate digest 执行独立 action；进程内 verifier 验证 action、会话、时钟、展示摘要和 candidate digest，形成 confirmation envelope。
4. **激活预检**：trusted host 重读全部 Git 身份和 blobs，验证 candidate 未过期、HEAD/工作区/worktree/namespace 未漂移。
5. **对象准备**：创建零父 control genesis，再创建以 genesis 为唯一父的 activation commit；对象尚不可达，不代表激活成功。
6. **原子激活**：在一次 Git ref transaction 中以 expected-missing 同时创建 `refs/nextstep/formal=<candidate_head>` 和 `refs/nextstep/control=<activation_oid>`。
7. **提交后复核**：重读 ref pair、control 父链、tree blobs 和 namespace；任何不可裁决异常进入受控恢复，不报告成功。

## 5. 独立 control genesis

- genesis 必须是零父 commit，tree 只包含最小 schema version、repository identity、adoption candidate digest 和 genesis kind；不得以业务 HEAD 或 formal commit 为父。
- activation commit 必须以 genesis 为唯一父，tree 包含完整 checkpoint、registry、adopted-baseline record、确认 envelope 引用和回滚元数据。
- 最终 control ref 指向 activation，因此兼容当前“最新 control 必须单父”的读取前置；genesis 通过 activation 父链可达。
- 业务 HEAD 只由 formal ref 和 adopted-baseline record 绑定，不进入 control ancestry。
- 仅创建 Git objects 不算副作用成功；ref transaction 失败时 objects 保持悬空、可由 Git GC 回收，不得写成功状态或人工删除未知对象。

## 6. Adoption 状态模型

新增独立 `adopted-baseline` 结论，不复用 `version_signoffs`：

- 身份：repository、candidate HEAD、route lock blob、active plan blob、evidence summary blobs、candidate/envelope digest。
- 确认：verified user action ref、trusted verifier identity、trusted timestamp、expiry。
- 状态：`activated`、`rollback-eligible`、`rollback-blocked`、`superseded`。
- 当前阶段：用户确认的 stage/milestone/scope；每个字段带 `verified|user-declared|unknown` 来源分类。
- 边界文案固定包含：`adopted baseline; historical gates not verified by NextStep`。

状态投影规则：

1. 只有整个 `refs/nextstep/*` namespace 为空时，才安全返回 `PROJECT_NOT_ADOPTED`；不声称损坏。
2. 仅存在一个 `formal` 或 `control`，且 namespace 中没有额外 `refs/nextstep/*` 项时，返回 `REF_PAIR_INCOMPLETE`，可附不敏感的 `missing_refs` 枚举；禁止自动修复。
3. formal/control 均缺失但存在其他 `refs/nextstep/*`，或合法 pair 之外还存在额外 `refs/nextstep/*` 时，返回 `ADOPTION_SOURCE_CONFLICT`；不得降级为“未接入”或自动补齐。
4. activation 有效且尚无后继任务：投影 adopted-baseline 当前阶段、证据分类、未知门禁和显式下一步；`latest_formal_conclusion` 不得使用 `Vx formally completed`。
5. 已有后继 NextStep task：正常 current task identity 优先；adopted-baseline 作为历史基线保留。
6. candidate 复核漂移：返回 `ADOPTION_CANDIDATE_STALE`，零 ref 写入。
7. refs 或 control 内容损坏：继续 fail closed，使用不泄密的结构化 reason；不得降级为未接入。

## 7. 可信确认边界

- 公开 CLI 只允许只读 inspect/candidate validation，不提供会造成“shell 可安全 commit”错觉的 `nextstep adopt --commit`。
- 激活只能由 trusted in-process host port 调用；stdin、argv、环境变量、文件中自述的确认、机器回执或同一角色自批均无效。
- confirmation envelope 必须绑定 candidate digest、用户实际看到的 stage/milestone/evidence/unknown/side-effect/rollback view、session、trusted clock 和 verifier result。
- candidate 或展示内容任一变化都使旧 action/envelope 失效；过期与 exact-expiry 均拒绝。
- 激活 port 与主对话、候选生成、独立评审职责分离；激活成功也不产生开发授权。

## 8. Git 与工作区不变量

### 8.1 候选来源

- 路线锁、活动计划、验证摘要只允许来自 candidate HEAD 中的 Git blobs；工作树文件、聊天文本和未跟踪文件不能成为正式候选来源。
- candidate 明确记录 blob OID 与 canonical digest；路径不存在、符号链接越界、重复真源或结构冲突即阻塞。

### 8.2 工作区与 worktree

- 激活要求目标 worktree 的 HEAD 精确等于 candidate HEAD，index、tracked worktree 和 untracked 集合均为空；ignored 文件是否允许必须由冻结策略显式决定，默认不参与证据且不得遮蔽真源路径。
- 记录 `git worktree list --porcelain` 的规范投影摘要；同一分支在另一 worktree 检出、同一 candidate 根存在不可裁决 worktree 或 worktree 集合漂移时阻塞。
- 不切换分支、不 stash、不清理、不删除、不提交业务文件。

### 8.3 Ref namespace 与事务

- inspect 与激活前要求整个 `refs/nextstep/*` namespace 为空，而非只检查 formal/control。
- 公开 inspect 只有在整个 namespace 为空时才允许给出 `PROJECT_NOT_ADOPTED`；extra-only namespace 与 pair+extra namespace 都属于 `ADOPTION_SOURCE_CONFLICT`。
- 事务前重读 namespace、HEAD、blobs、worktree 投影和 candidate digest。
- 使用 Git `update-ref --stdin` transaction，以 zero OID 作为 formal/control expected-old；两 ref 必须同一 transaction prepare/commit。
- 事务后重读 namespace；若出现未授权额外 ref，不能报告成功，进入第 9 节的精确恢复判断。

## 9. 回滚与恢复

### 9.1 可原子回滚的唯一条件

必须同时满足：

- formal 仍精确等于 candidate HEAD；
- control 仍精确等于 activation OID；
- activation 没有任何后继 control 状态或外部已确认副作用；
- `refs/nextstep/*` 仅包含这两个预期 refs；
- rollback request 绑定 activation receipt、当前 namespace digest 和 trusted authorization。

满足时才可在一次 expected-OID transaction 中同时删除 formal/control。删除成功后重读 namespace 为空；genesis/activation objects 留给 Git GC，不执行对象级删除。

### 9.2 禁止回滚

- control 已有后继、任何任务/outbox/claim/ACK/Result 已持久化、formal 已变化、出现额外 ref、OID 不匹配或副作用不可裁决时，禁止删除 refs。
- 此时通过新的 control transition 标记 `rollback-blocked` 或进入恢复，不反转历史、不重置业务分支。
- 进程在对象创建后、ref transaction 前崩溃：重跑 inspect/activation，旧悬空对象不构成成功。
- transaction 成功后回执丢失：按 candidate/envelope/effect identity 查询 exact ref pair，create-or-return 同一 activation receipt；不得创建第二套 genesis。

## 10. 错误合同

| Code | 条件 | 副作用 |
|---|---|---|
| `PROJECT_NOT_ADOPTED` | entire namespace 为空 | 无 |
| `REF_PAIR_INCOMPLETE` | formal/control 只存在一个，且无额外 nextstep refs | 无；禁止自动补齐 |
| `ADOPTION_CANDIDATE_STALE` | HEAD/blob/worktree/worktree-list/namespace 任一漂移 | 无 |
| `ADOPTION_CONFIRMATION_REJECTED` | action/envelope/verifier/clock/binding 无效 | 无 |
| `ADOPTION_SOURCE_CONFLICT` | 真源缺失、重复、越界、extra-only namespace、pair+extra namespace 或其他结构冲突 | 无 |
| `ADOPTION_ACTIVATION_CONFLICT` | expected-missing transaction 或提交后身份复核失败 | 不误报成功；进入恢复判断 |
| `ADOPTION_ROLLBACK_BLOCKED` | 不满足精确双 ref 回滚条件 | 保持 refs 不变 |

错误消息不得包含敏感输入、完整聊天、无关绝对路径、Token 或用户未要求展开的 Git 内容。

## 11. 计划、代际与历史证据

- 全局 `plan_id=p5-product-implementation`、`route_generation=1`、`plan_generation=5` 不变。
- V3 子计划已从 generation 1 修订并确认到 generation 2；generation 1 文档和评审永久保留。
- S3.1 generation 1 的实现/验收只有在完成自身 fresh acceptance 且兼容性审计证明本 CR 未改变其输入、输出、Schema、PC-14 子结论和风险门禁后，才可被 generation 2 显式 carry forward；不能自动复用运行态或 REVISE 结论。
- generation 1 尚未创建的 S3.2..S3.5 packet 不产生伪 tombstone；generation-advance 消息必须声明旧未来入口 superseded，任何迟到 generation 1 future packet 一律拒绝。
- 已完成：CR/设计/计划独立评审 PASS -> 用户最终批准 CR -> fresh readiness/compatibility 独立 PASS -> V3 子计划 generation-advance CAS -> generation-ack CAS -> A3.0-A/B 独立 package acceptance 与 main/control 集成。A3.0 cumulative acceptance 尚未开始；首版计划 candidate=`453b0693b1d45faa903127cce55a2538ad47fdf3`、review=`493f15b6e7286f11314fdd7f49de4fb9b814b81a` 的 entry verdict=`REVISE / 90`、P0/P1/P2=`0/1/0`，不进入有效计划 main 链。当前唯一入口为基于 live authority 状态同步提交重做修订计划并 fresh 独立 entry review；后续每步继续分离，任一漂移均 fail closed。

## 12. 最小实施包

V3 Generation 2 完成 advance/ack 后，在 S3.1 与 S3.2 之间增加 `A3.0`，不改变 S3.2 exact-14：

- `A3.0-A`：adoption candidate Schema/domain、只读 Git source、公开 inspect CLI、正负/漂移 fixture。
- `A3.0-B`：adopted-baseline Schema/projector、trusted confirmation port、零父 genesis/单父 activation、双 ref transaction、回执丢失恢复和精确回滚测试。
- `A3.0-B` 还必须显式承接 adoption 影响到的公开 `project-status` contract surface：`project-status-projection` Schema、`project-status` CLI、`nextstep status` 聚合入口、对应 CLI/fixture/test 以及与 Generation 1 `S3.5-B` future exact surface 的所有权协调。

两个包分别接受 I/X/P/Profile 与独立 package acceptance；A3.0 累计 PASS 只允许进入 S3.2，不单独完成 PC-14/M3.1。

当前进度：A3.0-A/B 已分别完成 package acceptance 与 main/control 集成；A3.0 cumulative acceptance 尚未开始。A3.0-A/B 的源码主线能力与单包 PASS 不等于累计验收、真实项目 activation、历史 signoff、A3.0/M3.1/V3 完成或稳定发行。

## 13. 验收门禁

- Candidate：HEAD/blobs/worktree/namespace 绑定、确定性 JCS/digest、未知证据不升级。
- Confirmation：真实独立 user action、trusted verifier/clock、重放/过期/展示漂移拒绝。
- Genesis：零父 genesis、单父 activation、业务 HEAD 不在 control ancestry。
- Activation：双 ref expected-missing 同事务；失败零成功声明，回执丢失 create-or-return。
- Projection：adopted-baseline 与 version signoff 分离；不伪造历史 PASS；错误分类稳定。
- Workspace：dirty/index/untracked、多 worktree、namespace/事务前后漂移全覆盖。
- Rollback：仅无后继时 expected-OID 双 ref 删除；阻塞条件不反转历史。
- Product：在至少一个非 NextStep-native 真实项目的隔离副本上完成候选与人工确认演练；不得直接使用真实项目 refs 作为首轮开发证据。

## 14. 迁移与回滚

- 未激活项目无需迁移；`status` 只改进安全错误分类。
- 已有 NextStep-native 项目继续按 version signoff/current task 投影，不经过 adoption 分支。
- adoption activation 失败不修改业务 HEAD、branch、index、worktree 或 refs pair。
- 只有第 9.1 节条件全部成立才允许删除初始 ref pair；否则保持审计历史并进入后续恢复。
- 功能整体不可验证时，回退为只读 inspect/candidate 输出，不开放 trusted activation，不伪造支持。

## 15. 明确非目标

- 不自动理解任意历史仓库并宣称其阶段正确。
- 不把 Markdown、聊天或用户口述直接提升为 verified。
- 不迁移或重写业务提交历史，不把业务 HEAD 接到 control 父链。
- 不自动创建任务、worktree、subagent、packet 或 formal promotion。
- 不建设数据库、常驻服务、通用迁移平台或多 Agent 编排系统。
- 不在本 CR 中修改 S3.2 实现或 exact-14。
- 不接入 genealogy-hub 或任何真实项目 refs。

## 16. 关闭条件

本 CR 只有在以下全部完成后才能关闭：

1. Change Intake、设计合同与 V3 Generation 2 计划通过独立 L3；
2. 用户最终批准 CR，V3 generation advance/ack 以分离 CAS 完成；
3. A3.0-A/B 实现、测试、独立 package acceptance 和 main 集成通过；
4. 非 NextStep-native 隔离项目演练通过且不触碰真实项目 refs；
5. M3.1/V3 累计验收正确承接，不把 adoption 冒充 PC-14 或历史 signoff；
6. 文档、状态投影、恢复和回滚证据全部同步。
