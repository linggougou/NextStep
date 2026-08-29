# P5 可承受性护栏实施计划

- 状态：cumulative-gate-passed-v2-formally-completed（`change_request_closed=false`）
- 变更入口：[CR-006](../../change-requests/006-scalability-guardrails.md)
- 生命周期阶段：S5 开发落地
- 路线位置：P5 跨版本基础护栏；不新增版本，不改变 V2 首个产品 packet 前门禁
- 当前状态：SG-1、SG-2、SG-3 package gate 与 cumulative gate 均已通过，CR-006 仍为 `change_request_closed=false`，qualified real runs 仍为 0/3。V2 已由独立版本累计验收、用户会签与分离 completion CAS 标记为 formally-completed；这不是本护栏计划自身完成 V2，也不关闭 CR-006。本状态同步固定父/基线=`5d389712431c52352df4b5b50d1fa16e97ea3fc0`，live main 运行时解析；formal=F16 未移动，control=`4f466224a442dd9650905722398bfad743e327fa`，`plan_generation=5`。下一唯一入口为独立 alpha 计划与 fresh entry review；alpha packet/package/install/tag 尚不存在

## 1. 阶段目标

用三个路径互斥、可独立回滚的最小任务包，建立：

1. 可机器判定且不削弱既有门禁的复杂度预算；
2. 从现有正式身份只读生成的人类状态投影；
3. 能拒绝伪造真实运行的项目价值验证框架。

这三个任务包只降低治理失控风险，不承载 V2 或 V4 产品完成声明。

## 2. 总体交付物与 Definition of Done

### 2.1 可验收交付物

- SG-1：预算 Schema、纯领域预算判定、边界/超限/不可测 fixture 与测试。
- SG-2：状态投影 Schema、纯领域投影、只读 Git 来源适配、CLI、冲突/过期 fixture 与测试。
- SG-3：价值验证 Schema、纯领域聚合、CLI、真实运行协议、合成冒充负例与测试。

### 2.2 总体 DoD

- 三包路径完全互斥；任一包的 diff 不包含其他包的授权路径。
- 每包均先提交可复现 RED 证据，再做最小 GREEN；不得先写实现后补“会失败的测试”。
- `pnpm check` 全量通过，且新增失败路径不会写 formal/control、用户工作树或项目业务真源。
- 不新增运行时依赖、数据库、服务、远程控制面、新正式 ref 或宿主支持声明。
- 每包独立验收 PASS 后才可进入累积验收；任一 REVISE/REJECT 只退回该包。
- SG-3 完成只表示框架可用；三次真实项目运行仍为未完成的后续运营证据。
- control 先完成 `plan_generation 4 -> 5` 的 generation-advance 与 generation-ack 两个独立 CAS；SG-1 packet 只能绑定已确认的 generation 5。

### 2.3 明确非目标

- 不创建或实现 V2 S2.1..S2.4 产品 packet，不声明 PC-09..13 或 V2 完成。
- 不把 SG-2 的摘要投影当作 PC-12 的四态门禁、进度产品能力或用户会签。
- 不计算 Q1..Q12、不生成 V4 验收矩阵，不声明 PC-19、PC-20 或 V4 完成。
- 不清理、压缩或改写历史 control/ref/Result；本轮先测量和阻塞扩张，不做历史迁移。
- 不把测试 fixture、NextStep 自测仓库、同一项目复制品或 AI 补写记录算作真实项目运行。

## 3. 公共实施约束

### 3.0 控制身份与启动顺序

- `plan_id=p5-product-implementation`、`route_generation=1` 保持不变；新 SG 任务统一使用 `plan_generation=5`。
- 任务身份固定为 `P5/CR-006/SG-1`、`P5/CR-006/SG-2`、`P5/CR-006/SG-3`，首次 `task_attempt=1`；不得复用 V2 的 S2.1..S2.4 或 generation 4 任务身份。
- generation 4 的 V1 完成记录与正式证据保持有效、只读；generation 5 advance 只冻结新的后继计划边界，不反向改写历史完成状态。
- 启动链固定为：replacement L3 planning PASS → 精确 generation-advance CAS 授权 → generation-advance CAS → 独立 generation-ack CAS → 精确 SG-1 packet CAS 授权 → SG-1 packet CAS。packet、claim/fence、dispatch 和代码仍是分离边界。
- generation 5 ACK 固化前，三个实现 worktree 可以不存在；不得预写测试或生产候选。SG-2/SG-3 也不得与 SG-1 packet 并行创建。

