# P5 可承受性护栏技术设计

- 状态：实施候选，不是已会签产品真源
- 上位真源：`docs/change-requests/006-scalability-guardrails.md`、`docs/exec-plans/active/p5-scalability-guardrails.md`
- 适用阶段：P5 / S5 开发落地
- 设计日期：2026-08-26

## 1. 目标、约束与当前基线

本设计只细化 CR-006 冻结的三个互斥任务包：SG-1 复杂度预算纯函数、SG-2 只读人类状态投影、SG-3 真实项目价值验证框架。它们用于阻止治理成本继续无界增长，不删除或弱化既有身份绑定、独立验收、用户会签、证据或 CAS。

当前只读观测基线为 control 历史 505 commits、control tree 714 files，其中含 40 packets、86 gate requests、294 messages，registry 有 81 tasks。该基线解释为什么需要前向护栏，但不用于追溯否定 V1，也不允许调用方据此放宽冻结阈值。

共同硬边界：

- 三包路径必须互斥，不共享新增 helper，不拆第四包；
- 不修改既有 Schema、领域契约、路线锁、计划、formal/control 或历史证据；
- 不新增依赖、数据库、服务、远程控制面、正式 ref 或宿主支持声明；
- 本设计和未来实现都不创建 V2 packet/claim/fence/dispatch，不证明 PC-12、PC-19、V2、V4 或 P5 完成；
- 三包合计遵守上位计划的 9 个生产/Schema 文件、7 个测试文件、16 个 fixture、1,200 行生产代码和 1,800 行测试/fixture/协议正文上限。

控制身份前置：CR-006 改变计划范围、任务和 DoD，因此新任务不得复用 `plan_generation=4`。replacement 规划验收通过后，必须先按两个独立 expected-old CAS 完成 `generation-advance` 与 `generation-ack`，把 `plan_id=p5-product-implementation` 推进到 generation 5；generation 4 的 V1 完成证据保持只读有效。SG-1 首个 packet 使用 `stage_id=P5/CR-006/SG-1`、`task_id=SG-1`、`plan_generation=5`、`task_attempt=1`，且 packet CAS 仍需新的精确授权。SG-2/SG-3 同理，不得借 generation 5 ACK 自动创建。

## 2. SG-1：复杂度预算纯函数

### 2.1 精确文件与规模

只允许：

```text
schemas/v1/scalability-budget.schema.json
src/domain/scalability-budget.ts
tests/domain/scalability-budget.test.ts
tests/fixtures/scalability-budget/**  # 最多 4 个
```

上限：2 个生产/Schema 文件、1 个测试文件、4 个 fixture；生产代码不超过 320 行，测试与 fixture 不超过 420 行。SG-1 不读 Git、不访问文件、不新增 CLI/adapter、不写 control，也不自动批准例外。

### 2.2 数据契约

单一 Schema 文件同时定义输入和结果。输入六项全部 required，`additionalProperties=false`：

```ts
interface ScalabilityBudgetInput {
  readonly schema_version: "1.0";
  readonly measurements: {
    readonly control_cas_per_attempt: number | null;
    readonly immutable_evidence_files_per_attempt: number | null;
    readonly user_visible_confirmations_per_attempt: number | null;
    readonly consecutive_non_pass_attempts_per_milestone: number | null;
    readonly active_plan_generations_per_milestone: number | null;
    readonly active_independent_tasks_per_packet: number | null;
  };
}

type BudgetMetric = keyof ScalabilityBudgetInput["measurements"];

interface ScalabilityBudgetResult {
  readonly schema_version: "1.0";
  readonly conclusion:
    | "within-budget"
    | "exception-required"
    | "unmeasurable";
  readonly limits: Readonly<Record<BudgetMetric, number>>;
  readonly exceeded_metrics: readonly BudgetMetric[];
  readonly unmeasurable_metrics: readonly BudgetMetric[];
  readonly input_digest: `sha256:${string}`;
}
```

字段缺失、未知字段、负数、非整数和未知版本由 Schema 拒绝；显式 `null` 表示该项不可测。调用方不得提交 limits、阈值版本、跳过独立验收/用户会签/CAS 等豁免建议；由于 `additionalProperties=false`，此类输入直接拒绝。

### 2.3 冻结阈值与判定

| 指标 | 上限 |
|---|---:|
| `control_cas_per_attempt` | 12 |
| `immutable_evidence_files_per_attempt` | 24 |
| `user_visible_confirmations_per_attempt` | 2 |
| `consecutive_non_pass_attempts_per_milestone` | 2 |
| `active_plan_generations_per_milestone` | 1 |
| `active_independent_tasks_per_packet` | 5 |

纯函数按固定字段顺序执行：

