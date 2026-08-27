# V2 / M2.2 里程碑验收 Generation 1 执行计划

## 1. 冻结身份与阶段出口

- 生命周期/路线：`S5 / P5 / V2 / M2.2 / acceptance`。
- `stage_id=P5/V2/M2.2/acceptance`，`task_id=M2.2-I-X-P`，`task_attempt=1`，`plan_generation=5`。
- P3 冻结验收维度严格为 `I / X / P`；不得擅自增加 `Profile` 维度。后续 packet 如需标识本轮 headless fixture 组合，只允许使用描述性字面量 `headless-primary-m2.2-descriptive-fixture-set`；该字面量不是 P3、P4、S4 或既有 Acceptance Profile 真源，不构成第四维度、适用性裁决或完成 authority。
- covered small milestones=`S2.3 / S2.4`，covered product capabilities=`PC-11..PC-13`；完整 TG union=`TG-02,TG-04,TG-07,TG-13,TG-16,TG-19`。其中 `TG-04` 是 PC-12 的冻结承接，不得因 M2.2 没有 Profile 维度而删去。
- 唯一 historical acceptance subject：S2.4 状态 checkpoint `b68dd8974482517089ab558eb347856f4af6bde9`，tree=`e614d3bbf6750922cfa2ab93e90551b2d9783893`，唯一父=`411f2ef955ff8498b2fb2b1afa3a3ce97550ea36`，subject digest=`sha256:f5d8aadf62e5b5a3077fe5edd982ada2f38b06422857948bc567e4b02c2a9aa0`。
- 选择该 historical subject 的唯一理由：它是首个同时集成 S2.3、S2.4 有效 package acceptance 并完成 exact-eleven 状态同步的历史 checkpoint。live main `48d437454432abba4067e71bd38f51d5b5e8d397` 只用于解释计划入口上下文，不得替代 subject，也不得进入 subject digest、review parent 或 Result 主体。
- formal 固定为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；本计划入口 control 为 M2.1 分离 completion CAS `179006320df60365357417c1f20fd774ee3ad632`；`plan_generation=5`。
- M2.1 已经过独立 ACK 与另一独立 completion CAS，状态为 `formally-completed`；它只满足 M2.2 计划入口依赖，不替代本次独立 entry review、packet 或验收。
- 阶段出口：在固定 historical subject 上完成独立 I/X/P 验收，Judge Harness 结论为 `PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`；主控复算全部身份与证据后只能创建状态为 `passed-awaiting-user-signoff` 的 Result。精确用户会签及分离 completion CAS 完成前，M2.2 不得标记完成。

## 2. 权威依赖、退回历史与等价边界

### 2.1 S2.3 authority

| 对象 | 权威绑定 | 用途与边界 |
|---|---|---|
| invalid attempt 1 | wrong stage=`P5/V2/M2.1/S2.3`、fence=`140`、audit Result digest=`sha256:c82ef7e2ff65f36864771185c0be08b2d2413af9eeb779abb0968dafac2e6da6` | 永久无效；不得计入依赖、PASS 或角色隔离证据 |
| valid candidate | `37bbd1c5b51daf44e8f411c2404e958925029b01` | corrected M2.2/S2.3 产品候选 |
| valid independent review | `f2fbac76e9f3f234ca0ba9c9fb9de14795b13ac1` | 有效独立 package acceptance 评审 |
| Execution Result | `sha256:8247ede7fd00352f96c7b74adcdef5efb5e172bf0bb2655115a0fcc2ff80afb2` | 实现结果 authority |
| package Result | `sha256:89e9b721870d1685fd0e1c0172b88ce9f6d8fec04fc2b867c302443f0d867408` | 有效 package acceptance authority |
| integration checkpoint | `cc4c43c0c3e0d0ab7e3d3366c10978b7808612f9` | S2.3 有效验收进入 main 并完成状态同步的证据 |

- 程序性 main implementation/review `5f74d06...` / `e3f0b24...` 只能用于内容与集成等价核对，不具 package acceptance authority，不得替代上表 valid candidate/review/Result。