### 3.1 并行与互斥

三个包在各自 packet、claim/fence 与 dispatch 分别授权后可进入独立 worktree 实现，唯一共享只读基线为对应 packet 冻结的 working parent。禁止一个包修改另一个包的路径，禁止共享临时 helper；确有公共抽象需求时先停止并修订本计划，不新增第四包。

合入顺序不形成产品依赖；建议按 `SG-1 -> SG-2 -> SG-3` 串行整合，每次整合后重跑全量检查。后合入者必须适配主分支，不得回滚先合入内容。

### 3.2 总复杂度上限

| 项目 | 上限 |
|---|---:|
| 任务包 | 3，禁止增加 |
| 新增生产/Schema 文件 | 9 |
| 新增测试文件 | 7 |
| 新增 fixture | 16 |
| 净新增生产代码 | 1,200 行 |
| 净新增测试、fixture 与协议正文 | 1,800 行 |
| 新运行时依赖 | 0 |
| 既有 Schema/领域契约修改 | 0 |

超过任一上限即停止；只能删减范围或通过新的 Change Request 调整，不能静默放宽。

### 3.3 共同回滚

- 所有实现先存在于独立候选分支，不直接移动 formal/control。
- 未通过包只撤销其新增路径，不修改已通过包和既有文件。
- 若累积测试暴露跨包冲突，三包均保持候选状态，回到冲突来源包；不得通过跳过测试或放宽 Schema 合入。
- 任一 Git/ref/工作树污染出现时，验收结论为 REJECT；保留现场证据并停止，不使用破坏性重置。

## 4. SG-1：复杂度预算判定

### 4.1 目标与冻结路径

只实现纯函数预算判定，不读取 Git、不写控制台账、不自动修改流程。

允许路径仅为：

- `schemas/v1/scalability-budget.schema.json`
- `src/domain/scalability-budget.ts`
- `tests/domain/scalability-budget.test.ts`
- `tests/fixtures/scalability-budget/**`，最多 4 个 fixture

本包上限：2 个生产/Schema 文件、1 个测试文件、4 个 fixture；生产代码不超过 320 行，测试与 fixture 不超过 420 行。

### 4.2 冻结预算

| 指标 | 上限 |
|---|---:|
| `control_cas_per_attempt` | 12 |
| `immutable_evidence_files_per_attempt` | 24 |
| `user_visible_confirmations_per_attempt` | 2 |
| `consecutive_non_pass_attempts_per_milestone` | 2 |
| `active_plan_generations_per_milestone` | 1 |
| `active_independent_tasks_per_packet` | 5 |

输出只允许 `within-budget`、`exception-required`、`unmeasurable` 三态；它不是 PC-12 四态门禁。缺少任一计数、计数为负、未知版本或超过阈值时不得返回 `within-budget`。既有强制门禁超过预算时必须返回例外，不得建议删除门禁。

### 4.3 TDD RED / GREEN

RED 必须先证明：

- 六项边界值可以通过，任一 `上限 + 1` 失败；
- 缺字段、负数、非整数、未知版本为 `unmeasurable` 或 Schema 拒绝；
- 同时多项超限时稳定列出全部超限项；
- 输入含“跳过独立验收/用户会签/CAS”的豁免建议时拒绝。

GREEN 只实现使上述测试通过的 Schema、解析和纯判定，不实现 CLI、文件扫描、自动例外审批或 control 写入。

### 4.4 DoD 与独立验收

