# P5 / V1 累计验收 Generation 1 计划候选

## 1. 计划性质与当前身份

- 本文件是 `P5 / V1 / cumulative-acceptance` 的 Generation 1 **计划候选**，不是执行授权、任务包、Result 或验收结论。
- 唯一正式 subject：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- subject tree：`5b97a4432fbedb3dda189e05052c2e7665a1bea8`；parent：`5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`；三元组 digest：`sha256:3e75ad6dffe9a2f5479f0e2c48bea6e45f04593b4e75ac14d48e1e4cbb891672`。
- 计划入口 control：`a99593f940c6f38fba2147fc9b2c5bb5594c93a7`，现有全局 `plan_generation=4`，pending dispatch=`0`；该 ref 在本计划评审完成前保持只读。
- 入口裁决：`.codex/reviews/p5-v1-cumulative-acceptance-entry-evaluation-2026-08-24/`，独立裁决 `PASS / 100`，唯一允许动作是形成此计划候选并另行独立评审。
- 已完成前置里程碑：M1.1 attempt 2 与 M1.2 attempt 1 均为 `formally-completed/approved`；它们只提供入口证据，不得拼接为 V1 PASS。
- 当前状态继续保持：V1/P5 未完成，V2 未授权；formal/control 不移动。

## 2. V1 阶段出口

V1 只有在同一个精确 F16 隔离上下文中重新完成 S1.1→S1.6 全链验证，并同时满足下列条件后，才可形成 `awaiting-user-signoff` 的新 V1 Result：

1. PC-01..08、适用 TG、I/X/P/Profile、三项目连续性、Q 指标、负例、风险与回滚并集全部有新证据；
2. frozen/offline 全量回归通过，覆盖率不低于当前基线；
3. 独立验收、独立审查、主控摘要复算和报告候选均绑定同一 F16 与同一 control 身份；
4. P0/P1=`0`、`required_fixes=[]`，任何 P2 均被显式承接；
5. 用户另行明确会签后，才允许以实时 expected-old control CAS 标记 V1 正式完成。

任何分段历史 PASS、main 工作树结果、旧 Result 或口头推断均不得替代上述 V1 新结论。

## 3. 冻结验收并集

### 3.1 里程碑、能力与测试组

- 里程碑：`M1.1`、`M1.2`。
- 小里程碑：`S1.1`、`S1.2`、`S1.3`、`S1.4`、`S1.5`、`S1.6`。
- 产品能力：`PC-01`、`PC-02`、`PC-03`、`PC-04`、`PC-05`、`PC-06`、`PC-07`、`PC-08`。
- 适用测试组：`TG-01/02/03/04/05/06/11/12/15/16/17/19`。
- 结论维度：`I`、`X`、`P`、`Profile`。
- 目标项目：`community-workshop`、`expense-reminder`、`project-delivery-tool`。
- 连续性跨度：每个目标项目均在同一个 exact-F16 隔离运行中完成 `S1.1→S1.2→S1.3→S1.4→S1.5→S1.6`。

### 3.2 量化门禁

| 指标 | V1 新证据要求 | 机器可核验 evidence slot |
|---|---|---|
| Q1 | 需求入口完整率 `100%` | `metrics.q1.requirement_intake` |
| Q2 | 冻结前阻断率 `100%` | `metrics.q2.pre_freeze_blocking` |
| Q3 | PC-03..08 上游真源必填字段 `100%` | `metrics.q3.required_fields` |
| Q6 | Profile 裁决正确率 `100%` | `metrics.q6.profile_decisions` |
| Q11 | 风险探针 `20/20` | `metrics.q11.risk_probes` |
| 连续性 | 三项目完整全链 `3/3` | `continuity.projects[]` |
| 写入一致性 | S1.5 矩阵 `13/13` | `write_consistency.rows[]` |
| 架构负例 | fail closed `15/15` | `architecture.negatives[]` |
| 回滚入口 | `5/5` | `rollback.entries[]` |
| 回归 | `474/474` 或 subject 上更高的已提交基线 | `regression.summary` |
| 覆盖率 | Lines/Branches/Functions 不低于 `93.41/88.84/99.15` | `coverage.summary` |

若 F16 的测试枚举经独立盘点发现基线数字与上表不一致，必须先返回计划审查，不得在执行中自行放宽或改写门禁。

### 3.3 PC/TG 证据映射

| 范围 | 必须形成的新证据 |
|---|---|
| PC-01..03 / M1.1 | 三项目需求输入、确认/冻结、Product Definition 的 canonical 内容与 digest 连续；TG-01/02/03/04/05/06/11/12/15/16/17/19 中适用项全部重放 |
| PC-04..05 / S1.4 | headless、ui-with-evidence、路线冲突三类 Profile 裁决；不得把 UI fixture 冒领为 Web/UI 主线 |
| PC-06..07 / S1.5 | 项目/阶段解析、用户确认、写入一致性；主对话拒写与原子失败路径全部阻断 |
| PC-08 / S1.6 | 十类架构必填、20 项风险、15 项负例、5 条回滚入口及敏感输入阻断 |
| V1 累计链 | 每个项目从 S1.1 到 S1.6 的项目身份、完整 canonical 内容、digest 与产品语义连续，且三项目彼此隔离 |

