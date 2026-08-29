# V3 Generation 1 实施计划

## 1. 身份与入口

- 路线/阶段：`S5 / P5 / V3 隔离执行与正式提升可靠性`。
- 固定 parent/main：`691393988fa64a00c1398519b6c0fa9eacd1b1f8`。
- 固定 formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`（F16）。
- 固定 control：`4375910fa2554af9a8126449e07e25d4725ee6da`。
- `route_generation=1`，全局 `plan_generation=5`，本 V3 计划 `plan_generation=1`。
- 上游：V1/V2 formally-completed，`v0.2.0-alpha` 本地内部候选=`local-candidate-usable`；alpha tag/publish/formal 移动/用户级 Skill 安装均不属于 V3。
- 当前唯一入口：本计划先接受 fresh 独立 entry review。只有结论精确为 `PASS / 100`、P0/P1/P2=`0/0/0`，主控才可另行创建 S3.1 Generation 1 attempt 1 packet。
- 本计划作者不得参与 entry review。本计划本身不创建 packet、claim/fence、dispatch、代码、Result，不移动 main/formal/control，也不宣称任何 V3 PC 或里程碑完成。

## 2. 冻结范围、顺序与出口

| 大里程碑 | 顺序 | 小里程碑 | 唯一主归属 | 大里程碑出口 |
|---|---:|---|---|---|
| M3.1 宿主能力与职责隔离运行链 | 1 | S3.1 → S3.2 | PC-14 | 两包均通过独立 I/X/P，职责隔离、预检和幂等分派可回放；S3.1 单包 PASS 不等于 PC-14/M3.1 完成 |
| M3.2 候选验证与正式提升运行链 | 2 | S3.3 → S3.4-A → S3.4-B → S3.4-C | PC-15、PC-16 | 不可变候选、五类结论、最终快照、项目外凭证、Anchor Proof 与 formal CAS 全链通过 |
| M3.3 变更、失败退回与恢复运行链 | 3 | S3.5-A → S3.5-B | PC-17、PC-18 | Change Intake、代际墓碑、失败退回与删除聊天后的确定性恢复通过 |

V3 只能串行推进上述依赖；每个 packet 都需要自己的不可变 packet、claim/fence、dispatch-ready/outbox、唯一宿主 ACK、实现 Result、独立 package acceptance 和 main 集成边界。失败只退回对应 packet 或其上游，不重写已接受 Result，不跳过到后续 packet。

V3 版本出口同时要求：

1. S3.1..S3.5、M3.1..M3.3、PC-14..PC-18 均经累计独立 I/X/P 与适用 Profile 验收；
2. P4-V01..P4-V18 可累计回放，S4 §18 十九项风险均有可重复证据；
3. 至少一个正式支持主宿主以 `full` 完成自动分派与恢复验收；这是 V3 版本出口，不是 S3.1 单包可提前宣告的结论；
4. `manual-isolated` 只可声明明确受限支持，`blocked` 不得列为支持；
5. 无自批、旧凭证复用、非快进 formal 提升、用户工作树覆盖、历史验收污染或范围偷渡；
6. V3 累计验收、用户会签与分离完成动作通过后，才可进入 V4。V3 不关闭 CR-006，不满足 PC-19/PC-20、Final Acceptance 或 P5。

## 3. 全局实施与验收规则

### 3.1 TDD 与最小实现

每个实现 packet 强制执行：

1. RED：先写用户可观察契约测试，至少包含正例、负例、阻塞和恢复四类；保存真实失败原因，不能用不存在依赖或语法错误冒充契约 RED。
2. GREEN：只实现使当前 packet 测试通过的最小领域、适配器和 CLI；优先复用 `project-context`、`fs-probe`、`execution-packet`、`project-status-source`、`canonical-json`、`content-digest`、`sensitive-fields`、`candidate-change`、`gate-conclusion`、`write-transaction`。
3. REFACTOR：只在精确允许路径内消除重复；不得借机重写现有可靠性内核、修改既定 P3/P4/S4 语义或扩充产品范围。
4. 验证：先定向测试，再 `pnpm check`；不得降低覆盖率门槛、删除/跳过测试或用字符串断言替代行为证据。真实 Git、文件系统与宿主副作用必须在隔离 fixture/temp 目录运行，结束后证明 formal/control 和业务真源未变。
5. implementation worker 只写 packet product allowlist；`.codex` 证据由主控按独立留痕提交固化，不得让 worker 借留痕扩写 product subject。

### 3.2 身份、权限与安全不变式

- 主对话只沟通、决策和消费持久化信封，不读写项目、不运行验证、不自批。
- 集成、执行、候选验证、产品/交互评估、独立审查、最终复验和锚验证按 P4 身份隔离；同一 attempt 不得由集成角色兼任独立结论角色。
- `baseline_oid` 只能来自 formal；活动 HEAD、用户分支和 dirty 工作树不能替代 formal。
- control 只允许单父 expected-old CAS；host side effect 前先持久化 outbox 与最高 fence。无法原子证明 `create-or-return(effect_key,fence,payload_digest)` 时禁止 `full`。
- 所有外部输入先做 Schema + JCS/digest + 路径边界 + sensitive-fields 校验；不记录 Token、低熵秘密、完整聊天或无关绝对路径。
- 任一身份、基线、项目根、代际、宿主关联、证据或恢复状态无法证明时 fail closed。

### 3.3 I/X/P/Profile 共通口径

- I：命令/Skill 输入、机器回执、确认与恢复提示符合已会签交互真源；主对话看不到后台过程和敏感输入。
- X：三层职责、独立任务身份、宿主模式与异常恢复可观察行为正确。
- P：对应 PC、TG、P4 场景和 S4 风险的产品结论只基于可运行证据，不把类型/fixture 存在包装成交付。
- Profile：每包都校验 Acceptance Profile 与路线；当前 Skill-only/headless 路线不得被要求 UI 证据，含 UI fixture 不得静默降级，冲突一律阻塞。Profile 仅校验证据适用性，不替代 I/X/P。
- package PASS 只放行下一依赖，不自动完成所属 PC/大里程碑/V3。各大里程碑和 V3 仍需独立累计验收与用户会签。

## 4. S3.1 宿主能力预检运行

### 4.1 输入、输出、依赖与精确写集

- 依赖：S2.4 已完成；S4 §11/§18、P4 §16、目标宿主 fixture 可用。
- 输入：宿主标识/版本/权限、稳定任务 ID 能力声明、显式项目根、formal/control 身份、隔离 fixture。
- 输出：内容寻址 Capability Preflight，分别记录 `host-bootstrap` 与 `project-probe` 检测矩阵、绑定信息、有效期、阻塞原因、恢复入口和 `full | manual-isolated | blocked` 结论。
- 两阶段硬顺序：`host-bootstrap` 不得读取或写入项目，只验证宿主版本、独立任务创建/查询/继续/归档、稳定 ID、权限隔离和审批/阻塞回传；只有它通过后才可运行一次性 `project-probe`。project-probe 只在隔离 fixture 验证项目根、worktree 起点、信封往返、候选/只读验证/确认丢失恢复/最终快照/项目外证据/锚/CAS/归档能力，失败后 formal 与业务真源必须不变。
- product allowlist exact-11：
  1. `schemas/v1/capability-preflight.schema.json`
  2. `src/domain/capability-preflight.ts`
  3. `src/adapters/codex/host-bootstrap.ts`
  4. `src/adapters/node/project-probe.ts`
  5. `src/cli/capability-preflight.ts`
  6. `tests/domain/capability-preflight.test.ts`
  7. `tests/adapters/codex/host-bootstrap.test.ts`
  8. `tests/adapters/node/project-probe.test.ts`
  9. `tests/cli/capability-preflight.test.ts`
  10. `tests/fixtures/capability-preflight/**`
  11. `skills/nextstep/SKILL.md`

### 4.2 TDD、验收与退回

- RED 正例：bootstrap 能力完备后 probe 在干净 fixture 得到可复核 `full`；无法原子自动创建但身份/隔离可绑定时得到 `manual-isolated`。
- RED 负例：宿主版本/权限/项目变化使旧证据失效；nested repo、同名目录、symlink 越界、dirty/staged/untracked/ignored 起点不得误判；敏感字段不得落盘。
- RED 阻塞：bootstrap 未通过时 probe 不得启动；稳定 task ID、不可变候选、只读验证、精确最终复验或身份绑定任一不可证明时为 `blocked` 且不派发（P4-V18）。
- RED 恢复：probe 中途崩溃或归档探针失败后，可从内容摘要重跑；旧证据不能跨宿主/版本/项目/权限复用，formal/control/业务真源不变。
- I/X/P/Profile：I 验证最小三态摘要与明确下一步；X 验证 bootstrap/probe 分层及主对话零项目权限；P 只证明预检裁决能力；Profile 运行 headless/UI/conflict 三类适用性检查。
- 主责 S4 风险：项目根解析、worktree 起点、宿主隔离能力、敏感信息不落盘；主责 P4-V18。
- 失败退回：适配能力不足退回 S4 宿主风险探针或模式降级，不伪造 `full`。S3.1 PASS 仅允许创建 S3.2 packet，不等于 PC-14/M3.1 完成，也不能提前宣告 V3 已有正式 `full` 主宿主。

## 5. S3.2 职责隔离与幂等分派运行

### 5.1 输入、输出、依赖与精确写集

- 依赖：S3.1 有效 preflight；S3/S4 职责边界与 S2.4 Execution Packet。
- 输入：不可变 packet、formal baseline、control expected-old、claim/lease/fence、dedup/effect key、宿主模式与最小 dispatch 信封。
- 输出：Schema 校验的 control envelope、task registry transition、outbox/claim/ACK/恢复回执；重复信封只对应同一 host task。
- product allowlist exact-14：
  1. `schemas/v1/control-envelope.schema.json`
  2. `schemas/v1/task-registry.schema.json`
  3. `src/domain/control-envelope.ts`
  4. `src/domain/task-registry.ts`
  5. `src/adapters/node/control-ref-store.ts`
  6. `src/adapters/codex/task-dispatch.ts`
  7. `src/cli/task-dispatch.ts`
  8. `tests/domain/control-envelope.test.ts`
  9. `tests/domain/task-registry.test.ts`
  10. `tests/adapters/node/control-ref-store.test.ts`
  11. `tests/adapters/codex/task-dispatch.test.ts`
  12. `tests/cli/task-dispatch.test.ts`
  13. `tests/fixtures/task-dispatch/**`
  14. `skills/nextstep/SKILL.md`

### 5.2 TDD、验收与退回

- RED 正例：先 packet/dispatch-ready，再 outbox+claim/fence，再原子 create-or-return，最后 ACK；同 key/digest/fence 重放返回相同 host task。
- RED 负例：缺依赖/阈值、同 dedup key 不同 digest、同 fence 不同 payload、旧 fence、过期 claim、越权角色和不完整 ACK 均拒绝。
- RED 阻塞：无法证明最高 fence、control 单父 CAS、宿主原子幂等或 stable ID 时禁止 `full`；按 preflight 降为 `manual-isolated` 或 `blocked`。
- RED 恢复：宿主创建成功但 ACK 丢失、进程在副作用前/后崩溃、重复信封与重启均恢复同一任务，不盲目重建；工作镜像损坏必须从可验证 control 重建。
- I/X/P/Profile：I 验证主对话只消费 dispatch-ready/ACK 摘要；X 验证主对话/集成/执行权限隔离；P 验证 P4-V01..V03 与 TG-09/TG-10；Profile 冲突在派发前拒绝。
- 主责 S4 风险：任务创建幂等、control 单写与 fencing、宿主接收端原子幂等、控制台账损坏；主责 P4-V01/V02/V03。
- 失败退回：packet 缺陷退 S2.4；preflight 失效退 S3.1；幂等/fence 缺陷停在 S3.2。只有 S3.1+S3.2 累计验收和用户门禁才可完成 M3.1/PC-14。

## 6. S3.3 不可变候选与只读验证运行

### 6.1 输入、输出、依赖与精确写集

- 依赖：M3.1 通过；有效 packet/ACK、精确 formal baseline、allowed paths 和隔离 worktree。
- 输入：执行 Result、候选 commit/tree、packet identity、before tree 和验证环境声明。
- 输出：不可变候选对象、allowed-path 差异、before/after 验证树摘要、candidate-verification 四态结论和恢复入口。
- product allowlist exact-11：
  1. `schemas/v1/immutable-candidate.schema.json`
  2. `src/domain/immutable-candidate.ts`
  3. `src/adapters/node/git-snapshot.ts`
  4. `src/cli/candidate-verification.ts`
  5. `tests/domain/immutable-candidate.test.ts`
  6. `tests/adapters/node/git-snapshot.test.ts`
  7. `tests/cli/candidate-verification.test.ts`
  8. `tests/fixtures/immutable-candidate/**`
  9. `src/cli/nextstep.ts`
  10. `tests/cli/nextstep.test.ts`
  11. `skills/nextstep/SKILL.md`

### 6.2 TDD、验收与退回

- RED 正例：精确 baseline/packet/host identity 与 allowlist 匹配，候选摘要稳定，验证前后 tree/commit 不变。
- RED 负例：越过 allowed paths、candidate tree 与宣称 digest 不同、活动工作树冒充候选、验证产物进入候选、敏感文件被带入均拒绝。
- RED 阻塞：只读能力、候选来源或 baseline 无法证明时不运行验证；dirty 用户工作树只报告，不复制进候选。
- RED 恢复：验证中断可从相同不可变 tree 重跑；一旦树变化，旧验证无效并生成新 attempt，不覆盖原 Result。
- I/X/P/Profile：I 输出最小候选/差异/恢复摘要；X 证明执行者与验证者独立；P 主责 PC-15 的候选不可变部分；Profile 适用证据缺失不允许进入下一门禁。
- 主责 S4 风险：只读验证有效、worktree 起点精确、敏感信息不落盘；主责 P4-V06/V07。
- 失败退回：路径/候选缺陷退实现任务，验证污染退新的独立验证 attempt；S3.3 不批准最终提升，不完成 PC-15/M3.2。

## 7. S3.4 五类结论与正式提升运行

S3.4 必须拆为 A/B/C 三个顺序 packet，不允许合并为一个可自批的实现/提升任务。

### 7.1 S3.4-A：Gate Record 与 Final Content Snapshot

- 依赖/输入：S3.3 PASS 候选集合、五类独立任务身份、Acceptance Profile、Write Transaction 与预期 formal baseline。
- 输出：绑定候选/控制/宿主身份的五类 Gate Record；全部适用结论通过后，由隔离集成暂存区冻结 Final Content Snapshot。快照冻结后不得补写。
- product allowlist exact-12：
  1. `schemas/v1/gate-record.schema.json`
  2. `schemas/v1/final-content-snapshot.schema.json`
  3. `src/domain/gate-record.ts`
  4. `src/domain/final-content-snapshot.ts`
  5. `src/adapters/node/git-snapshot.ts`
  6. `src/cli/gate-evaluate.ts`
  7. `tests/domain/gate-record.test.ts`
  8. `tests/domain/final-content-snapshot.test.ts`
  9. `tests/adapters/node/git-snapshot.test.ts`
  10. `tests/cli/gate-evaluate.test.ts`
  11. `tests/fixtures/gate-record/**`
  12. `tests/fixtures/final-content-snapshot/**`
- TDD：正例证明五类结论分别绑定且只从 PASS 候选生成快照；负例覆盖自批、缺结论、重复角色、UI 证据缺失、Profile 冲突、候选顺序/摘要变化；阻塞时不产快照；集成冲突恢复到对应候选。I/X/P/Profile 主责结论展示、职责隔离、PC-15/PC-16 门禁与 P4-V08/V09/V10。失败退回 S3.3 或对应独立结论，不进入 B。

### 7.2 S3.4-B：Verification Credential 与 Anchor Proof

- 依赖/输入：冻结 Final Content Snapshot、预期 formal baseline、独立 final-verification identity、项目外受控 evidence root。
- 输出：JCS+SHA-256 内容寻址、exclusive/no-replace、文件与父目录持久化的 Verification Credential；独立 anchor-verification 生成绑定锚与 credential 的 Anchor Proof。
- product allowlist exact-8：
  1. `schemas/v1/verification-credential.schema.json`
  2. `schemas/v1/anchor-proof.schema.json`
  3. `src/domain/verification-evidence.ts`
  4. `src/adapters/node/evidence-store.ts`
  5. `tests/domain/verification-evidence.test.ts`
  6. `tests/adapters/node/evidence-store.test.ts`
  7. `tests/fixtures/verification-credential/**`
  8. `tests/fixtures/anchor-proof/**`
- TDD：正例证明 create-once、重读复算与同内容幂等；负例覆盖快照后变化、同路径不同内容、旧 credential/Proof 重放、删除/篡改、no-replace 不可用；阻塞时不得降级写项目或 stdout；在临时刷盘、最终安装、父目录刷盘和清理各点崩溃后按摘要恢复。I/X/P/Profile 主责独立最终复验、证据适用性和 PC-16；主责 P4-V11/V12。失败退回 A 重建快照/新 credential，不进入 C。

### 7.3 S3.4-C：审计锚验证与 formal promotion

- 依赖/输入：快照、credential digest、Anchor Proof digest、审计锚、expected-old formal、有效 control 代际和职责身份。
- 输出：formal-promotion 四态回执；仅在证据重算、锚白名单、后代/快进、职责分离与 expected-old CAS 全部通过时移动专用 formal ref。
- product allowlist exact-11：
  1. `schemas/v1/formal-promotion.schema.json`
  2. `src/domain/formal-promotion.ts`
  3. `src/adapters/node/git-formal.ts`
  4. `src/cli/formal-promote.ts`
  5. `tests/domain/formal-promotion.test.ts`
  6. `tests/adapters/node/git-formal.test.ts`
  7. `tests/cli/formal-promote.test.ts`
  8. `tests/fixtures/formal-promotion/**`
  9. `src/cli/nextstep.ts`
  10. `tests/cli/nextstep.test.ts`
  11. `skills/nextstep/SKILL.md`
- TDD：正例证明白名单审计锚和单次 expected-old fast-forward CAS；负例覆盖锚越界、credential/Proof 摘要错配、非后代、旧代际、自批、用户工作树 dirty；阻塞时保持待提升且不触碰用户 branch/index/worktree；CAS 竞争或提升后通知/归档失败时保留已证实 formal 并返回可重试副作用证据。I/X/P/Profile 主责正式提升的最小用户摘要、五类职责隔离、PC-16 和证据适用性；主责 P4-V13/V14/V15，并在 V3 仅回放 P4-V16 的不反转性质。
- P4-V16 的能力主归属固定为 V4/S4.3。V3 只能证明“归档副作用失败不移动或反转既有 formal，状态保持待归档并携带重试证据”；不得宣告 Final Acceptance、PC-20.FA、PC-20.AR 或完全关闭。
- S3.4 A/B/C 全部通过后，才允许 M3.2 累计验收 PC-15/PC-16；任一失败回到对应 A/B/C，不改旧 formal 或已接受历史。

## 8. S3.5 变更分流与恢复运行

S3.5 拆为 A/B 两个顺序 packet；A 冻结变更分流，B 冻结代际与聊天无关恢复。

### 8.1 S3.5-A：Change Intake

- 依赖/输入：S3.4 完成链、当前 formal/control、执行中发现的新需求/漏项/技术风险/验收失败。
- 输出：含来源、影响真源/PC/里程碑、风险、验证成本、建议分流、用户决定、新代际影响和旧代际墓碑计划的 Change Intake。
- product allowlist exact-9：
  1. `schemas/v1/change-intake.schema.json`
  2. `src/domain/change-intake.ts`
  3. `src/cli/change-intake.ts`
  4. `tests/domain/change-intake.test.ts`
  5. `tests/cli/change-intake.test.ts`
  6. `tests/fixtures/change-intake/**`
  7. `src/cli/nextstep.ts`
  8. `tests/cli/nextstep.test.ts`
  9. `skills/nextstep/SKILL.md`
- TDD：正例覆盖当前缺口/增强/后续/拒绝分流；负例覆盖直接改 packet、Backlog 偷渡 PC、无用户决定推进代际、污染旧验收；阻塞时当前闭环保持原状态；恢复从同一 intake digest 继续而不重复决定。I/X/P/Profile 主责用户可理解分流、变更职责、PC-17 与 Profile 影响披露；主责 P4-V17 的 intake 部分。失败退回 Change Intake/Request，不重写 S3.4 结论。

### 8.2 S3.5-B：Generation Snapshot 与结构化恢复

- 依赖/输入：有效 Change Intake/旧代际墓碑、route lock、活动计划、formal/control、registry/checkpoint 和最小宿主关联；不读取完整聊天。
- 输出：generation snapshot、最高有效代际/attempt、未确认墓碑、stale/conflict 分类、阻塞与下一步、恢复回执和状态投影。
- product allowlist exact-18：
  1. `schemas/v1/generation-snapshot.schema.json`
  2. `src/domain/generation-recovery.ts`
  3. `src/domain/project-status-projection.ts`
  4. `src/adapters/node/project-status-source.ts`
  5. `src/cli/project-status.ts`
  6. `tests/domain/generation-recovery.test.ts`
  7. `tests/domain/project-status-projection.test.ts`
  8. `tests/adapters/node/project-status-source.test.ts`
  9. `tests/cli/project-status.test.ts`
  10. `tests/fixtures/generation-recovery/**`
  11. `schemas/v1/task-registry.schema.json`
  12. `src/domain/task-registry.ts`
  13. `src/adapters/node/control-ref-store.ts`
  14. `tests/domain/task-registry.test.ts`
  15. `tests/adapters/node/control-ref-store.test.ts`
  16. `src/cli/nextstep.ts`
  17. `tests/cli/nextstep.test.ts`
  18. `skills/nextstep/SKILL.md`
- TDD：正例删除会话缓存后恢复同一阶段/任务/阻塞/下一步；负例覆盖低代际迟到、同代际身份冲突、未确认墓碑、控制镜像篡改/回退/断链；阻塞时不采纳损坏状态、不派发；恢复覆盖 ACK 丢失、过期 claim 更高 fence 接管和人工隔离证据。I/X/P/Profile 主责最小状态投影、恢复职责、PC-18 与路线适用性；主责 P4-V04/V05，并完成 P4-V17 的新代际/墓碑部分。
- 主责 S4 风险：控制台账损坏、控制代际单调、恢复不依赖聊天、敏感信息不落盘。失败退回 S3.5-A、对应 packet 或人工控制恢复；历史 Result 和 formal 不变。

## 9. P4-V01..P4-V18 与 S4 风险分配

| 场景 | 主责 packet | V3 判定边界 |
|---|---|---|
| P4-V01/P4-V02/P4-V03 | S3.2 | packet 缺失拒绝、dedup 冲突阻塞、ACK 丢失恢复同一任务 |
| P4-V04/P4-V05 | S3.5-B | stale 不入依赖；同代际冲突人工隔离 |
| P4-V06/P4-V07 | S3.3 | allowed-path 越界退回；验证污染使当前验证无效 |
| P4-V08/P4-V09/P4-V10 | S3.4-A | 自批拒绝；UI 证据与 Profile 冲突 fail closed |
| P4-V11/P4-V12 | S3.4-B | 快照变化废弃旧 credential；no-replace 不可用时阻塞 |
| P4-V13/P4-V14/P4-V15 | S3.4-C | 锚越界、CAS 竞争、dirty 工作树均不误报成功或覆盖用户内容 |
| P4-V16 | S3.4-C 回放；能力主归属 V4/S4.3 | 只证明归档失败不反转 formal，返回待归档/重试证据；不宣告 FA/PC-20 |
| P4-V17 | S3.5-A/B | Change Intake 后推进代际并保留旧墓碑 |
| P4-V18 | S3.1 | 隔离能力不可证明即 blocked，不派发 |

S4 §18 十九项风险主责分配：

- S3.1：项目根解析、worktree 起点、宿主核心隔离、敏感信息不落盘。
- S3.2：任务创建幂等、control 单写/fencing、宿主接收端原子幂等、控制台账损坏。
- S3.3：只读验证有效、worktree 起点精确、候选输入最小化。
- S3.4-A：多文件逻辑原子、验收配置正确、自批/结论身份隔离。
- S3.4-B：最终复验精确、凭证与证明不可替换、凭证崩溃持久性。
- S3.4-C：审计锚白名单、CAS 竞争安全、正式历史连续、formal ref 与工作树分离；归档失败只作 P4-V16 不反转回放。
- S3.5-A/B：控制代际单调、范围变化分流、恢复不依赖聊天、控制台账损坏恢复。

同一风险可以被多个 packet 反扫，但以上主责不可被后续重命名或偷渡。V3 累计报告必须列出十九项风险逐项证据和失败入口，不能用 P4-V01..18 数量替代 S4 风险证据。

## 10. 明确禁止范围

- 不改变 M3.1/M3.2/M3.3、S3.1..S3.5、PC-14..PC-18 的既定归属，不提前实现 V4 指标、全链矩阵、Final Acceptance、交付关闭或 PC-19/PC-20。
- 不建设常驻服务、数据库、远程控制面、多 Agent 平台或 Project Provenance Store；不恢复 Web/UI 主路线。
- 不把真实用户项目、当前工作树、受保护未跟踪文件或用户级 Skill 目录当 fixture；不自动 tag、publish、push、全局安装或清理历史证据。
- 不让主对话读写项目、让同一任务串行冒充独立任务、让集成角色自批、用文档/类型/自测代替独立验收。
- 不用 V3 的 P4-V16 回放宣告 FA、PC-20 或归档完成；不因归档失败反转已验证 formal。
- 不因至少一个 `full` 是 V3 出口，就在 S3.1 单包提前宣告宿主正式支持；必须经过 S3.2 自动分派/恢复与 V3 累计验收。

## 11. Entry Review 与后续唯一动作

本计划候选只允许 exact-three：本文件、`.codex/operations-log.md`、`.codex/verification-report.md`。不运行产品 full tests；只执行文档格式、身份、路径数量、依赖顺序、PC/P4/S4 映射、禁止词与 `git diff --check` 机械验证。

fresh 独立 entry review 必须在新的隔离副本中核对：

1. parent/formal/control/route_generation/global plan_generation/V3 plan_generation 精确匹配；
2. exact-three 当前写集与各 future packet exact allowlist 匹配；
3. S3.1 两阶段预检、三态裁决和“PASS 不完成 PC-14/M3.1”边界完整；
4. S3.4 A/B/C、S3.5 A/B 不可合并或跳过；
5. P4-V01..18、S4 十九项风险、I/X/P/Profile、失败退回无缺口；
6. P4-V16、至少一个 `full`、V4/FA/P5 边界没有提前宣告。

只有 fresh `PASS / 100` 且 P0/P1/P2=`0/0/0`，主控才可基于当时 live main/formal/control 另行请求/执行 S3.1 packet control CAS。entry PASS 不授权 claim/fence、dispatch 或编码。