- 同一输入产生确定性 JCS 可序列化结果，超限项顺序稳定。
- 预算数值只能来自 CR-006 冻结常量，调用方不能通过输入放宽。
- 独立验收者只读核对候选 commit/tree/digest、RED 前后证据、路径范围和四类负例。
- PASS 只表示预算判定内核可用，不表示现有控制历史已达标或任何产品 PC 完成。

### 4.5 回滚

删除本包四类新增路径即可完整回滚；不得修改现有门禁或历史证据以“恢复预算内”。

## 5. SG-2：人类状态投影

### 5.1 目标与冻结路径

从显式项目根读取 `refs/nextstep/formal`、`refs/nextstep/control` 中的 checkpoint/registry 身份，生成一份只读摘要。输出字段只包含：当前阶段、当前范围、最近正式结论、阻塞、下一步、风险摘要、formal/control OID、来源摘要和新鲜度。

允许路径仅为：

- `schemas/v1/project-status-projection.schema.json`
- `src/domain/project-status-projection.ts`
- `src/adapters/node/project-status-source.ts`
- `src/cli/project-status.ts`
- `tests/domain/project-status-projection.test.ts`
- `tests/cli/project-status.test.ts`
- `tests/adapters/node/project-status-source.test.ts`
- `tests/fixtures/project-status/**`，最多 6 个 fixture

本包上限：4 个生产/Schema 文件、3 个测试文件、6 个 fixture；生产代码不超过 520 行，测试与 fixture 不超过 760 行。

### 5.2 TDD RED / GREEN

RED 必须先证明：

- 一致的 formal/control fixture 产生固定、简洁且字段完备的投影；
- ref 缺失、checkpoint 与 registry 身份冲突、OID 非法、来源过期或未知状态时 fail closed，`next_action` 不得猜测；
- CLI 成功时 stdout 只有一份 JCS JSON，诊断只走 stderr；失败退出码非 0；
- 运行前后 formal/control OID、`git status --porcelain` 和 fixture 字节完全不变；
- 默认输出不泄露完整任务历史、聊天、源代码、密钥或全部证据列表。

GREEN 只实现显式项目根解析、Git plumbing 只读来源、纯投影和 CLI。不得写 Markdown 状态文件、不得 checkout control ref、不得修改 `docs/PRODUCT_SENSE.md`、Skill 或 package scripts。

### 5.3 DoD 与独立验收

- 在一致 fixture 上，用户无需理解 claim/fence/generation 即可回答“现在在哪、为什么停、下一步是什么”。
- 审计身份仍可通过 formal/control OID 和来源摘要追溯；摘要不能覆盖正式真源。
- 独立验收者绑定候选 commit/tree/digest，执行正例、冲突、过期、敏感信息和零写入反扫。
- PASS 只表示只读投影工具可用，不等于 PC-12、S2.3/S2.4 或 V2 完成。

当前验收状态：implementation attempt 2 已通过 attempt 7 唯一正式 package acceptance，结论 `PASS / 99`；attempt 6 的 `REVISE / 70` 仅由隔离环境依赖未预置触发，未要求修改候选。定向测试 `16/16`、全量 `494/494`，coverage Lines/Branches/Functions=`93.44/88.38/99.19`。唯一 P2 为 RED 原始终端 transcript 未独立固化，留待 CR-006 累积验收继续披露。

### 5.4 回滚

删除本包新增路径即可回滚。若 Git plumbing 在某宿主不可用，返回不可用并保留手工读取真源路径，不降级为猜测状态。

## 6. SG-3：真实项目价值验证框架

### 6.1 目标与冻结路径

只交付证据协议、记录 Schema、纯聚合判定和离线 CLI。框架测量：到首次冻结需求的时间、用户介入次数、误阻塞数、恢复时间和项目结果；不采集完整业务内容。

允许路径仅为：

- `docs/qa/real-project-value-validation.md`
- `schemas/v1/project-value-run.schema.json`
- `src/domain/project-value-validation.ts`
- `src/cli/project-value-validation.ts`
- `tests/domain/project-value-validation.test.ts`
- `tests/cli/project-value-validation.test.ts`
- `tests/fixtures/project-value-validation/**`，最多 6 个 fixture

