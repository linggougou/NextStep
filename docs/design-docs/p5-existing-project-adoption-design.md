# P5 Existing Project Adoption 设计合同

## 1. 文档身份与边界

- 状态：Change Intake 设计候选，等待独立评审与用户最终批准。
- 关联变更：`CR-007`（既有项目安全接入）。
- 所属路线：`S5 / P5 / V3` 当前阶段缺口候选。
- 计划影响候选：全局 `plan_generation=5` 不变；V3 子计划 `v3_plan_generation 1 -> 2`。
- 本文只冻结可验收合同，不授权编码、packet、claim/fence、dispatch、CAS、formal/control 移动或目标项目接入。
- S3.2 的职责与 exact-14 写集不变；adoption 由候选 remediation package `A3.0` 独立承接。

## 2. 设计目标

Existing Project Adoption 允许 NextStep 在不伪造历史门禁、不改写业务历史且不信任 shell 自述确认的前提下，为一个已经存在路线锁、活动计划和历史证据的 Git 项目建立首次 formal/control 身份。

设计必须同时满足：

1. 公开入口只读、可重复、无隐式副作用；
2. 业务 baseline 与 control ancestry 完全分离；
3. 历史证据保留来源等级，不升级为 NextStep 原生会签；
4. 激活由可信宿主绑定真实用户动作并一次性原子创建 ref pair；
5. 任一身份或工作区漂移均在副作用前失败；
6. 仅在不存在后继状态时允许精确双 ref 回滚；
7. adoption 成功只建立后续治理起点，不自动授权开发或宣告当前阶段完成。

## 3. 核心对象合同

### 3.1 AdoptionCandidate

候选必须是 RFC 8785/JCS 可规范化、SHA-256 内容寻址的不可变值，至少包含：

```text
AdoptionCandidate
  schema_version
  repository_identity
  candidate_head_oid
  route_lock: { path, blob_oid, digest }
  active_plan: { path, blob_oid, digest }
  evidence_sources[]: { path, blob_oid, digest, classification }
  proposed_projection
  unknown_gates[]
  declared_non_goals[]
  worktree_projection_digest
  nextstep_namespace_digest
  created_at_trusted
  expires_at_trusted
  candidate_digest
```

约束：

- `repository_identity` 由 Git common-dir identity、object format 和规范项目根共同派生；不得只用目录名或当前 shell cwd。
- 路线锁、活动计划和验证摘要只能读取 `candidate_head_oid` 对应 tree 中的 blobs；工作树内容只参与“是否干净”的裁决，不参与正式候选内容。
- `evidence_sources[].classification` 只能是 `verified | user-declared | unknown`。
- `candidate_digest` 覆盖除自身以外的全部语义字段；数组顺序必须冻结或按稳定键排序。
- 候选不是授权，不得携带可直接执行的 ref 更新命令或把宿主建议冒充用户决定。

### 3.2 AdoptionConfirmationEnvelope

可信确认信封至少包含：

```text
AdoptionConfirmationEnvelope
  candidate_digest
  displayed_view_digest
  user_action_ref
  session_identity
  verifier_identity
  verified_at_trusted
  expires_at_trusted
  nonce_or_replay_key
  decision: confirm
  envelope_digest
```

`displayed_view_digest` 必须覆盖用户实际看到的项目、候选 commit、当前阶段/里程碑、证据等级、未知门禁、激活副作用、非目标和回滚限制。任何展示字段或 candidate 变化都使旧确认失效。

### 3.3 ControlGenesis

genesis 是专用 control 链的零父 commit：

```text
ControlGenesis
  kind: adoption-control-genesis
  schema_version
  repository_identity
  candidate_digest
  created_at_trusted
```

硬约束：

- parent count 必须为 `0`；
- tree 只保存创建 control 身份所需的最小非敏感字段；
- 业务 HEAD/formal OID 可以作为数据绑定，但不得成为 commit parent；
- 相同 effect identity 的恢复可以复用已证明等价的对象，不得生成第二条成功控制链。

### 3.4 AdoptionActivation

activation 是最终 control ref 首次指向的单父 commit，唯一父为 genesis：