1. 任一值为 `null`，结论为 `unmeasurable`，列出全部不可测项；即使其他项未超限也不能返回 `within-budget`。
2. 全部可测且任一值大于上限，结论为 `exception-required`，稳定列出全部超限项。
3. 全部可测且均小于等于上限，结论为 `within-budget`。

不存在加权分数、PASS/WARN 平均、调用方自定义阈值或 `force`。`exception-required` 的含义是停止静默扩张并进入既有例外/Change Intake，不是删除门禁的授权；`unmeasurable` 必须 fail closed。

### 2.4 关键负例与测试

- 六项恰好等于上限为 `within-budget`，任一 `上限+1` 为 `exception-required`；
- 多项同时超限时完整、稳定排序，不因输入字段顺序变化；
- 任一 `null` 为 `unmeasurable`，其余超限项仍可作为诊断列出，但不能覆盖不可测结论；
- 缺字段、负数、小数、未知版本、未知字段、NaN/Infinity 和豁免建议被拒绝；
- 同一 canonical input 产生相同 JCS 可序列化结果与 digest；
- 测试 fixture 只验证判定，不读取或模拟 Git 历史。

SG-1 包级 PASS 只表示预算判定内核可用，不表示现有 control 历史达标。

## 3. SG-2：只读人类状态投影

### 3.1 精确文件与规模

只允许：

```text
schemas/v1/project-status-projection.schema.json
src/domain/project-status-projection.ts
src/adapters/node/project-status-source.ts
src/cli/project-status.ts
tests/domain/project-status-projection.test.ts
tests/cli/project-status.test.ts
tests/adapters/node/project-status-source.test.ts
tests/fixtures/project-status/**       # 最多 6 个
```

上限：4 个生产/Schema 文件、3 个测试文件、6 个 fixture；生产代码不超过 520 行，测试与 fixture 不超过 760 行。

### 3.2 只读来源契约

CLI 仅接受显式 `--project-root <absolute-path>`。adapter 用 Git plumbing 冻结并读取：

```ts
interface ProjectStatusSource {
  readonly schema_version: "1.0";
  readonly observed_at: string;
  readonly formal_oid: string;
  readonly control_oid: string;
  readonly control_parent_oid: string;
  readonly checkpoint_blob_oid: string;
  readonly registry_blob_oid: string;
  readonly checkpoint: unknown;
  readonly registry: unknown;
}
```

读取顺序固定：解析 formal/control OID；读取 control commit 的唯一父、`checkpoint.json`、`registry.json`；再次解析 formal/control。两次 OID 不同即丢弃结果并失败。禁止 checkout、fetch、commit、update-ref、写缓存或扫描 Markdown 猜状态。

adapter 必须验证：

- checkpoint 的 formal ref/OID 等于本次 formal OID，control parent 等于 control commit 的唯一父；
- checkpoint/registry 的 repository、route generation、plan ID、plan generation 一致；
- completed version/milestone 的 Result、digest、signoff 和 formal 身份完整；
- registry 同 task 在最高 generation/attempt 的身份、摘要、状态唯一；墓碑、旧 generation 和已完成版本的历史失败不是当前 blocker；
- 活动记录若带 expiry，过期即来源 stale；没有 expiry 不得凭文件年龄猜测 stale。

### 3.3 投影契约

```ts
interface ProjectStatusProjection {
  readonly schema_version: "1.0";
  readonly status: "available" | "unavailable";
  readonly current_stage: string | null;
  readonly current_scope: string | null;
  readonly latest_formal_conclusion: string | null;
  readonly blockers: readonly {
    readonly reason_code: string;
    readonly evidence_ref: string;
  }[];
  readonly next_action: string | null;
  readonly risk_summary: readonly string[];
  readonly formal_oid: string;
  readonly control_oid: string;
  readonly source_digest: `sha256:${string}`;
  readonly freshness: "current" | "stale" | "unknown";
  readonly unavailable_reasons: readonly string[];
}
```

`next_action` 只能复用身份一致的结构化 next-stage/next-action 字段；不得从文件名、旧会签或聊天推断，更不得把会签扩张成 packet、claim、dispatch 或编码授权。来源冲突、ref 缺失、OID 非法、未知状态、过期活动身份或下一步不可证明时返回 `status=unavailable`，`next_action=null`，列出最小 reason code；不能输出一个看似完整的猜测摘要。

默认投影不含完整任务历史、claim/fence、聊天、源代码、绝对业务路径、密钥或全部证据列表。审计只通过 formal/control OID、来源 blob OID 合成的 `source_digest` 和最小 evidence ref 回查。

### 3.4 CLI 与负例

```text
nextstep-project-status --project-root <absolute-path>
```

