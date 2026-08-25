# P5 产品落地实施里程碑

状态：进行中；formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，control=`12ab4aaffda6ee44853d4014230b9a85c1ad8944`，`plan_generation=5`。V1 已 formally-completed；V2 入口评估=`PASS / 100`。CR-006 SG-1 generation 5 attempt 1 packet 已创建；当前等待 claim/fence 精确授权，dispatch、编码、独立验收与 V2 packet 均未授权
启动日期：2026-08-08

## 1. 阶段目标

基于已会签的 P3 版本与里程碑计划、S4 技术架构和 P4 执行机制设计，按 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance` 顺序建立可运行 NextStep，使用目标项目 fixture、本地测试和独立 I/X/P 门禁逐步证明 `PC-01..PC-20`，最终形成可验收、可恢复、可审计和可交付的产品闭环。

## 2. 生命周期与路线

- 生命周期阶段：`S5 开发落地`。
- 项目里程碑：`P5 产品落地`。
- 当前活动里程碑：`CR-006 / SG-1 generation-5 claim-fence authorization gate`；V2 入口评估已通过，但产品 packet 暂停。
- 本轮启动授权：用户于 2026-08-08 在 P4 会签归档后明确要求继续，授权单独启动 P5 并建立实施里程碑。
- 路线性质：沿用已会签路线，不改变产品定位、主交互载体、技术栈、版本范围或验收门禁。V1 已完成精确用户会签及分离的 ACK/completion CAS，V2 入口独立评估已通过。CR-006 只增加跨版本可承受性护栏，独立计划位于 `docs/exec-plans/active/p5-scalability-guardrails.md`；其规划门禁、generation 5 advance/ack 与 SG-1 packet 已关闭，当前只允许请求 SG-1 claim/fence 的精确授权。该方向批准与 V2 入口 PASS 均不直接授权 dispatch、编码或 V2 packet。

## 3. 正式上游

- `PROJECT_ROUTE_LOCK.md`
- `docs/exec-plans/completed/p3-version-and-milestone-breakdown.md`
- `docs/design-docs/p4-execution-mechanism-design.md`
- `docs/exec-plans/completed/p4-execution-mechanism-design.md`
- `docs/architecture/s4-technical-architecture.md`
- `docs/architecture/009-s4-technical-input-supplement.md`
- `docs/design-docs/s3-skill-interaction-source.md`
- `docs/product-specs/005-stage-document-contracts.md`
- `docs/product-specs/007-s3-skill-interaction-contract.md`
- `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`

P4 两轮有效审查 `PASS / 95` 与 `PASS / 94` 是实现上游可用性证据，不是 P5 运行能力通过证据。

## 4. 阶段交付物

- 可运行的 NextStep Skill 主入口和 TypeScript/Node 按需辅助工具。
- 版本化结构契约、纯领域规则、状态机、Git/文件工具和必要的 Codex 宿主适配。
- 可重复创建和销毁的目标项目 fixture、单元测试、集成测试、故障注入测试和宿主探针。
- V1..V4 的本地验证、I/X/P 验收报告、Profile fixture 证据和风险反扫结果。
- Final Acceptance 报告、交付清单、正式引用/归档证据、已知风险和回滚说明。
- 本活动计划、`docs/qa/` / `docs/releases/` 交付证据及 `.codex` 留痕。

## 5. P5 Definition of Done

- `PC-01..PC-20` 均由可运行行为和目标项目 fixture 证明，既有人工计划或文档存在不能替代运行证据。
- P3 的 4 个版本、9 个大里程碑、18 个小里程碑、12 项指标和 14 个验收对象均有可追溯证据。
- P4 的 8 个逻辑工具入口、12 个核心对象、8 类职责和 18 个失败/恢复场景均有实现或明确的受控宿主适配承接。
- 至少一个正式支持的主宿主通过 `full` 自动分派与恢复；其他声明支持的宿主至少为 `manual-isolated`，`blocked` 不进入支持清单。
- 候选验证、产品与交互评估、独立审查、精确最终复验和正式提升五类结论相互独立并绑定精确内容身份。
- `Final Content Snapshot -> Verification Credential -> Audit Anchor -> Anchor Proof -> formal ref CAS` 闭环通过真实 Git/文件系统故障注入验证。
- NextStep 自身始终通过 headless 的 I/X/P；目标项目路线派生 Acceptance Profile，含 UI 时额外校验 UI 证据，路线冲突必须阻塞。
- 新需求和漏项全部进入 Change Intake；未经分流的范围变化为零。
- V1..V4 与 Final Acceptance 的本地门禁、阶段会签、交付清单和 `.codex` 留痕完整。

## 6. 明确非目标

- 不恢复 NextStep Web/UI 候选分支，不选择前端框架或建设 Web 界面。
- 不引入常驻服务、SQLite/中央数据库、远程控制面或通用多 Agent 编排平台。
- 不建设 Project Provenance Store、长期 Agent 贡献统计或按 Agent 贡献回退。
- 不让主对话读取或修改项目文件，不让集成职责自我批准。
- 不一次性实现全部版本，不绕过小里程碑门禁横向扩展。
- 不把 fixture、dry-run、人工计划、文档或接口存在误报为正式产品能力。
- 不自动覆盖、清理或重置用户工作区，不自动推送、发布或归档任务。

## 7. 实施总序

| 实施里程碑 | 承接范围 | 核心输出 | 进入条件 | 退出门禁 |
|---|---|---|---|---|
| P5-M0 实施就绪门禁 | 跨版本基础，不承载 PC 完成声明 | 工程骨架、运行时固定、契约内核、fixture harness、本地命令和首个可重复测试 | P3/P4/S4 已会签，P5 活动计划生效 | 安装、类型检查、测试和构建入口可重复；失败语义与 JSON 输出纪律被测试；无产品 PC 被误报完成 |
| V1 真源运行闭环 | M1.1、M1.2；S1.1..S1.6；PC-01..08 | 从模糊想法到冻结产品/交互/技术真源的可运行闭环 | P5-M0 通过 | 3 类以上目标项目 fixture 的 I/X/P 通过；错误输入、未确认和写入失败均阻塞 |
| V2 计划与任务包边界 | M2.1、M2.2；S2.1..S2.4；PC-09..13 | 版本/里程碑生成、依赖图、四态门禁和可拒绝任务包 | V1 会签通过 | PC 唯一主归属、依赖无环、缺依赖/DoD/Profile 冲突拒绝证据通过 |
| V3 隔离执行与正式提升 | M3.1..M3.3；S3.1..S3.5；PC-14..18 | 宿主预检、幂等分派、候选、五类结论、锚/CAS、变更和恢复 | V2 会签通过 | 至少一个主宿主为 full；P4 18 场景及 S4 高风险探针通过；职责隔离无自批 |
| V4 量化验收与关闭 | M4.1、M4.2；S4.1..S4.3；PC-19..20 | 指标、全链矩阵、FA、交付与宿主归档判定 | V3 会签通过 | Q1..Q12 可复核；PC/TG/S4 风险反扫通过；FA 与 PC-20.AR 分开判定 |
| Final Acceptance | 全部版本与 PC-01..20 | 正式验收报告、交付清单、风险/范围外、用户关闭确认 | V4 会签通过 | 全部必需证据有效，正式 OID 可追溯，用户明确会签；随后才允许进入 S8 交付归档 |

P5-M0 不是新增产品版本，不改变 P3 的 PC 主版本归属，也不能以工程可构建替代 V1 验收。

## 8. 已关闭门禁：P5-M0

### 8.1 目标

建立第一个可编码、可测试、可回滚的工程基线，先实现与业务无关但贯穿后续版本的契约内核和 fixture 能力，再进入 S1.1。P5-M0 只证明实施基础可用，不证明任何 `PC-01..PC-20` 已交付。

### 8.2 可验收交付物

- 固定当前受支持 Node LTS、包管理器、锁文件、TypeScript 严格配置和许可证/忽略规则。
- 明确 Skill、CLI、domain、schemas、adapters、tests/fixtures 的最小物理边界；不提前建立常驻服务层。
- 建立规范化 JSON、内容摘要、版本字段、四态结论和统一错误/回执的纯领域契约。
- 建立 Node 内置测试运行器、临时 Git fixture 工厂和可验证清理机制。
- 建立 `typecheck`、`test`、`build` 和必要的格式/静态检查入口。
- 至少一个只读命令或纯函数纵向样例证明：标准输出为机器可读 JSON、诊断走标准错误、修改型入口具备 dry-run 约束。

### 8.3 DoD

- 从干净检出按文档命令可完成依赖安装、类型检查、测试和构建。
- fixture 只在受控临时目录创建，测试结束不改变仓库业务真源、`refs/nextstep/formal` 或 `refs/nextstep/control`。
- 契约未知版本、非法四态、非规范输入、摘要不一致和敏感字段样例均 fail closed。
- 核心领域层不依赖 Codex Adapter；物理边界符合 S4 依赖方向。
- 没有空壳命令、假成功、未验证支持声明或真实执行任务包。
- P5-M0 验证结果写入 `.codex/verification-report.md`；通过后才创建 S1.1 的真实 Execution Packet。

### 8.4 当前不做

- 不实现 S1.1 或任何产品 PC。
- 不接 Codex SDK/App Server，不运行 `host-bootstrap` 或声明宿主模式。
- 不初始化正式 ref/control ref，不写项目外正式凭证。
- 不生成或派发真实执行任务包。

### 8.5 关闭结论

- 固定候选：commit `8cc0f3d552aa800f28702b59cdade51dc327cd95`，tree `3114ee92beeb3ceaf6604d1f0510ba04019d09bd`。
- 第七轮 L3：Verifier `PASS`、Strict Judge `PASS / 97`、Anti-Slop Judge `PASS / 100`、Chief Reviewer `PASS / 97`；P0/P1 = 0，`required_fixes = []`。
- 本地与 clean clone：冻结安装、65/65、覆盖率 95.37%/94.80%/97.56%、官方 registry audit、Skill 校验和零污染反扫通过。
- 门禁结论：P5-M0 通过；允许进入 S1.1 任务包生成，但任务包和 `dispatch-ready` 持久化前不得派发。

## 9. 8 个逻辑工具入口的交付映射

| 逻辑入口 | 首次实施里程碑 | 完整验收里程碑 | 约束 |
|---|---|---|---|
| project-resolve | P5-M0 / V1 | S3.1 | 越界、不唯一、权限不足必须阻塞 |
| source-validate | P5-M0 / V1 | S1.6 | 未知版本、缺字段或错误状态 fail closed |
| candidate-build | V1 S1.3 | S3.3 | 基线不一致、路径越界和敏感内容阻塞 |
| packet-build | V2 S2.4 | S3.2 | 无小里程碑、缺依赖/DoD/Profile 时拒绝派发 |
| registry-transition | V3 S3.2 | S3.5 | 代际、fence、幂等和 CAS 全部验证 |
| snapshot-materialize | V3 S3.3 | S3.4 | 只从已通过候选生成不可变快照 |
| gate-evaluate | V1 分阶段引入 | V4 S4.3 | 正式 I/X/P 结论由独立门禁产生，缺证据只能阻塞 |
| formal-promote | V3 S3.4 | Final Acceptance | 凭证、Anchor Proof、后代/快进和 expected-old CAS 全部通过 |

最终命令名和物理拆分在 P5-M0 中以最小实现验证后冻结；逻辑语义不得偏离 S4/P4。

## 10. 小里程碑执行规则

1. 严格按 P3 的 18 个小里程碑依赖顺序推进；每次只允许一个小里程碑处于实施中。
2. 每个小里程碑开始前，从已会签计划生成一份真实 Execution Packet；P5-M0 通过前不得生成第一份真实任务包。
3. 先写失败用例和验收 fixture，再做最小实现；单元、集成、故障注入和必要宿主探针按风险递增。
4. 修改型工具必须支持 dry-run；机器输出只写 stdout，诊断写 stderr 或独立证据文件。
5. 集成任务可以运行集成诊断预检，但该预检不产生正式 I/X/P 四态结论；正式结论必须由独立门禁及最终复验链产生。
6. 任一门禁为 `退回 / 需讨论 / 阻塞` 时不得推进依赖项；失败必须回到 P3 指定入口或 Change Intake。
7. 每个大里程碑和版本分别形成验收报告并请求阶段会签；中间版本通过不得宣告完整项目完成。

## 11. 验证与证据

- P5-M0：依赖安装、类型检查、单元测试、构建、fixture 污染检查和输出协议断言。
- V1/V2：至少 3 类目标项目 fixture 的正例、负例、阻塞与恢复回放。
- V3：P4-V01..P4-V18、S4 风险探针、真实 Git CAS/并发/崩溃注入和宿主模式裁决。
- V4/FA：Q1..Q12 计算、14 个验收对象反扫、PC-01..20/TG/S4 风险覆盖和关闭条件分离。
- 每次改动至少运行受影响测试；每个小里程碑、大里程碑和版本收口时运行累积回归。
- 代码测试、构建、验收和用户会签分别记录，不得互相替代。

## 12. 变更、风险与回滚

- 新需求、漏项、依赖变化或上游冲突先写入 Change Intake，再按六类结论唯一分流。
- 改变技术栈、主载体、正式提升、安全边界、版本归属或验收门禁时，必须建立 Change Request 并更新路线锁。
- 每个实现切片保持可回滚；新实现未通过门禁前不删除旧路径或历史证据。
- Node/Codex 适配失败时按 S4 回滚：保留 Markdown/JSON/Git 契约，停止自动写入或降为 `manual-isolated/blocked`，不静默换栈。
- 用户工作树 dirty、分支分叉或 CAS 冲突时只报告和阻塞自动覆盖，不使用破坏性 Git 命令。

## 13. 当前阶段出口

P5 的最终阶段出口是：V1..V4 和 Final Acceptance 全部通过本地可重复验证、独立 I/X/P、适用 Profile 验收和用户会签；交付清单、正式 OID、已知风险、回滚与 PC-20.AR 状态可追溯。此前 P5 保持进行中，不得归档本计划或宣告完整产品完成。

当前 M1.1 attempt 1 为历史 `退回 / 73`，attempt 2 已会签并正式完成。formal=F16，control=`12ab4aaffda6ee44853d4014230b9a85c1ad8944`，`plan_generation=5`，pending dispatch=0；S1.4-S1.6、M1.2 与 V1 均已正式完成。CR-006 SG-1 attempt 1 packet 已创建，当前只允许请求 claim/fence 的精确授权。V2 入口独立评估 `5be7ff254f898cee7887df9a15b48b8d21f2c1ed`=`PASS / 100`；P5 未完成，dispatch、编码、独立验收与 V2 packet 未授权。