本包上限：3 个生产/Schema 文件、1 个协议文档、2 个测试文件、6 个 fixture；生产代码不超过 360 行，测试、fixture 与协议正文不超过 620 行。

### 6.2 真实运行资格

只有同时满足以下条件的记录才可计为一次真实运行：

- `run_kind=real`、`collection_mode=prospective`、`project_origin=external-user-project`；三个字段分别使用冻结枚举，禁止引入复合取值；
- 由用户拥有或明确授权的非 fixture 项目产生，并具有唯一不可逆项目身份、独立运行 ID、开始/结束时间和原始证据摘要；
- `evidence_binding_digest` 精确匹配 `sha256(JCS({run_id,project_identity,evidence_digest}))`；该 binding 只防受支持路径误配，不能抵抗恶意磁盘操作者伪造整条声明；
- 记录是否使用 NextStep、人工介入次数、阻塞与恢复事件、最终结果和用户确认；
- 不与另一次运行共享项目身份；同一项目复制、重复执行或改名不能凑数；
- 不含完整聊天、源代码、密钥或未经同意的业务数据。

`synthetic`、测试 fixture、NextStep 自测仓库、AI 生成样例和事后补写且无原始证据的记录只能验证框架，真实运行计数恒为 0。

整批拒绝与合法排除严格分离：Schema、时间、数值、敏感输入或重复 `run_id` 使整批失败，重复 ID 返回 `DUPLICATE_RUN_ID`；其余合法但不合格的记录进入 `excluded_records`。重复 `project_identity` 时，该 identity 的所有记录均排除。每条排除记录只取一个 reason，优先级与 exact code 固定为：`duplicate-project-identity`、`synthetic`、`retrospective`、`nextstep-self`、`nextstep-derived`、`used-nextstep-false`、`missing-user-authorization`、`missing-user-confirmation`、`evidence-binding-mismatch`。

### 6.3 TDD RED / GREEN

RED 必须先证明：

- 格式完整的 synthetic fixture 可用于 Schema/计算测试，但真实运行计数仍为 0；
- synthetic fixture 使用非 external 来源，只把 `run_kind` 改为 real 仍按来源排除；重复项目 identity 的全部记录排除，重复 `run_id` 整批返回 `DUPLICATE_RUN_ID`；
- 缺 required 时间/证据摘要、负数计数或结束早于开始整批返回 `INVALID_INPUT`；缺授权/确认或 binding 不匹配进入唯一对应 exclusion；
- 0、1、2 次真实运行都不能输出“验证完成”；即使输入 3 条记录，存在重复项目或合法但 binding 不匹配的记录也不能通过；
- CLI 只输出聚合度量和不可逆身份，不回显业务内容。

CLI 成功契约为 exit 0、stderr 空、stdout 恰一份 aggregate JCS；失败契约为 exit 1、stdout 空、stderr 恰一行稳定错误码且不回显原值。至少冻结 `INVALID_INPUT`、`NON_CANONICAL_INPUT`、`SENSITIVE_INPUT_REJECTED`、`DUPLICATE_RUN_ID`。

GREEN 只实现 Schema、单次记录验证、去重、聚合与离线 CLI，并写清真实运行操作协议。不得生成真实数据、自动抓取项目、联网、接入遥测或宣称已完成三次运行。

### 6.4 DoD 与独立验收

- 五项度量的单位、起止点、缺失处理和失败语义在协议与实现中一致。
- fixture 能证明框架拒绝伪造、重复和时间矛盾；它们不能进入真实运行计数。
- normalized runs 与 `excluded_records` 均按 `run_id` 排序；`outcomes`、各中位数只来自 qualified runs，`recovery_seconds` 展平全部 qualified recovery event，缺失不按 0；aggregate digest 固定为 `sha256(JCS({runs: normalized runs sorted by run_id}))`。
- 独立验收者绑定候选 commit/tree/digest，核对隐私字段、去重、聚合、CLI 输出和“少于三次永不完成”。
- 包级 PASS 文案必须是“真实项目价值验证框架可用，真实运行 0/3”；只有未来三次独立真实运行均形成合格证据后，才可另发运行验收。
- 即使未来达到 3/3，也只证明真实项目价值样本达标；PC-19 仍需 V4 的 Q1..Q12 与全链路矩阵独立验收。