- 成功 stdout 只有一份 JCS JSON，退出 0；诊断只写 stderr；失败退出非 0；
- 不提供 text、write、ref override、refresh/fetch 或状态覆盖参数；
- 运行前后 formal/control OID、`git status --porcelain` 和 fixture 字节必须完全一致；
- ref 缺失、control 多父、checkpoint/registry 冲突、同一最高身份摘要冲突、expiry 过期、未知状态均 fail closed；
- 旧 `revision-required` 不得冒充当前 blocker，旧 user signoff 不得冒充当前授权；
- 敏感字段、完整历史或业务内容即使存在于输入，也不得进入 stdout/stderr。

SG-2 包级 PASS 只表示只读投影可用，不是 PC-12 的四态阶段转换、用户确认或 V2 完成证据。

## 4. SG-3：真实项目价值验证框架

### 4.1 精确文件与规模

只允许：

```text
docs/qa/real-project-value-validation.md
schemas/v1/project-value-run.schema.json
src/domain/project-value-validation.ts
src/cli/project-value-validation.ts
tests/domain/project-value-validation.test.ts
tests/cli/project-value-validation.test.ts
tests/fixtures/project-value-validation/**  # 最多 6 个
```

上限：3 个生产/Schema 文件、1 个协议文档、2 个测试文件、6 个 fixture；生产代码不超过 360 行，测试、fixture 与协议正文不超过 620 行。CLI 只离线校验与聚合，不自动采集、不写项目、不联网、不接遥测。

### 4.2 单次记录契约

```ts
interface ProjectValueRun {
  readonly schema_version: "1.0";
  readonly run_id: string;
  readonly run_kind: "real" | "synthetic";
  readonly collection_mode: "prospective" | "retrospective";
  readonly project_origin:
    | "external-user-project"
    | "nextstep-self"
    | "nextstep-derived";
  readonly project_identity: `sha256:${string}`;
  readonly evidence_digest: `sha256:${string}`;
  readonly evidence_binding_digest: `sha256:${string}`;
  readonly user_authorization_ref: string | null;
  readonly started_at: string;
  readonly ended_at: string;
  readonly used_nextstep: boolean;
  readonly metrics: {
    readonly time_to_first_frozen_requirement_seconds: number | null;
    readonly user_intervention_count: number;
    readonly false_block_count: number | null;
    readonly false_block_evidence_refs: readonly string[];
    readonly recovery_seconds: readonly number[];
    readonly outcome: "completed" | "abandoned" | "blocked";
  };
  readonly user_confirmation: {
    readonly confirmed: boolean;
    readonly confirmation_ref: string | null;
  };
}
```

`run_kind` 只允许 `real|synthetic`，`collection_mode` 只允许 `prospective|retrospective`；二者是正交字段，禁止另设复合枚举。Schema 使用 `additionalProperties=false`，禁止完整聊天、源码、密钥和业务内容字段。所有计数和时长必须是非负有限数；`ended_at >= started_at`。`false_block_count` 仅在有用户或独立裁决引用时可为数字，缺裁决时必须为 null，聚合时不能按 0。

`evidence_binding_digest` 精确等于 `sha256(JCS({run_id,project_identity,evidence_digest}))`。真实运行还必须同时满足：`run_kind=real`、`collection_mode=prospective`、`project_origin=external-user-project`、用户拥有或明确授权、authorization ref 非空、不可逆项目身份和原始证据摘要完整、binding 精确匹配、用户确认引用完整。NextStep 自测仓库、NextStep 派生项目、fixture、AI 样例、同一项目复制/改名、retrospective 回填或无原始证据记录均不合格。binding 只能阻止受支持输入路径中 run、project 与 evidence 的误配或回填，不能抵抗可任意改写磁盘记录及重新计算摘要的恶意操作者，也不构成密码学不可抵赖证明。

输入处理冻结为两类，禁止把合法但不合格的记录误报为格式错误：

- 任一记录违反 Schema、时间或数值约束，输入包含禁止的敏感字段/内容，或批内出现重复 `run_id`，整批拒绝，不产生 aggregate；重复 `run_id` 的稳定错误码为 `DUPLICATE_RUN_ID`。
- 通过上述整批校验但不满足真实资格的记录进入 `excluded_records`。同一 `project_identity` 出现多次时，该 identity 对应的所有记录全部排除，不能保留其中一条凑数。

每条合法排除记录只保留一个 `reason_code`，按下列优先级选择首个命中项，code 必须逐字一致：`duplicate-project-identity`、`synthetic`、`retrospective`、`nextstep-self`、`nextstep-derived`、`used-nextstep-false`、`missing-user-authorization`、`missing-user-confirmation`、`evidence-binding-mismatch`。

### 4.3 聚合契约