## 4. 必测 fail-closed 并集

以下负例必须逐项拥有稳定 ID、期望阻断阶段、实际结果和证据摘要；任何遗漏均为硬门失败：

1. 缺字段、未知 schema/version、未知字段、敏感内容、摘要错绑与外键错绑；
2. 未确认、未冻结、过期 claim、终态 replay、重复或跨任务 fence；
3. 跨项目换料、canonical 内容换料、项目身份漂移；
4. 同名、嵌套、symlink、项目根越界、权限异常与不可解析目录；
5. 主对话读取/写入项目、Profile 冲突、UI 缺少可核验证据；
6. 写入前基线漂移、只读/不可写、中途失败、symlink escape、部分写入与 unsafe rollback；
7. S1.6 的 `15/15` 架构负例、敏感输入泄露风险及 `5/5` 回滚入口失效。

负例只能证明阻断行为，不得据此声明 trusted-host、full 或真实用户动作已覆盖。

## 5. 隔离执行设计

正式验收若日后获准，只允许一次受控执行上下文：

1. 使用 `git clone --no-local` 创建唯一临时隔离副本，detached checkout 精确 F16；不得复用 main、control worktree 或历史验收目录。
2. 以 frozen/offline 方式安装依赖，记录 downloaded=`0`；随后运行 `pnpm check` 并保留测试枚举、失败数与覆盖率原始摘要。
3. 在隔离副本外的临时只读验证区构造 V1 cumulative runner；runner 不写回 formal subject，不生成未审查的产品实现。
4. 三个目标项目必须在同一 subject、同一 runner 版本、同一验收 attempt 内依次跑完全链；逐阶段复算 canonical JSON、JCS/digest、外键和语义连续性。
5. 验收前后复核 main/formal/control、F16 tree 与用户未跟踪文件均未变化。

正式执行 Agent 不得参与 S1.1-S1.6 的实现、历史 I/X/P/L3/FV/AV 或本计划的制定与评审；其写集未来必须由 packet 精确限制为专属 review/report 候选目录。

## 6. Result 与摘要协议

未来 V1 Result 至少包含以下机器可核验区段：

- `subject_identity`：formal commit/tree/parent/subject digest、control expected-old、task generation/attempt/fence；
- `source_results`：M1.1/M1.2 Result ref 与 digest，明确标记为 `entry_evidence_only`；
- `coverage_union`：milestones、small milestones、PC、TG、dimensions、projects；
- `regression`、`coverage`、`continuity`、`metrics`、`fail_closed`、`write_consistency`、`architecture`、`rollback`；
- `evidence_refs` 与逐项 digest；
- `carry_forward_risks`、`required_fixes`、P0/P1/P2、最终 verdict；
- 排除顶层 `result_digest` 后的 RFC8785/JCS 摘要。

主控必须独立复算 Result、scorecard、verdict 与报告摘要。任一摘要、父链、写集、subject 或 control 身份不一致，结果均 fail closed，不得登记为待用户会签。

## 7. 历史风险继续承接

以下 M1.1 P2 在 V1 中不得静默清零：

1. `manual-isolated/headless` 证据不证明 trusted-host/full 或真实用户动作；
2. dispatch/ack 的因果顺序以 control Git 父链为准，不以文件时间或对话顺序替代；
3. 长驻 trusted-host session registry 的生命周期与容量上界仍未证明。

本 V1 计划只接受 `manual-isolated/headless consumer contract` 范围的结论。V3 或其他已批准宿主阶段可承接这些风险，但本轮不得越权扩展路线。

## 8. 未来控制面顺序（当前不执行）

计划独立评审 PASS 后，仍需新的明确控制授权，才可依次执行：

1. 实时重读 formal/control/plan generation/pending，冻结 `V1-I-X-P-Profile / generation 1 / attempt 1` packet 与七字段 dedup；
2. 以 expected-old control CAS 持久化 ready/outbox/registry，再形成 claim/fence/ack；
3. 派发唯一独立验收 Agent，运行第 5 节的 exact-F16 累计验收；
4. 独立审查验收产物，主控复算并创建 immutable V1 Result；
5. 生成 V1 用户会签报告并独立终审；
6. 用户明确批准后，再做新的身份核验和 user-signoff control CAS；
7. 只有 CAS 成功后才能把 V1 标记为正式完成。P5/V2 是否开放必须另行按路线锁判断。

## 9. 当前硬边界与停止条件

- 本计划候选必须先由未参与制定的独立 reviewer 评审；评审提交只允许新增专属 `scorecard.json` 与 `verdict.md`。
- 本轮不得生成 packet、dedup、ready、outbox、claim、fence、ack 或 Result，不得派发/运行正式 V1 验收。
- 不修改生产代码、Schema、依赖、产品路线、页面体系或技术栈。
- 不移动 formal/control，不声明 V1/P5 完成，不授权 V2。
- 不读取、修改、提交、验收或清理 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md`。
- 计划评审若为 REVISE/REJECT，只允许按 required fixes 修订计划并重新独立评审；不得绕过门禁继续执行。