### 6.5 回滚

删除本包新增路径即可回滚。真实运行证据若未来产生，应单独按隐私与保留策略管理，不因框架代码回滚而伪造删除或改写历史结论。

### 6.6 Attempt 状态与下一入口

- 前序 attempt 1 的 P1 契约歧义发生在实现前，状态固定为 `contract-revision-required`；未执行 RED、未生成生产/Schema/test 候选，也不计为 SG-3 行为失败。该历史继续作为只读证据保留。
- 更正后的原始候选=`87258c32162875bef16994b2259ad16baf4cb72e`、main=`a5b16942450d79ed583b80a1b4f13061017c41fd`；原始独立评审=`afdb308e09113a919a07778a75c1f816f2d3b5cd`、main=`c42670a3a7f638b262fa72d94e5a5a6d3a68cc51`，结论 `PASS / 100`，P0/P1/P2=`0/0/0`，Result digest=`sha256:abfea41a5d855d25950c302043ad925a2cf880ba4a71b94c414865350fed2b6b`。
- SG-3 package gate 历史验证=`503/503`，coverage Lines/Branches/Functions=`93.50/88.62/99.22`；这是包级历史 snapshot，不是永久 current 数值。包级状态必须保持为“真实项目价值验证框架可用，真实运行 0/3”。SG-3 package gate 通过不表示 PC-19、V2、V4 或 P5 完成。
- 历史阶段：cumulative gate 通过后，首次 V2 entry reassessment=`REVISE / 88`，当时的下一入口是修复状态真源后再次独立复评；该历史入口已被后续有效 V2 entry、S2.1 与 S2.2 验收链 supersede，不构成当前停点。

## 7. 累积验证与验收门禁

三包分别 PASS 后，独立 cumulative acceptance 已完成以下检查：

1. 校验三个候选已按约定顺序整合，路径无交叉、无既有契约修改、无新依赖。
2. 运行 `pnpm check`，核对测试数、失败/跳过数和覆盖率不低于整合前基线。
3. 运行预算超限、状态冲突/过期、synthetic 冒充 real 三个固定负例。
4. 核对 formal/control OID、用户工作树、既有产品真源和历史证据未变。
5. 反扫完成声明，确保不存在 PC-12、PC-19、V2、V4、P5 或真实运行 3/3 的提前宣告。

累积结论=`PASS / 97`，P0/P1/P2=`0/0/3`；cumulative packet=`6c49825`、claim/fence 132=`4a3e6ab`、ready=`5414c63`、ACK=`8231caf`，`accepted_subject_main=37c13f34f50a634eb3b1b5c89c1ef5ddcce786aa`、`cumulative_review_commit=813e9fd5240b1af6413a274daa7e307757bbb246`、Result control=`1ac071b`、digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`。累计验收历史 snapshot=`503/503`、coverage=`93.50/88.62/99.22`，三个固定负例均通过。

SG-1 两项 P2、SG-2 一项 P2 与 SG-3 两条边界继续 carry forward；精确状态仍为“真实项目价值验证框架可用，qualified real runs 0/3”。`change_request_closed=false`。V2 已由其独立版本验收链 formally-completed；本护栏累计 PASS 不替代该 authority。下一唯一入口为独立 alpha 计划与 fresh entry review，且 alpha packet/package/install/tag 尚不存在。

## 8. 阶段出口

本计划的实现与 cumulative gate 出口已经通过，同时明确留下“qualified real runs 0/3，PC-12/PC-19/V2/V4 均未由本计划完成”的历史 authority 边界。V2 后续由独立版本验收链 formally-completed，不改变本护栏计划的结论来源，也不自动归档本计划或关闭 CR-006。下一入口为独立 alpha 计划与 fresh entry review；这不表示 alpha package/tag、V3、V4、Final Acceptance 或 P5 完成。
