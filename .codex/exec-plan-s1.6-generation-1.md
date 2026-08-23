# P5 / V1 / M1.2 / S1.6 Generation 1 执行计划候选

状态：独立 entry review 已通过 `PASS / 95`；已进入 required_fixes 吸收与计划冻结阶段。尚未生成 Execution Packet，尚未编码或派发。

## 1. 目标、阶段出口与正式基线

S1.6 实现 `PC-08` 技术架构读取与风险承接运行闭环，绑定 `TG-05`、`TG-17`、`TG-19`。候选必须把已会签技术真源变成可验证的结构化架构评估，并为 `S4 §18` 十九项风险与 `009 §7` 归档风险逐项建立验证方式、失败标准、失败处理和回滚入口。

- formal 基线：F15 `7169e9b019fe2213ca76babb4122a84760bdf112`
- control 基线：任务包固化前实时读取；本计划候选形成时为 `b6b5e2f4ed559cad8f0bea4e962ea308f88c7f96`
- 路线/计划代际：`route_generation=1`、`plan_generation=4`
- 任务身份候选：`task_id=S1.6`、`task_attempt=1`
- 最低真源：`005 §4.2`、`009 §7`、`S4 §18`、P3 S1.6 行、P4 执行机制、F15
- 阶段出口：Q3 技术上游必填字段完整率 `100%`；Q11 风险承接率精确 `20/20`；三类目标项目的架构候选、失败处理和回滚入口可重复验证
- 失败退回：S4；若需改变已会签风险定义、技术栈、主载体或门禁，必须先进入 Change Request

## 2. 结构化候选与冻结字段

架构风险评估至少包含：

```text
schema_version
record_type
project
stage
formal_baseline
upstream_source_bindings
required_field_bindings
technical_stack
architecture_model
risk_bindings[20]
rollback_entries
candidate_digest
```

`required_field_bindings` 必须覆盖 005 的十类字段：技术目标、候选技术栈、不选原因、数据模型、阶段门禁、状态机、AI 交互边界、权限与数据、风险验证、回滚方案。每项 `risk_binding` 必须包含 `source_ref`、`validation_method`、`failure_standard`、`failure_handling`、`tg_bindings`、`owner_milestone`。

风险集合固定为 S4 §18 十九项加 009 §7 归档风险，共 20 项；缺失、重复、未知、跨项目错绑、摘要漂移或未会签状态均 fail closed。

### 2.1 Packet 前必须冻结的精确枚举

`required_field_bindings` 在 packet/schema/CV 中必须冻结为以下十个 machine keys，缺失、额外、错拼、别名全部拒绝：

```text
technical_goal
candidate_technology_stacks
rejection_reasons
data_model_draft
phase_gate_model
state_machine_model
ai_interaction_boundary
permissions_and_data_safety
risk_validation_plan
rollback_plan
```

`risk_bindings` 在 packet/schema/CV/I-X-P 中必须冻结为以下二十个 allowlist ids，顺序固定且不得替换为摘要名：

```text
project-root-resolution-correct
worktree-start-exact
read-only-verification-effective
task-creation-idempotent
control-ref-single-writer-fencing
host-receiver-atomic-idempotence
control-ledger-corruption
control-generation-monotonicity
multi-file-logical-atomicity
final-verification-precision
credential-and-proof-no-replace
credential-crash-durability
audit-anchor-allowlist
cas-race-safety
formal-history-continuity
formal-ref-worktree-separation
acceptance-profile-correctness
recovery-independent-of-chat
sensitive-information-not-persisted
archive-failure
```

`rollback_entries` 在 packet/schema/CV/I-X-P 中必须冻结为以下五个 exact ids，并补齐 `terminal_state`、`next_action`、`proof_expectation`：

```text
stop-auto-write-and-enter-change-request
manual-isolated-fallback
blocked-await-external-proof
awaiting-formal-promotion
awaiting-archive
```

## 3. 最小 Definition of Done

- [ ] 三类目标项目 `community-workshop`、`expense-reminder`、`project-delivery-tool` 均形成绑定 F15 的 PC-08 架构评估。
- [ ] 005 十类必填字段完整率 Q3=`100%`；候选技术栈、备选与不选原因可追溯。
- [ ] 数据模型覆盖 Project、Stage、Deliverable、Change Request、Milestone；门禁模型覆盖通过、退回、需讨论、阻塞。
- [ ] S4/009 风险精确 Q11=`20/20`；每项都有验证、失败标准、失败处理、TG 绑定、owner milestone 与回滚入口。
- [ ] 五类回滚入口必须精确冻结为 `stop-auto-write-and-enter-change-request`、`manual-isolated-fallback`、`blocked-await-external-proof`、`awaiting-formal-promotion`、`awaiting-archive`，并分别绑定 TypeScript 运行时失败、Adapter 失败、台账不可裁决、自动提升不可验证、归档失败。
- [ ] 未知版本、额外字段、敏感字段、错误阶段、非 F15、上游摘要漂移、未会签或跨项目绑定全部拒绝。
- [ ] `source-validate` 只产生一份 RFC8785/JCS stdout 回执；诊断仅 stderr，失败 exit 1，不回显敏感原值。
- [ ] CLI 运行前后 formal/control、目标项目状态和工作树内容不变。
- [ ] Skill 明示 `V1 / M1.2 / S1.6`、F15、PC-08、20/20、回滚入口与 `manual-isolated consumer contract` 边界。
- [ ] 不声明 `full`，不实现真实 host bootstrap/probe、fencing、registry/formal promotion，不冻结 P4 API/Schema。
- [ ] `pnpm check` 全过；测试总数在 Execution Result 中按精确 subject 冻结；覆盖率不得低于 F15 的 93.07/88.62/99.09。

