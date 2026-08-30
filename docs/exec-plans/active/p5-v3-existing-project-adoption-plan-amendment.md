# V3 Generation 2 Existing Project Adoption 增量计划候选

## 1. 身份、状态与授权边界

- 状态：CR-007 架构已由用户最终批准；计划尚未生效，等待 live-state reconciliation、fresh 独立 readiness 评审及后续分离 generation-advance/ack 授权。
- 关联：`CR-007`、`P5 Existing Project Adoption 设计合同`。
- 固定候选基线：main/parent=`6ce2fa0e2b957fc0fab49d5ee2d62c503b9cc478`。
- 固定 formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- 2026-08-30 readiness 复核时观察到的 control：`007467180e32a866cbb15eba98a6c79b93b34529`；该值只用于审计，S3.1 仍需收口，因此不得预填为 expected-old CAS。
- 全局 `plan_id=p5-product-implementation`、`route_generation=1`、`plan_generation=5` 保持不变。
- V3 子计划候选：`v3_plan_generation=2`，拟 supersede Generation 1 的未来未执行入口。
- 本文不修改 `.codex/exec-plan-v3-generation-1.md`，不创建 generation-advance/ack、packet、claim/fence、dispatch、Result，不修改产品代码或任何 refs。
- 用户最终批准绑定 CR 候选 `36242fbb2e938225c438871ada0731e06b9c37a4` 与独立评审 `288c1ca0d92c7c1834a0c65bc2c4cb8efe86e504`；批准范围只到 Generation 2 advance/ack 的独立准备与授权流程。

## 2. 修订原因与最小性

V3 Generation 1 假定项目已经具有可验证 formal/control 身份；实际 alpha 对既有半成品项目只能返回 `source-unavailable`。已会签的产品载体与 Skill 交互又允许用户选择拥有路线锁和当前阶段的既有项目，S4 也允许 formal 首次以“用户确认的现有基线”初始化，但缺少独立 control genesis、adopted-baseline、可信激活和回滚合同。

该缺口阻塞真实项目进入 V3 的 full 主宿主链和 CR-006 的真实价值验证，因此候选分流为 V3 当前阶段 remediation，而不是 S3.2 职责扩张或新大里程碑。

最小修订：

- 保留 P5、V3、PC-14..PC-18、M3.1..M3.3、S3.2..S3.5 的主归属与出口；
- 在 S3.1 与 S3.2 之间增加无 PC 独占归属的 `A3.0-A -> A3.0-B`；
- S3.2 exact-14、输入输出、验收和失败退回逐字义保持，不吸收 adoption；
- adoption package PASS 只建立可进入 S3.2 的项目控制起点，不完成 PC-14/M3.1。

## 3. Generation 2 冻结顺序

```text
S3.1（满足 carry-forward 条件后复用其已接受结论）
  -> A3.0-A 既有项目候选与只读检查
  -> A3.0-B 可信激活、状态投影、恢复与回滚
  -> A3.0 cumulative acceptance
  -> S3.2（Generation 1 exact-14 保持不变）
  -> S3.3 -> S3.4-A -> S3.4-B -> S3.4-C -> S3.5-A -> S3.5-B
```

A3.0 不新建大里程碑；它属于 M3.1 的入口修复，不拥有 PC-14。M3.1 仍只有在 S3.1、A3.0、S3.2 均通过适用独立验收，且至少一个正式支持主宿主完成 `full` 自动分派与恢复后才能完成。

## 4. Generation 1 处理规则

### 4.0 当前实时状态与先决裁决

- CR 候选形成后，Generation 1 已推进至 S3.1 implementation attempt 5/fence 172；live control 中该记录仍为 `running`、`result_ref=null`、`result_digest=null`。
- 宿主实际产生 repair candidate=`5ed6bcfd72af3ce517543dc25aa38f7f7c50f83a`，但 worker 自测不是 control Result，也不是独立 acceptance 或集成结论。
- 推荐路径 A：先在 Generation 1 以另行授权固化 attempt 5 execution Result，创建唯一 fresh S3.1-I-X-P attempt 6，取得 PASS，完成集成/control gate，再进行绑定 accepted subject、Result、review 与 Generation 2 plan digest 的 compatibility audit。
- 备选路径 B：若用户明确选择不收口 Generation 1，则必须以另行授权使 attempt 5/fence 172 失效并留下不可删除的 tombstone，再于 Generation 2 重跑 S3.1；不得承接 `running`、`REVISE` 或 worker 自测证据。
- 本 readiness 流程只冻结上述裁决，不执行路径 A/B 的任何 CAS、packet、claim/fence、dispatch、编码、验收或集成。