### 2.2 S2.4 authority

| 对象 | 权威绑定 | 用途与边界 |
|---|---|---|
| attempt 1 | candidate/review=`REVISE`，Result digest=`sha256:52b3003f9a07895c79db1139b963b3aaac75a28d9b24541b48efadbe3b6dad7d` | 永久保持退回；不得升级为有效依赖或 PASS |
| attempt 2 superseded intermediate | candidate=`9c8ee6c...` | 已被后续有效候选取代；不得作为本轮 subject authority |
| valid candidate | `45a3eb0a1d924b8f2b4c2b5ab6aa9e975526dc21` | S2.4 attempt 2 最终有效产品候选 |
| valid independent review | `411f2ef955ff8498b2fb2b1afa3a3ce97550ea36` | 有效独立 package acceptance 评审，也是 historical subject 唯一父 |
| Execution Result | `sha256:9c647e45d852b10edf703581458d3ec985fecb46f4397794cf7707cc0c5e774b` | 实现结果 authority |
| package Result | `sha256:08901d9dea24d90e81a5d7535cdde3402c32bd15b7046a3b1082baeffc9f434f` | 有效 package acceptance authority |
| integration/state checkpoint | `b68dd8974482517089ab558eb347856f4af6bde9` | 本次唯一 historical subject |

- reviewer 必须证明 S2.3、S2.4 的 candidate、有效 review、Execution Result、package Result 与 integration/state checkpoint 全部可寻址并相互一致。任一对象缺失、摘要漂移、角色越权、错误 attempt 被升级、superseded candidate 被复用或 ancestry 不成立，均 fail closed。
- 代码/tree 等价只证明内容一致，绝不替代 package acceptance、Result、用户会签或 M2.2 authority。

## 3. 独立验收硬门