```ts
interface ProjectValueAggregate {
  readonly schema_version: "1.0";
  readonly total_records: number;
  readonly synthetic_records: number;
  readonly qualified_real_runs: number;
  readonly duplicate_project_records: number;
  readonly excluded_records: readonly {
    readonly run_id: string;
    readonly reason_code: string;
  }[];
  readonly medians: {
    readonly time_to_first_frozen_requirement_seconds: number | null;
    readonly user_intervention_count: number | null;
    readonly adjudicated_false_block_count: number | null;
    readonly recovery_seconds: number | null;
  };
  readonly outcomes: Readonly<Record<"completed" | "abandoned" | "blocked", number>>;
  readonly validation_state: "real-runs-insufficient" | "three-real-runs-observed";
  readonly evidence_digest: `sha256:${string}`;
}
```

先将 normalized runs 按 `run_id` 稳定排序，再校验和聚合；`excluded_records` 也按 `run_id` 排序，单条记录同时命中多个排除条件时按 4.2 的单一 reason 优先级裁决。`outcomes` 与全部 `medians` 只基于 qualified runs。`recovery_seconds` 中位数把所有 qualified run 的全部 recovery event 展平后计算；没有 event 时为 `null`，缺失绝不按 0。aggregate 的 `evidence_digest` 精确等于 `sha256(JCS({runs: normalized runs sorted by run_id}))`，不得混入 aggregate 自身或原始输入字节。

0、1、2 个合格真实运行固定为 `real-runs-insufficient`；至少 3 个独立项目才可为 `three-real-runs-observed`。这只表示样本被观测，不得写“证明提升”“验证完成”或“PC-19 通过”。没有配对基线时不计算节省百分比；其他缺失值不按 0，不删除离群值。

### 4.4 离线 CLI、协议与负例

```text
nextstep-project-value-validation < canonical-input.json
```

输入为 `{schema_version:"1.0", runs:[...]}` 的 canonical JSON。成功必须 exit 0、stderr 为空、stdout 恰好一份 aggregate JCS；失败必须 exit 1、stdout 为空、stderr 恰好一行稳定错误码且不回显原值。错误码至少冻结为 `INVALID_INPUT`、`NON_CANONICAL_INPUT`、`SENSITIVE_INPUT_REJECTED`、`DUPLICATE_RUN_ID`：JSON 无法解析为目标输入或 Schema/时间/数值约束失败用 `INVALID_INPUT`；解析后含禁止敏感材料用 `SENSITIVE_INPUT_REJECTED`；输入字节不是其 RFC 8785/JCS 表示用 `NON_CANONICAL_INPUT`；批内重复 `run_id` 用 `DUPLICATE_RUN_ID`。CLI 不生成、修改或补写任何 run。

`docs/qa/real-project-value-validation.md` 必须定义五项度量的起止点、单位、缺失语义、授权与隐私边界、原始 evidence digest 产生方式，以及本地协议只能拒绝支持路径中的回填/冒充、不能对恶意磁盘操作者提供密码学不可抵赖性的限制。

固定负例：

- synthetic fixture 格式完整、可用于计算测试，但真实计数恒为 0；
- synthetic fixture 固定使用非 external 的 `project_origin`；只把 `run_kind` 改为 real 仍按来源排除，不把这种支持路径负例夸大为对恶意整体重写的抵抗；
- 缺 required 时间/摘要、结束早于开始或负数计数使整批 `INVALID_INPUT`；重复 `run_id` 使整批 `DUPLICATE_RUN_ID`；缺用户授权/确认、binding 不匹配、NextStep 自测/派生来源或 retrospective 则进入对应 exclusion；
- 三条记录中存在重复项目 identity 时，该 identity 的所有记录全部排除；存在 retrospective 或其他合法不合格记录时不能达到 3；
- false block 无裁决引用时不得聚合为 0；
- stdout/stderr 不回显业务内容、完整 evidence 或敏感字段。

SG-3 包级 PASS 文案固定为“真实项目价值验证框架可用，真实运行 0/3”。未来达到 3/3 仍不替代 V4 的 Q1..Q12 和全链路矩阵验收。

## 5. 跨包验收、回滚与停止条件

每包必须按上位计划先有 RED 后做最小 GREEN，运行受影响测试和全量 `pnpm check`，再由未参与实现的唯一独立验收者绑定候选 commit/tree/digest。三包分别 PASS 后才做一次累积只读验收，固定反扫：预算超限 fail closed、状态冲突/过期不可用、synthetic 冒充 real 真实计数为 0、路径互斥、无既有契约修改、无 Git/ref/工作树污染、无提前完成声明。

回滚只删除对应包冻结的新增路径，不修改已通过包、formal/control、用户工作树或历史证据。任一包需要公共 helper、第四任务包、路径外修改、既有契约调整、提高文件/行数/fixture 上限、新依赖、服务、遥测或新 ref 时立即停止，退回计划或新 Change Request，不能静默扩张。