### 4.1 S3.1 carry-forward

S3.1 Generation 1 仅在以下条件全部满足时可被 Generation 2 显式承接：

1. 它已完成自己的 fresh implementation Result、独立 package acceptance、集成与控制链门禁；
2. 独立 compatibility audit 证明 CR-007 未改变 S3.1 的 schema、domain、host-bootstrap、project-probe、CLI、Skill 对外合同、PC-14 子结论或风险裁决；
3. audit 绑定精确 S3.1 accepted subject、Result、review 和 Generation 2 plan digest；
4. carry-forward 在 Generation 2 generation-ack 中显式登记。

未满足时必须为 S3.1 创建新代际 packet，不得复用未完成、REVISE 或仅 worker 自测的证据。

### 4.2 未开始的未来包

- Generation 1 尚未创建 packet 的 S3.2..S3.5 不伪造 tombstone。
- generation-advance 必须声明这些旧未来入口 `superseded-before-packet`。
- 任何迟到的 Generation 1 S3.2..S3.5 packet、claim、dispatch 或 Result 均按 stale generation 拒绝。
- 已持久化历史不可删除、改写或冒充 Generation 2 结果。

## 5. A3.0-A：既有项目候选与只读检查

### 5.1 依赖、输入与输出

- 依赖：CR-007、设计合同、Generation 2 已完成 advance/ack；S3.1 已按第 4.1 节承接或重新通过。
- 输入：显式项目根、Git repository identity、candidate HEAD、候选 HEAD 中路线锁/活动计划/验证摘要 blobs、工作区/worktree/`refs/nextstep/*` 只读状态。
- 输出：Schema 验证、JCS 内容寻址的 `AdoptionCandidate`；只读 inspect 机器回执；`PROJECT_NOT_ADOPTED`、`REF_PAIR_INCOMPLETE`、`ADOPTION_SOURCE_CONFLICT` 与 stale 分类。

### 5.2 候选产品 allowlist

最终 exact allowlist 必须在 execution packet 中按 live tree 再冻结；本计划候选上限为：

1. `schemas/v1/adoption-candidate.schema.json`
2. `src/domain/adoption-candidate.ts`
3. `src/adapters/node/adoption-inspect-source.ts`
4. `src/cli/adoption-inspect.ts`
5. `src/cli/nextstep.ts`
6. `tests/domain/adoption-candidate.test.ts`
7. `tests/adapters/node/adoption-inspect-source.test.ts`
8. `tests/cli/adoption-inspect.test.ts`
9. `tests/cli/nextstep.test.ts`
10. `tests/fixtures/existing-project-adoption/**`
11. `skills/nextstep/SKILL.md`

packet 不得未经新的 Change Intake 扩大上限；若可复用现有文件，应缩小而不是机械使用全部路径。

### 5.3 TDD 与验收

- RED 正例：干净、无 nextstep refs、候选 HEAD blobs 唯一时重复 inspect digest 相同。
- RED 负例：工作树文本冒充真源、缺失/重复/越界 blob、敏感字段、未知证据升级、任意 nextstep ref 冲突。
- RED 阻塞：dirty/staged/untracked、ignored 遮蔽、多 worktree 身份不可证明、HEAD/blob/namespace 漂移。
- RED 恢复：旧 candidate stale 后生成新 digest，不覆盖旧审计。
- I：用户看到阶段建议、证据等级、未知门禁、零写入和下一步。
- X：公开 CLI 无写 capability；candidate 生成者不拥有可信用户 action。
- P：证明“可安全提出接入候选”，不证明接入成功或历史阶段完成。
- Profile：Skill-only/headless 证据适用，UI fixture 冲突 fail closed。
- Budget：不引入网络、数据库、守护进程、通用迁移 DSL 或新的编排层。

## 6. A3.0-B：可信激活、投影、恢复与回滚