1. **HG1 身份门**：独立复算 subject commit/tree/唯一父/三元组 digest，精确匹配第 1 节；拒绝 live main、其他 checkpoint、merge commit、重写提交或自洽重哈希替换。
2. **HG2 control 门**：从入口 control `179006320df60365357417c1f20fd774ee3ad632` 运行时核对 formal F16、`plan_generation=5`、M2.1 独立 user-signoff ACK 与分离 completion、M2.2 stage/task/attempt、packet/dedup、claim/fence、ready/outbox、ACK、registry 和 expected-old 单父 CAS。正式审查必须同时消费 clone 内冻结的 pre-ACK ready control 与唯一 ACK evidence ref，证明 ACK 唯一父精确等于 ready control；不得消费 stale fence、重复宿主或未确认 tombstone。
3. **HG3 authority 门**：逐项验证第 2 节 S2.3/S2.4 权威链；wrong-stage/fence140、S2.4 attempt 1 REVISE 与 `9c8ee6c...` superseded candidate 必须继续无效，程序性 main implementation/review 不得升级为 acceptance authority。
4. **HG4 集成与 TG 完整性门**：证明 S2.3 有效 package acceptance 经 `cc4c43c...` 集成，S2.4 attempt 2 有效 package acceptance 经 `b68dd897...` 集成并完成 exact-eleven 状态同步；PC-11..PC-13 全部被唯一承接，TG union 精确为 `TG-02,TG-04,TG-07,TG-13,TG-16,TG-19`，不得遗漏 PC-12 的 `TG-04`。
5. **HG5 隔离与 readiness 门**：主控先以 `git clone --no-local` provision 一次性副本，移除 origin，确认无 alternates，detached checkout `b68dd897...`；依赖安装必须 `--offline --frozen-lockfile`，且 clone 内 `.git`、`node_modules` 都是普通本地目录。主控在 ACK 前注入 formal F16 与精确 pre-ACK ready control 到 clone 的 `refs/nextstep/formal` / `refs/nextstep/control`，随后派发未来唯一正式 reviewer 执行 readiness-only。该 reviewer 只能只读核对环境并回复 `READY`，不得运行产品测试、写文件或提交；主控收到 `READY` 后才可用 ACK CAS 绑定同一 reviewer host。
6. **HG6 ACK evidence 与正式审查时序门**：ACK CAS 成功后，主控不得更新 clone 中冻结的 `refs/nextstep/control`。主控以 controller-only provisioning 按精确 ACK OID 导入对象，并且只允许通过 expected-old=全零 OID 的 create-once CAS 新增单一 namespaced immutable evidence ref `refs/nextstep/evidence/m2.2-acceptance-ack-f<N>`；后续禁止更新或删除。正式审查前必须断言：ACK 唯一父=pre-ACK ready control；evidence ref 指向精确 ACK OID；clone 无 remote、无 alternates；formal/control refs 未变；HEAD/tree/worktree 未变；ACK 前后 ref 集合差异精确只有该 evidence ref。随后主控把 `accepted_at`、ACK OID、evidence ref、packet digest、claim/fence 作为不可变边界发给同一 reviewer；失败则登记 blocked/recovery，不开始评审、不更换 reviewer 冒充同一 attempt。
7. **HG7 可重复测试门**：在 detached `b68dd897...` 上精确运行 `tests/domain/small-milestone.test.ts`、`tests/cli/small-milestone.test.ts`、`tests/domain/execution-packet.test.ts`、`tests/cli/execution-packet.test.ts`，S2.3 `10/10` + S2.4 `19/19`，合计必须 `29/29`；fresh full `pnpm check` 至少 `555/555`，fail/skip/cancel/todo=`0/0/0/0`；coverage floors Lines/Branches/Functions=`94.36/89.65/99.57`；`git diff --check` 通过。
8. **HG8 I 维度**：证明每个小里程碑具备输入、输出、DoD、测试方式、非目标、依赖与退回入口，依赖图无环且可追溯；任务包只消费冻结的、已通过 package acceptance 的 S2.3/S2.4 authority，字段、摘要与控制身份一一对应。
9. **HG9 X 维度**：对字段缺失/重复/未知、非 canonical 输入、依赖缺失/未知/自依赖/有环、DoD/测试/非目标/退回入口缺失、无小里程碑、验收标准缺失、digest/ref/attempt/fence 漂移、旧候选复用、敏感信息与 allowlist 越界逐项证明稳定拒绝；缺输入时不得生成、派发或伪造可执行任务包。
10. **HG10 P 维度**：产品声明只允许覆盖 PC-11..PC-13 与 M2.2“小里程碑与任务包边界运行链”。可描述性引用 `headless-primary-m2.2-descriptive-fixture-set`，但不得将其包装为第四验收维度或既有 Profile 真源；不得宣称 V2 cumulative、52 tests、Profile/V2、`v0.2.0-alpha`、formal promotion、CR-006、P5 或 qualified real runs 已完成。
11. **HG11 零副作用门**：除 HG6 明确允许的 controller-only 单一 ACK evidence ref 注入外，验收只能读冻结 Git 对象、运行本地构建/测试和写专属 review 目录；reviewer 不得修改任何 ref，不得访问原仓库或获得原仓库读写能力。不得修改产品 subject、main/formal/control、宿主项目、网络、外部凭证、用户文件或依赖清单；验证前后冻结 refs、HEAD/tree 与 tracked 状态必须一致。
12. **HG12 Judge Harness 门**：scorecard 只采用 `I/X/P` 三维；只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才可创建 Result。身份、时序、角色隔离、测试、TG 完整性或副作用任一硬门失败必须为 `REVISE` 或 `REJECT`，不得由总分抵消。

## 4. 评审输出与角色隔离

- reviewer 必须是未参与 S2.3/S2.4 实现、其无效/退回尝试、M2.2 计划创作、entry review 和控制面写入的唯一新独立 subagent。
- readiness-only 与 ACK 后正式验收必须由同一唯一 reviewer host 连续承担；readiness 阶段只允许只读回复 `READY`，不运行测试、不写文件、不创建提交。主控不得在同一 attempt 中用替补 reviewer 冒充该身份。
- reviewer 未来写集固定为专属目录 exact-three：`milestone-acceptance.json`、`scorecard.json`、`verdict.md`；三者须以 historical subject 为唯一父提交，不得修改产品、计划、Result、control 或 refs。
- `milestone-acceptance.json` 固定机器可读的 I/X/P 结论、29 个 targeted tests、full tests、覆盖率、PC/TG 完整性、失败面、零副作用和 authority 绑定；`scorecard.json` 与 `verdict.md` 遵循 Judge Harness。
- reviewer 不得创建 Result、signoff request、用户 ACK 或 completion；主控不得把 readiness、历史 PASS、程序性 review、本计划或 entry review 包装为独立验收。