```text
AdoptionActivation
  kind: adopted-baseline-activation
  parent: control_genesis_oid
  checkpoint
  registry
  adopted_baseline
  confirmation_envelope_digest
  effect_identity
  rollback_guard
  activation_receipt_identity
```

最新 control 保持单父，兼容现有 control reader；业务 HEAD 仅由 formal ref 和 `adopted_baseline.baseline_oid` 绑定。

### 3.5 AdoptedBaselineRecord

```text
AdoptedBaselineRecord
  repository_identity
  baseline_oid
  source_blobs[]
  candidate_digest
  confirmation_envelope_digest
  projected_stage
  projected_milestone
  projected_scope
  evidence_assessments[]
  unknown_gates[]
  disclaimer
  lifecycle_state
```

- `disclaimer` 固定表达：`adopted baseline; historical gates not verified by NextStep`。
- `lifecycle_state` 只允许 `activated | rollback-eligible | rollback-blocked | superseded`。
- 本记录与 `version_signoffs` 分开保存、分开校验、分开投影；不得生成接入前 V1/V2/V3 的 formally-completed 结论。

## 4. 状态机

```text
not-adopted
  -> inspected
  -> awaiting-trusted-confirmation
  -> confirmed
  -> activation-preflight
  -> activated

任一步漂移或拒绝
  -> stale/rejected（零 ref 副作用，可重新 inspect）

activated 且无后继 control/副作用
  -> rollback-eligible
  -> rolled-back（ref namespace 回到空）

activated 且出现后继 control/副作用/身份冲突
  -> rollback-blocked（保留历史，进入恢复）
```

对象已写入 object database 但 ref transaction 尚未提交，不构成 `activated`；悬空对象不需要人工删除，由 Git GC 正常回收。

## 5. 只读检查合同

公开 CLI 候选名为 `adoption-inspect`；最终命令名可在实施 packet 中冻结，但必须保留只读语义。它只允许：

- 解析显式 `project-root` 并证明仓库身份；
- 枚举整个 `refs/nextstep/*` namespace；
- 读取 HEAD commit/tree 中白名单真源 blobs；
- 读取 index、tracked worktree、untracked、ignored 冲突和 worktree 列表的只读投影；
- 输出 canonical candidate 或稳定的结构化拒绝；
- 以最小用户文案明确未知门禁、不会发生的副作用及下一步。

它不得：

- 创建/更新/删除 Git ref、commit、index、branch、worktree 或业务文件；
- 从工作树 Markdown、聊天、stdin 或环境变量直接采信路线/阶段/确认；
- 自动猜测唯一阶段或把 AI 建议标为 verified；
- 暴露 `--commit`、`--force` 或等价不可信写入口。

## 6. 可信确认与端口隔离

激活只允许通过 trusted in-process host port：

```text
activateAdoption({
  candidate,
  confirmationEnvelope,
  trustedVerifier,
  trustedClock,
  gitObjectPort,
  gitRefTransactionPort
}) -> activated | rejected | conflict | recovery-required
```

端口在写对象前必须验证：

1. action 确为宿主捕获的独立用户动作，而不是模型、stdin、argv、env 或文件自述；
2. action、会话、显示摘要、candidate、时钟和 expiry 全部一致；
3. verifier 方法齐全且结果可验证；能力缺失必须受控 fail closed；
4. replay key 未被不同 payload 使用；相同 effect identity 仅允许 create-or-return；
5. 当前调用角色没有同时承担候选生成、用户动作或独立验收角色。

## 7. 激活预检与漂移边界

激活前在同一逻辑临界区重读并比较：

- repository/common-dir/object-format identity；
- HEAD OID 与 candidate HEAD；
- route lock、active plan、evidence blobs 的 OID/digest；
- index tree、tracked diff、untracked 集合；
- ignored 文件是否遮蔽真源路径；
- `git worktree list --porcelain` 的规范投影；
- 整个 `refs/nextstep/*` namespace；
- trusted clock、expiry、session 和 verifier result。

默认要求 index、tracked worktree 和 untracked 集合为空。ignored 内容不成为证据；若遮蔽真源或影响候选解析则拒绝。多 worktree 只要无法证明唯一身份、同分支约束或集合稳定即拒绝，不擅自清理、切换或删除。