### 6.1 依赖、输入与输出

- 依赖：A3.0-A accepted candidate；trusted in-process verifier、clock、user-action、Git object/ref transaction ports。
- 输入：exact candidate、用户实际展示摘要、可信 confirmation envelope、再次读取的 Git/worktree/namespace identity。
- 输出：零父 control genesis、以 genesis 为唯一父的 activation、adopted-baseline record、双 ref 原子 activation receipt、状态投影、公开 `project-status` 闭包、回执丢失恢复与精确回滚回执。

### 6.2 候选产品 allowlist

最终 exact allowlist同样由 execution packet 再冻结；本计划候选上限为：

1. `schemas/v1/adopted-baseline.schema.json`
2. `schemas/v1/adoption-confirmation.schema.json`
3. `schemas/v1/adoption-activation.schema.json`
4. `schemas/v1/project-status-projection.schema.json`
5. `src/domain/adopted-baseline.ts`
6. `src/domain/adoption-activation.ts`
7. `src/adapters/node/adoption-ref-store.ts`
8. `src/domain/project-status-projection.ts`
9. `src/adapters/node/project-status-source.ts`
10. `src/cli/project-status.ts`
11. `src/cli/nextstep.ts`
12. `tests/domain/adopted-baseline.test.ts`
13. `tests/domain/adoption-activation.test.ts`
14. `tests/domain/project-status-projection.test.ts`
15. `tests/adapters/node/adoption-ref-store.test.ts`
16. `tests/adapters/node/project-status-source.test.ts`
17. `tests/cli/project-status.test.ts`
18. `tests/cli/nextstep.test.ts`
19. `tests/fixtures/existing-project-adoption/**`
20. `tests/fixtures/project-status/**`
21. `skills/nextstep/SKILL.md`

公开 CLI 不包含写入口；trusted activation 由宿主进程内 port 暴露。若现有共享 schema、Git transaction 或 trusted-action 模块需要修改，必须先在 packet 前精确列明并证明复用必要性，不能以本文候选上限作为开放写集。

### 6.3 A3.0-B 与 S3.5-B 的路径协调

- Generation 1 的 `S3.5-B exact-20` 尚未创建 packet，因此其 future exact surface 只保留为历史计划，不构成已占用的执行写集。
- Generation 2 若获批，必须在 `generation-advance` 与 `generation-ack` 中显式登记一组 adoption-reserved status surface：`schemas/v1/project-status-projection.schema.json`、`src/domain/project-status-projection.ts`、`src/adapters/node/project-status-source.ts`、`src/cli/project-status.ts`、`src/cli/nextstep.ts`、`tests/domain/project-status-projection.test.ts`、`tests/adapters/node/project-status-source.test.ts`、`tests/cli/project-status.test.ts`、`tests/cli/nextstep.test.ts`、`tests/fixtures/project-status/**`。
- 上述 reserved subset 仅用于承接 adopted-baseline、namespace 分类和 trusted activation 后的公开状态投影，不得顺带吸收 `generation-recovery`、`task-registry`、`control-ref-store` 或 `P4-V04/V05` 的其他恢复职责。
- Generation 2 未来的 `S3.5-B` packet 必须把这组路径视为既有上游基线：只能在 adoption 已接纳的公开状态契约之上继续恢复语义，不得重复声明所有权、回退 adoption 语义或绕过新的 exact packet。

### 6.4 TDD 与验收

- RED 正例：可信 action 绑定 exact display/candidate；genesis 零父、activation 单父；formal/control expected-missing 同一 transaction；post-check 与 receipt create-or-return。
- RED 负例：stdin/env/argv 自述确认、过期/replay、verifier 能力缺失、业务 HEAD 作为 control parent、伪 version signoff、单 ref 补齐全部拒绝。
- RED 公开状态闭包：`PROJECT_NOT_ADOPTED` 只在整个 namespace 为空时出现；single-ref 返回 `REF_PAIR_INCOMPLETE`；extra-only 与 pair+extra 返回 exact `ADOPTION_SOURCE_CONFLICT`，且 `project-status` Schema、CLI、`nextstep status` 与 fixture/test 一致。
- RED 阻塞：事务前后 HEAD/blob/worktree/worktree-list/namespace 漂移；额外 nextstep ref；后继 control 或外部副作用存在时回滚。
- RED 恢复：对象创建前后、事务 commit 前后、receipt 丢失、rollback post-check 丢失均确定性恢复，不生成第二套 genesis。
- I：确认前明确展示副作用、未知门禁和回滚限制；成功只声明 adopted baseline。
- X：候选、用户动作、可信 verifier、激活与独立验收职责分离。
- P：证明既有项目可安全进入后续 NextStep 治理，不完成 PC-14 或历史会签。
- Profile：真实支持宿主必须提供 trusted action/verifier/clock；缺失只能 blocked，不允许 shell 降级。
- Budget：生产实现增量、分支数、fixture 量和重复 Git transaction 代码需通过复杂度预算；超限回退只读 inspect。