## 5. 控制面执行顺序

1. 对本计划做唯一独立 entry review；若需修订，先形成新计划候选再复评。本计划与 entry review 均不授权创建 acceptance packet。
2. entry review 通过后，主控仍必须停在独立边界重新核对 live refs、formal、control、plan generation、historical subject 与无 pending 冲突，才可在后续独立单父 expected-old CAS 创建唯一 M2.2 acceptance packet。
3. 以另一独立 CAS 创建唯一 claim/fence；再以另一 CAS 创建 dispatch-ready/outbox。
4. 主控 provision no-local、origin-removed、无 alternates的一次性 clone，detached checkout historical subject，完成 offline frozen 依赖安装，并注入 formal F16 与精确 pre-ACK ready control；此时不得存在 ACK evidence ref。
5. 主控派发未来唯一 reviewer host 执行 readiness-only；reviewer 只读核对并回复 `READY`。只有收到该 host 的 `READY`，主控才以另一独立 CAS 固化 dispatch ACK，并把 ACK 绑定同一 host。
6. ACK 后由主控以 controller-only provisioning 导入精确 ACK 对象，以 expected-old=全零 OID 的 create-once CAS 只新增 `refs/nextstep/evidence/m2.2-acceptance-ack-f<N>`，不得更新 clone 的 `refs/nextstep/control`。完成 HG6 全部断言后，主控把 ACK `accepted_at`/OID/evidence-ref/packet/fence 不可变边界发送给同一 reviewer，才允许开始正式评审。
7. 同一 reviewer 验证完整 control 单父链、运行验收并提交 exact-three；主控复算 commit/tree/parent、三份 artifact 摘要、全部硬门和前后 refs。
8. 只有独立 `PASS / 100` 才能以单独 control CAS 创建 M2.2 Result，状态固定为 `passed-awaiting-user-signoff`，不得写 `completed`。
9. 以独立 CAS 创建精确 signoff request；请求必须列明 Result digest、Result control、subject、review commit、formal 与 `plan_generation=5`。
10. 用户对精确 Result/control 明确会签后，主控实时重读全部身份，以独立 expected-old CAS 固化 user-signoff ACK。
11. user-signoff ACK 成功后，再以另一独立 expected-old CAS 将 M2.2 标记为 `formally-completed`；ACK CAS 与 completion CAS 不得合并。
12. 只有 M2.2 completion CAS 成功后，才允许冻结 V2 cumulative acceptance Generation 1 计划并执行独立 entry review；不得从 M2.2 completion 直接创建 V2 packet。

## 6. 非目标、停止条件与本计划授权边界

- 本计划及其 entry review 不创建或授权 packet、claim/fence、ready/outbox、dispatch ACK、正式 review、Result、signoff request、用户 ACK 或 completion，不移动任何 ref。
- M2.2 完成只表示 PC-11..PC-13 的里程碑验收闭环通过；不等于 V2 cumulative、52 tests、Profile、V2、`v0.2.0-alpha`、formal、CR-006 或 P5 完成。
- 不修改或重新生成 S2.3/S2.4 产品实现，不改写 wrong-stage/fence140、S2.4 attempt 1 REVISE 或 superseded candidate 历史，不把 live main 替换为 historical subject。
- 不把描述性 fixture profile 字面量升级为 P3 冻结维度或新的产品真源；M2.2 scorecard 始终只有 I/X/P。
- 任一 identity、control、authority、隔离、时序、测试、覆盖率、PC/TG、失败面、零副作用或角色分离门不成立时立即停止并保留证据，不得降级门禁或口头豁免。