## 4. 首批 RED 测试

### Domain / Schema

1. 三类 fixture 均绑定精确 F15/S1.5 依赖并生成 PC-08 架构评估。
2. 十个 `required_field_bindings` machine keys、推荐/备选/不选原因、数据模型与四态门禁缺一即拒绝。
3. 二十个 `risk_bindings` allowlist ids 完整通过；缺失、重复、未知、source 摘要变化、未会签、跨项目绑定均阻塞。
4. 五个 `rollback_entries` exact ids 与 `terminal_state`/`next_action`/`proof_expectation` 缺一即拒绝。
5. 候选若声明 `full`、冻结 P4 API/Schema、恢复 Web/UI、增加数据库或常驻服务，必须拒绝。
6. 未知 schema、额外字段、敏感字段/内容、非对象输入 fail closed。

### CLI / Receipt / Skill

1. JCS 输入只输出一个 JCS 成功回执；非 JCS、未知参数、错误身份输出单一失败回执且 exit 1。
2. 缺风险、摘要错绑、错误阶段、非 F15 均失败；不回显输入敏感值。
3. CLI 调用不修改 formal/control、目标项目状态或工作树。
4. Skill 入口、PC-08、20/20、回滚入口、fixture 边界和非目标均由静态/行为测试冻结。

## 5. 并行 worktree 与互斥写集

入口治理文件、packet、control 与主线集成仅由主控修改。entry review 和 control CAS 通过后才派发：

| 切片 | 职责 | 独占写集 | 进入条件 |
|---|---|---|---|
| W1 | 三类 fixture、20 项风险 catalog、正负例 | `tests/fixtures/architecture-risk/**` | packet/claim 后立即 RED |
| W2 | Domain、Schema、领域测试 | `src/domain/architecture-risk.ts`、`schemas/v1/architecture-risk-assessment.schema.json`、`tests/domain/architecture-risk.test.ts` | packet/claim 后与 W1 并行；先用冻结 catalog 接口 |
| W3 | CLI、receipt、Skill、集成/依赖测试 | `src/cli/source-validate.ts`、`src/domain/machine-receipt.ts`、`schemas/v1/machine-receipt.schema.json`、`skills/nextstep/SKILL.md`、对应测试 | W1/W2 导出签名冻结后启动 |
| 主控 | cherry-pick、契约冲突裁决、全量回归、候选与正式证据链 | 治理文件、共享集成修正 | 不替代独立 CV/I-X-P/L3 |

Worker 之间不得修改他人写集；共享文件仅归 W3。用户未跟踪 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md` 永久排除于 packet、候选、snapshot 和清理动作。

## 6. 门禁矩阵

1. **CV**：subject/packet/dedup/control/F15 一致；changed paths 命中 allowlist；十个 field keys、二十个 risk ids、五个 rollback ids 全部精确匹配；三类 fixture 与负例全过；Q3=100%、Q11=20/20；`pnpm check` 全过；formal/control 不变。
2. **I/X/P**：回放架构候选→字段校验→风险绑定→失败处理/回滚；输出能回答缺失 risk id、失败原因、下一动作；PC-08、TG-05/17/19 可追溯；不把 fixture 冒充真实宿主能力。
3. **L3**：全新 reviewer，P0/P1=0、综合分不低于 90；独立复算十个 field keys、二十个 risk ids、五个 rollback ids、三 fixture、上游摘要/F15；反扫 P4/V3 范围偷跑。
4. **Final Verification**：精确 Final Snapshot 全量回归、覆盖率、manifest、JSON/JCS、source/risk/rollback 反扫；项目外 Credential create-once。
5. **Anchor Verification**：唯一父、允许留痕路径、受保护业务路径、Credential/FV/manifest/transaction 绑定与项目外 Proof create-once 全部通过。
6. **Formal promotion**：pending=0，Anchor 是 F15 后代；仅以 expected-old=F15 CAS 到 S1.6 Anchor/F16。

## 7. 非目标与停止条件

- 不恢复 Web/UI，不引入数据库、常驻服务或新技术栈。
- 不实现真实宿主预检、`full` 模式、fencing、registry-transition、snapshot-materialize 或 formal-promote 产品能力。
- 不冻结或改写 P4 API/Schema，不修改已会签 S4/009/P3/P4 语义。
- fixture 只证明 `manual-isolated consumer contract`，不得宣称真实宿主探针通过。
- S1.6/F16 只代表小里程碑完成；M1.2/V1 仍需累计验收与用户会签，P5 更未完成。
- 若风险集合不再是 20 项、上游存在实质缺口或实现必须突破以上边界，立即停止并进入 Change Request。