## 7. A3.0 累计验收与真实项目边界

A3.0-A/B package PASS 后仍需独立 cumulative I/X/P/Profile/Budget：

- 重放完整 inspect -> trusted confirmation -> activation -> status -> receipt recovery -> eligible rollback；
- 在非 NextStep-native 的隔离仓库副本中验证，不使用 NextStep 自仓或 synthetic-only fixture 作为唯一产品证据；
- 首轮不得在 genealogy-hub、用户真实工作项目或其现有 refs 上执行激活；
- 证明业务 branch/HEAD/index/worktree 不被改写；
- 证明 adoption 不生成历史 version signoff、不授权编码/dispatch、不提前完成 M3.1。

累计 PASS 只放行 S3.2 packet 入口。

## 8. S3.2 及后续计划不变量

- S3.2 继续使用 Generation 1 计划冻结的 exact-14；职责仍为 control envelope、task registry、outbox/claim/fence、原子 create-or-return 与 dispatch ACK。
- S3.2 不创建 genesis、不解析已有项目阶段、不承担 trusted adoption confirmation 或 rollback。
- S3.3..S3.5 的 PC 主归属、顺序、allowlist 意图和版本出口不变；其 packet 在 Generation 2 下重新绑定新计划 identity。
- V3、V4、Final Acceptance、CR-006 和 P5 的完成条件不因 adoption 自动变化。

## 9. Generation advance 与 ack 候选合同

CR-007 已最终批准；只有 live-state reconciliation fresh 独立 PASS、S3.1 按第 4 节正式收口或失效处理完成、且用户另行授权精确 expected-old 后，主控才可执行两个分离 CAS：

1. `generation-advance`：单父 expected-old control CAS，绑定 Generation 1/2 plan digests、CR/设计/独立评审、superseded future entries 和 carry-forward 待决状态；
2. `generation-ack`：另一单父 expected-old CAS，复核 advance 为最新 control，并登记最终入口、S3.1 carry-forward 或 rerun 决定。

两者不能合并，不能预先创建 A3.0 packet，也不能由本次 Change Intake 授权推定。formal 保持不动。

准备阶段只可形成字段级 proposal；不得冻结以下运行时值：generation-advance expected-old、S3.1 accepted subject/Result/review、compatibility audit digest、advance control OID 和 ack expected-old。它们必须在先决状态完成后重新读取和绑定。

## 10. 独立计划评审门禁

本候选进入实现前必须取得 fresh 独立 verdict：

- `PASS / 100`；P0/P1/P2=`0/0/0`；
- 精确确认 CR、设计、计划三者一致；
- 确认没有产品代码、S3.2、Generation 1 文件或 refs 变更；
- 确认 genesis/control ancestry、adopted-baseline、可信确认、原子 ref pair、恢复/回滚合同无缺口；
- 确认 V3 当前阶段必要性、Generation 2 代际、carry-forward 与 stale future entry 处理成立；
- 确认评审 PASS 本身不等于用户批准、generation CAS 或编码授权。

未达到精确门禁则修订候选并启动新的独立 review attempt，旧 verdict 永久保留。

## 11. 退出条件

本 Change Intake 计划候选的退出条件仅为：

1. 文档写集和引用闭合；
2. 本地文档检查通过；
3. fresh 独立评审精确 PASS；
4. 向用户报告候选与 verdict 身份，等待用户最终批准 CR。

不得在此退出点声明 V3 Generation 2 已生效、A3.0 可编码或任何项目已被接入。