## 8. Git 对象与 ref 事务

激活顺序固定为：

1. 预检通过；
2. 内容寻址准备 genesis tree/commit；
3. 准备 activation tree/commit，验证唯一父为 genesis；
4. 再次执行事务前漂移复核；
5. 使用单次 `update-ref --stdin` transaction：
   - `create refs/nextstep/formal <candidate_head>`，expected old 为 zero OID；
   - `create refs/nextstep/control <activation_oid>`，expected old 为 zero OID；
   - prepare 与 commit 必须均成功；
6. 提交后重读 exact ref pair、activation/genesis 父链、control tree 和整个 namespace；
7. 生成内容寻址 activation receipt。

禁止先后两个独立 ref 更新、宽松 force、以“其中一个成功”报告部分成功，或在事务失败后自动补齐单 ref。

## 9. 投影优先级与兼容性

项目状态投影按以下优先级裁决：

1. 整个 `refs/nextstep/*` namespace 为空：`PROJECT_NOT_ADOPTED`；
2. formal/control pair 只缺一个，且 namespace 中没有额外 `refs/nextstep/*`：`REF_PAIR_INCOMPLETE`；
3. formal/control 均缺失但存在 extra-only namespace，或合法 pair 之外还存在额外 `refs/nextstep/*`：返回 exact `ADOPTION_SOURCE_CONFLICT`；
4. ref、control ancestry 或 tree 无法验证：现有结构损坏类 fail-closed 结论；
5. 合法 current task 存在：current task identity 为主投影，adopted baseline 作为历史来源；
6. 无 current task 且存在合法 adopted baseline：展示用户确认阶段、证据等级、未知门禁和下一动作；
7. 仅有原生 version signoff：按既有投影；
8. adopted baseline 与 version signoff 冲突：拒绝投影，不猜测优先项。

原生 NextStep 项目不得被误判为需要 adoption；已有任一 `refs/nextstep/*` 时，公开 inspect 只报告冲突或已有状态，不允许初始化第二套 control 身份。

## 10. 回执丢失、恢复与回滚

### 10.1 回执丢失恢复

若进程在事务提交后、返回成功前崩溃：

- 以 repository identity、candidate digest、confirmation envelope digest、genesis/activation OID 和 effect identity 查询；
- exact ref pair 与对象内容全部匹配时返回同一 receipt；
- 任一字段不匹配返回 conflict/recovery-required；
- 不创建第二套 genesis，不把额外 namespace 状态静默归并。

### 10.2 精确回滚

回滚只在以下条件全部为真时开放：

- formal 精确等于 candidate HEAD；
- control 精确等于 activation OID；
- activation 没有后继 control commit；
- 没有 task/outbox/claim/ACK/Result/formal promotion 或不可裁决外部副作用；
- namespace 恰好包含预期 formal/control；
- trusted rollback action 绑定 receipt 与当前 namespace digest。

满足后使用一次 expected-OID transaction 同时删除两 refs，提交后复核 namespace 为空。任何条件不满足返回 `ADOPTION_ROLLBACK_BLOCKED` 并保持 refs 不变；不得 reset 业务分支、改写 control 历史或删除 Git objects。

## 11. 失败矩阵

| 场景 | 结论 | Ref 副作用 | 恢复 |
|---|---|---:|---|
| namespace 全空 | `PROJECT_NOT_ADOPTED` | 无 | 允许 inspect |
| 仅单 ref 且无额外 nextstep refs | `REF_PAIR_INCOMPLETE` | 无 | 人工诊断，不自动补齐 |
| extra-only namespace 或 pair+extra namespace | `ADOPTION_SOURCE_CONFLICT` | 无 | 人工诊断，不自动补齐 |
| HEAD/blob/worktree/worktree-list 漂移 | `ADOPTION_CANDIDATE_STALE` | 无 | 重建 candidate + 新确认 |
| 不可信/过期/重放确认 | `ADOPTION_CONFIRMATION_REJECTED` | 无 | 获取新可信 action |
| 对象创建后、事务前崩溃 | 未激活 | 无 | 重跑；悬空对象交给 GC |
| transaction prepare/commit 失败 | `ADOPTION_ACTIVATION_CONFLICT` | 不得报告成功 | 重读 namespace 后裁决 |
| transaction 成功、receipt 丢失 | 恢复待裁决 | pair 已原子存在 | exact create-or-return |
| 后继 control 已存在时请求回滚 | `ADOPTION_ROLLBACK_BLOCKED` | 保持 | 新 control transition/人工恢复 |

