# CR-007：既有项目安全接入（Existing Project Adoption）

- 状态：Change Intake 候选，等待独立评审与用户最终批准
- 记录日期：2026-08-30
- 来源：genealogy-hub 在已有 `S5/M1` 路线锁与计划的情况下，`nextstep status` 因无 formal/control 返回 `source-unavailable`
- 所属阶段：P5 / V3 当前阶段缺口候选
- 计划影响候选：全局 `plan_generation=5` 保持；V3 子计划 `v3_plan_generation 1 -> 2`

## 1. 问题与用户价值

NextStep 当前可以校验或生成部分候选，并读取已经初始化的 formal/control 状态；它不能安全接入一个已经开发到中途、拥有路线锁、活动计划和验收证据但没有 `refs/nextstep/*` 的项目。

这使“选择已有项目、识别当前阶段、继续推进”的已会签交互目标无法形成可运行闭环。用户只能继续用 Codex 自身流程，或者错误地从 S1.1 重跑、伪造历史会签或手工创建 refs；后三种路径均不可接受。

## 2. Change Intake 分流结论

- 类型：**V3 当前阶段缺口候选，高风险基础变更**。
- 当前阶段必要性：V3/PC-14 要求至少一个正式支持主宿主完成 full 自动分派与恢复；已有项目如果不能先建立可信控制身份，就无法进入该运行链。CR-006 的真实项目验证也不能由 NextStep 自测仓库或复制 fixture 替代。
- 路线影响：不改变 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`，不新增大里程碑，不改变 PC 主版本归属、技术栈、主载体或最终提升门禁。
- 计划影响：不能修改正在执行的 V3 Generation 1，也不能静默扩大 S3.2 exact-14。若本 CR 通过，使用 V3 plan-generation 2 增量计划，在 S3.1 与 S3.2 之间新增无 PC 独占归属的 `A3.0` remediation package；S3.2 原职责与 exact-14 保持不变。
- 当前许可：只允许形成 CR、设计合同、计划修订候选和独立评审。评审 PASS 不自动批准 CR，不授权 generation CAS、packet、编码或目标项目接入。

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

1. formal/control 均缺失：安全返回 `PROJECT_NOT_ADOPTED`；不声称损坏。
2. 仅存在一个：返回 `REF_PAIR_INCOMPLETE`，可附不敏感的 `missing_refs` 枚举；禁止自动修复。
3. activation 有效且尚无后继任务：投影 adopted-baseline 当前阶段、证据分类、未知门禁和显式下一步；`latest_formal_conclusion` 不得使用 `Vx formally completed`。
4. 已有后继 NextStep task：正常 current task identity 优先；adopted-baseline 作为历史基线保留。
5. candidate 复核漂移：返回 `ADOPTION_CANDIDATE_STALE`，零 ref 写入。
6. refs 或 control 内容损坏：继续 fail closed，使用不泄密的结构化 reason；不得降级为未接入。

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
| `REF_PAIR_INCOMPLETE` | formal/control 只存在一个 | 无；禁止自动补齐 |
| `ADOPTION_CANDIDATE_STALE` | HEAD/blob/worktree/worktree-list/namespace 任一漂移 | 无 |
| `ADOPTION_CONFIRMATION_REJECTED` | action/envelope/verifier/clock/binding 无效 | 无 |
| `ADOPTION_SOURCE_CONFLICT` | 真源缺失、重复、越界或结构冲突 | 无 |
| `ADOPTION_ACTIVATION_CONFLICT` | expected-missing transaction 或提交后身份复核失败 | 不误报成功；进入恢复判断 |
| `ADOPTION_ROLLBACK_BLOCKED` | 不满足精确双 ref 回滚条件 | 保持 refs 不变 |

错误消息不得包含敏感输入、完整聊天、无关绝对路径、Token 或用户未要求展开的 Git 内容。

## 11. 计划、代际与历史证据

- 全局 `plan_id=p5-product-implementation`、`route_generation=1`、`plan_generation=5` 不变。
- V3 子计划从 generation 1 修订为候选 generation 2；generation 1 文档和评审永久保留。
- S3.1 generation 1 的实现/验收只有在完成自身 fresh acceptance 且兼容性审计证明本 CR 未改变其输入、输出、Schema、PC-14 子结论和风险门禁后，才可被 generation 2 显式 carry forward；不能自动复用运行态或 REVISE 结论。
- generation 1 尚未创建的 S3.2..S3.5 packet 不产生伪 tombstone；generation-advance 消息必须声明旧未来入口 superseded，任何迟到 generation 1 future packet 一律拒绝。
- 推进需要：CR/设计/计划独立评审 PASS -> 用户最终批准 CR -> 独立 V3 plan generation-advance CAS -> generation-ack CAS。每步分离；本授权不包含这些 CAS。

## 12. 最小实施包候选

若后续获批，V3 Generation 2 在 S3.1 与 S3.2 之间增加 `A3.0`，不改变 S3.2 exact-14：

- `A3.0-A`：adoption candidate Schema/domain、只读 Git source、公开 inspect CLI、正负/漂移 fixture。
- `A3.0-B`：adopted-baseline Schema/projector、trusted confirmation port、零父 genesis/单父 activation、双 ref transaction、回执丢失恢复和精确回滚测试。

两个包分别接受 I/X/P/Profile 与独立 package acceptance；A3.0 累计 PASS 只允许进入 S3.2，不单独完成 PC-14/M3.1。

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