## 12. 安全、隐私与复杂度预算

- 候选、错误和审计日志禁止记录 Token、完整聊天、低熵秘密、文件正文或无关绝对路径。
- Git 子进程必须使用参数数组、明确 cwd、受控环境与超时；不得拼接 shell 字符串。
- 路径先做 repository-relative 规范化，拒绝 `..`、绝对路径、NUL、symlink 越界和大小写/Unicode 冲突。
- 新功能不得引入数据库、守护进程、网络服务、通用迁移 DSL 或新的编排系统。
- `A3.0-A` 与 `A3.0-B` 各自保持单一领域边界；共享 Git/ref primitives 必须复用既有端口，不复制 transaction 实现。
- 若 adoption 会改变公开 `status` 输出或 unavailable reason 分类，则 `project-status-projection` Schema、`project-status` CLI、`nextstep status` 聚合入口、CLI 测试与 `tests/fixtures/project-status/**` 视为同一 contract surface，必须在同一 packet allowlist 中闭合，或在计划中明确证明无需修改。
- 若复杂度预算无法满足，降级为只读 inspect，不开放 activation。

## 13. 可验收测试合同

### 13.1 A3.0-A 候选与只读检查

- 正例：干净、namespace 空、真源 blobs 唯一，重复 inspect 得到同一 digest。
- 负例：路线锁/计划来自工作树、缺失/重复真源、symlink 越界、敏感字段、路径冲突均拒绝。
- 阻塞：dirty/staged/untracked、ignored 遮蔽、多 worktree 身份不可证明、任意 nextstep ref 存在。
- 恢复：HEAD/blob/worktree-list 漂移后旧 candidate 明确 stale，新 candidate 不覆盖旧摘要。
- 投影：`PROJECT_NOT_ADOPTED`、`REF_PAIR_INCOMPLETE` 与 extra-only/pair+extra 的 `ADOPTION_SOURCE_CONFLICT` 区分稳定。

### 13.2 A3.0-B 激活、投影与回滚

- 正例：零父 genesis、单父 activation、双 ref expected-missing 原子提交、post-check、receipt create-or-return。
- 负例：shell 自述确认、过期/replay、展示摘要漂移、业务 HEAD 作为 control parent、伪 version signoff 全拒绝。
- 合同闭包：若 adoption 扩展公开 `status` 投影，则 Schema、CLI、`nextstep` 聚合入口、对应 fixture 与 CLI 测试必须和 projector/source 同包验收。
- 阻塞：事务前后 namespace 漂移、额外 ref、single-ref partial、verifier 方法缺失、后继状态回滚。
- 恢复：四个崩溃点覆盖对象前、对象后事务前、事务提交后 receipt 前、rollback transaction 后复核前。
- 兼容：NextStep-native 状态投影不变；adopted baseline 不宣称历史 PASS。

### 13.3 独立验收

两个包分别执行 I/X/P/Profile 与预算审查；A3.0 累计验收还必须在非 NextStep-native 项目的隔离副本上演练，但首轮不得创建 genealogy-hub 或其他真实工作项目 refs。

## 14. 计划与批准链

本文通过独立评审只证明设计候选可接受。后续顺序必须是：

1. 用户最终批准 CR-007；
2. V3 Generation 2 generation-advance 独立 control CAS；
3. V3 Generation 2 generation-ack 独立 control CAS；
4. 按新计划分别创建 A3.0-A、A3.0-B packet 并执行完整门禁；
5. A3.0 累计验收通过后，才允许按原 exact-14 进入 S3.2。

本轮授权停在设计、计划候选与独立评审，不执行上述任一步。
