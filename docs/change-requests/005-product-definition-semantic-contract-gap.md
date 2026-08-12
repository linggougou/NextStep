# 产品定义非目标与来源角色契约缺口

- 状态：用户已批准；等待推进 plan_generation 4 和 S1.2 新链
- 记录日期：2026-08-12
- 来源：`P5 / V1 / M1.1 / S1.3` generation 3 attempt 2 阻塞
- 所属阶段：P5 / V1 / M1.1

## 1. 变更描述

CR-004 generation 3 attempt 2 在修复产品语义时发现，当前产品定义生产契约无法同时满足已冻结需求和既有产品门禁：

- `product-definition` Schema 与领域校验要求 `non_goals` 至少一项，但 `community-workshop` 的 `non_goal_gaps` 为 `rejected / []`，`expense-reminder` 为 `none / []`。
- 当前领域规则允许 `non_goals` 引用 `constraints`，导致实现只能把“低成本”“仅保存本地数据”包装成非目标，违反 P 门禁的角色隔离要求。
- `expense-reminder` 的用户确认事实“工作日早上提醒”位于 `clarification_gaps`，但 activity、result 和 capability 的合法来源角色不包含该字段，无法形成精确来源绑定。
- attempt 2 新增回归只比较同一 S1.3 fixture 内嵌的 Frozen Requirement 与产品定义；两侧同时改错仍可能通过，没有独立绑定 S1.2 回放真源。
- S1.2 当前只把 `unresolved` 计入不完整状态，因此 `non_goal_gaps=rejected` 和 `clarification_gaps=deferred/identified` 也能形成 `ready-for-confirmation` 并冻结；字段级完成语义没有在上游阻断。

这不是 fixture 文案微调可以关闭的问题。继续在 attempt 2 范围内修改会违反其 `src/**`、`schemas/**` 禁止写入边界，也会绕过 Change Intake。

## 2. 分流结论

- 类型：高风险基础变更，同时是当前阶段缺口。
- 原因：影响产品定义 Schema、领域来源角色和验收语义；不修复则 M1.1 无法通过，直接修改又会改变数据模型契约。
- 受影响真源：S1.2 readiness/字段归属/冻结版本链、产品定义 Schema、领域校验、S1.2/S1.3 fixture 与累积回归、Skill 消费契约、P5 活动计划、路线锁和 generation 4 新控制链。
- 不受影响：产品定位、主载体、技术栈、PC 主归属和当前 formal 内容。旧 S1.1/S1.2/S1.3 正式提升结论仅作为历史证据保留，不得满足 generation 4 的依赖、输入或正式门禁；新链必须重新完成 S1.2、S1.3 的完整正式提升。
- 当前正式基线记为 `F0=f3fdd26542e5e562f0b01a9a716d3eb8b46cae36`。CR 获批后到 S1.2 promotion 成功前保持 `F0`；S1.2 成功后以 expected-old=`F0` 单向推进到 S1.2 新锚 `F12`；S1.3 只能以 `F12` 为 baseline，成功后再以 expected-old=`F12` 单向推进到 S1.3 新锚 `F13`。
- 当前执行结论：attempt 2 为 `blocked`，Result Envelope digest 为 `sha256:d12eb69f11a3023ca38c4410b3b516f469d12831eb1e49e5401448a7baae1c93`；未创建候选。

## 3. 用户审查结论

- 2026-08-12 用户审查结论为 `REVISE / 66`。
- 暂不批准 CR-005 原方案，不授权 S1.3 attempt 3。
- 原方案把 `none`、`rejected` 和空值过早合并为 `non_goals=[]`，没有证明其满足已会签 PC-03 与 S1.3 DoD。
- 原方案倾向扩大 `clarification_gaps` 的下游来源资格，没有先裁决“工作日早上提醒”的 S1.2 字段归属。
- 正式证据链在累积产品回放之前运行，造成高成本提升后才发现最小跨阶段问题；该顺序必须调整。

### 3.1 第二轮复审

- 2026-08-12 第二轮复审结论为 `REVISE / 75`，仍不批准 CR-005，不授权 generation 3 attempt 3。
- 上轮四项方向性问题基本关闭；剩余硬缺口是新 plan generation、S1.2 先行正式提升、product-definition 线格式版本化，以及 PRODUCT_SENSE 残余 P3 入口。
- 本 CR 已改变 S1.2 readiness、字段归属、冻结身份和依赖基线，不能继续沿用 generation 3 的 S1.3 attempt 3。

### 3.2 第三轮复审

- 2026-08-12 第三轮复审结论为 `REVISE / 92`，P0=0、P1=1；上一轮四项必改已关闭，CR-005 仍未批准，generation 4 未授权。
- 唯一 P1 是 formal 状态矛盾：S1.2 promotion 后必须以新 formal 执行 S1.3，但旧风险/回滚文字又要求完整新链通过前始终保留 `F0`。
- 本次修订将 formal 固定为 `F0 -> F12 -> F13` 两段式单向推进，并明确 S1.2、S1.3 各自失败时的停留点；禁止 ref 回退。

### 3.3 第四轮独立复审

- 2026-08-12 第四轮独立复审结论为 `PASS / 98`，P0=0、P1=0、`required_fixes=[]`。
- generation 4、S1.2 先行正式链、Product Definition 2.0、消费者迁移、候选前累积硬门和 `F0 -> F12 -> F13` 两段式 expected-old CAS 全部通过审查。
- 该 PASS 只表示 CR-005 具备提交用户批准为“高风险基础变更 + 当前阶段缺口”的条件，不等于用户批准，不授权 generation 4、任务包、生产修改、formal promotion 或 S1.4。

## 4. `non_goal_gaps` 逐态裁决

本 CR 不再把多种状态统一映射为裸空数组。S1.3 候选形成前按以下规则判定：

| S1.2 状态 | 值约束 | 产品定义映射 | 门禁结论 |
|---|---|---|---|
| `identified` | 至少一个用户确认值 | `non_goals.status=identified`，`items` 非空；每项只能绑定 `non_goal_gaps` | 允许进入 S1.3 |
| `none` | 值必须为空 | `non_goals.status=none`，保留指向完整 `non_goal_gaps` 字段状态的来源摘要；不得伪造文本项 | 允许进入 S1.3 |
| `rejected` | 值必须为空 | 不生成产品非目标；表示用户拒绝当前非目标处理结果，不等于明确无非目标 | 退回 S1.2 |
| `deferred` | 值必须为空 | 不生成产品非目标；表示决定被推迟，不满足当前 PC-03 完整性 | 退回 S1.2 |
| `unresolved` | 值必须为空 | 不生成产品非目标 | 退回 S1.2 |

补充规则：

- `identified` 但值为空属于非法 S1.2 数据，fail closed。
- `none` 不是“字段缺失”，而是用户明确确认没有额外非目标。产品定义必须保留这一状态及字段级来源证据，不能只留下无法审计的 `[]`。
- `constraints` 永远不能充当 `non_goals` 来源；“低成本”“仅保存本地数据”只能留在约束或产品范围角色。
- 该结构用于满足 PC-03“非目标齐全”：齐全可以是已识别条目，也可以是有确认来源的显式 `none`；`rejected/deferred/unresolved` 均不算齐全。
- S1.2 readiness 不能再只判断全局 `unresolved`：对 `non_goal_gaps`，只有 `identified/none` 满足进入 S1.3 的字段门禁。
- `none` 的字段级证据需要独立状态来源引用，例如绑定完整 Requirement Set item 及其 digest；现有只指向 `/values/0` 的事实引用不足以证明显式 `none`，不得用空数组替代该证据。

### 4.1 `clarification_gaps` 完成门禁

`clarification_gaps` 表示尚待澄清的问题，不是承载用户答案的产品事实字段：

| S1.2 状态 | 含义 | S1.3 门禁 |
|---|---|---|
| `none` | 用户确认当前没有未决澄清项 | 允许进入 |
| `identified` | 仍存在已识别的待澄清项 | 退回 S1.2，不得由 S1.3 消费 |
| `rejected` | 用户拒绝当前澄清处理结果 | 退回 S1.2 |
| `deferred` | 澄清被推迟，当前产品定义仍有未决事实 | 退回 S1.2 |
| `unresolved` | 尚未处理 | 退回 S1.2 |

## 5. “工作日早上提醒”上游裁决

- 结论：它是提醒触发时间与频率的业务约束，应归入 S1.2 `constraints`，不是 `clarification_gaps` 的最终值。
- 受影响的 expense-reminder S1.2 真源必须产生新版本：`constraints` 同时承接“仅保存本地数据”和“工作日早上提醒”，`clarification_gaps` 关闭为显式 `none`。
- community-workshop 的 `non_goal_gaps=rejected` 与 `clarification_gaps=deferred` 同样不满足新门禁，也必须回到 S1.2 形成新版本；必须由 fixture 的独立用户确认决定 `identified` 或 `none`，不得由 S1.3 补造。
- 不允许 S1.3 直接消费 `clarification_gaps`，也不扩大 activity、result、capability 的全局来源资格。
- S1.3 通过 scope 承接时间约束；journey 与 capability 继续绑定 goals/scenarios/expected_outputs，不为了复述时间约束而制造错误来源。
- 若现有 S1.2 构建规则无法把用户补充事实归入正确字段，应在新的上游修复任务中修正 S1.2 分类/版本链；不得在 S1.3 做兼容补丁。

## 6. 候选前累积硬门

以下检查前移到 S1.3 execution 的 `candidate-ready` 之前，任何一项失败都不得创建候选或启动 CV/I/X/P：

1. 三类 fixture 真实执行 S1.1 intake -> S1.2 补全/确认/冻结 -> JCS 恢复 -> S1.3 candidate 注入。
2. 每类 Frozen Requirement 的 ID、完整 canonical JSON 和 digest 必须连续，目标为 `3/3`。
3. 产品语义断言必须以独立 S1.2 回放产物为预期真源，覆盖 target users、non-goals 状态、scope、journey 和 capability；不得只验证同一 S1.3 fixture 内部自洽。
4. constraint 冒充 non-goal、`clarification_gaps` 被下游消费、跨项目对象互换、仅替换 digest 和同步篡改内嵌对象均 fail closed。
5. 只有累积硬门和 `pnpm check` 同时通过，才允许固定单父候选；之后才运行 CV、I/X/P、L3、最终复验和正式提升。

## 7. Product Definition 2.0 线格式

### 7.1 版本决策

- 产品定义候选从 `schema_version: "1.0"` 升级为 `schema_version: "2.0"`；新 Schema 位于 `schemas/v2/product-definition.schema.json`。
- `prd.non_goals` 从 `ProductFact[]` 变为下述专用状态对象，这是破坏性线格式变化，不在 `1.0` 下静默改变含义。
- Requirement Intake、Requirement Set、Frozen Requirement、交互/会签外围记录和 Machine Receipt 信封继续使用各自现有 `1.0`；本 CR 不把全局 `assertSupportedContractVersion` 放宽为所有对象都接受 `2.0`。
- 产品定义解析器使用产品专属版本判定，只接受 `2.0` 正例。旧 `1.0` 产品候选返回 `PRODUCT_DEFINITION_REJECTED`，不得自动迁移、双读、猜测或复用旧签名。

### 7.2 精确 JSON 结构

`prd.non_goals` 在 2.0 中固定为：

```json
{
  "status": "identified",
  "items": [
    {
      "kind": "direct",
      "value": "不替代财务审批",
      "source": {
        "pointer": "/requirement_set/items/5/values/0",
        "value_digest": "sha256:<value-jcs-digest>"
      }
    }
  ],
  "source": {
    "pointer": "/requirement_set/items/5",
    "item_digest": "sha256:<requirement-set-item-jcs-digest>"
  }
}
```

或：

```json
{
  "status": "none",
  "items": [],
  "source": {
    "pointer": "/requirement_set/items/5",
    "item_digest": "sha256:<requirement-set-item-jcs-digest>"
  }
}
```

精确约束：

- 根字段必须且只能是 `status`、`items`、`source`。
- `status` 只能是 `identified` 或 `none`；`rejected/deferred/unresolved` 不存在于合法 S1.3 candidate 中，因为它们已由 S1.2 readiness 阻断。
- `identified` 要求 `items` 至少一项；`none` 要求 `items` 精确为空。
- `source.pointer` 必须精确指向 Frozen Requirement 中 `field=non_goal_gaps` 的完整 Requirement Set item，不能指向 constraint，也不能指向任意 `/values/N`。
- `source.item_digest` 是该完整 item 的 RFC8785 SHA-256；因此 `none` 也保留可验证的字段、状态、空值和用户来源证据。
- `identified.items` 中每个事实仍按 direct/derived 规则绑定同一 `non_goal_gaps` item 下的值；`none` 不允许伪造占位事实。
- 新增独立 `ProductFieldStatusSourceRef` 类型，不复用只允许 `/values/N` 的 `ProductSourceRef`。

### 7.3 消费者迁移规则

- **Domain**：`ProductDefinitionCandidate` 升为 2.0；先验证字段级 source，再验证 identified items；旧 1.0 fail closed。
- **Schema**：保留 `schemas/v1/product-definition.schema.json` 作为历史格式证据，新运行时只加载 v2；新增 1.0 legacy rejection 和 2.0 条件结构正负例。
- **CLI**：stdin 只接受 canonical JCS 的 2.0 candidate。成功回执顶层 `schema_version: "1.0"` 继续表示 Machine Receipt 信封版本，`data.schema_version: "2.0"` 表示产品 subject 版本；不新增近义版本字段。
- **Machine Receipt**：`PRODUCT_DEFINITION_ACCEPTED` 的 data 精确字段仍为 `canonical_json`、`digest`、`product_definition`、`schema_version`，但该分支将 `data.schema_version` 的 const 从 `1.0` 升为 `2.0`；解析器必须验证 `data.schema_version === data.product_definition.schema_version === "2.0"`，并验证 canonical/digest/对象三者一致。失败码保持 `PRODUCT_DEFINITION_REJECTED`。旧产品 receipt 消费者会明确拒绝 2.0，其他 1.0 receipt 类型不变。
- **Skill**：S1.3 明确只生成和验证 Product Definition 2.0，说明 non-goals 状态对象、S1.2 readiness 前置和旧 1.0 拒绝边界。
- **Fixture**：三份有效 product-definition fixture 全部迁移到 2.0；project-delivery-tool 只做格式迁移，不改变已通过的产品语义。另保留至少一份 1.0 legacy fixture 作为拒绝负例。
- **签署与恢复**：所有 product definition digest、challenge、signed record、snapshot、credential 和 anchor 都从新 2.0 candidate 重建；不得复用 1.0 候选或旧 S1.2/S1.3 证据。
- **迁移方式**：不提供 1.0 -> 2.0 自动转换器。generation 4 必须从新正式 S1.2 Frozen Requirement 重新生成 2.0 candidate，确保用户确认、字段状态和摘要重新绑定。

## 8. Generation 4 执行顺序

用户批准 CR-005 后，执行顺序固定为：

```text
批准 CR-005
-> plan_generation 4，并墓碑失效 generation 3 中受影响的未闭合任务
-> S1.2 generation 4 attempt 1：readiness、字段归属、两类新 Requirement Set/Frozen Requirement
-> S1.2 CV + I/X/P + L3 + Final Verification + Credential + Audit Anchor + Anchor Proof
-> formal expected-old=F0 CAS promotion 到 S1.2 新锚 F12
-> 读取并固定 F12 为 S1.3 baseline
-> S1.3 generation 4 attempt 1：Product Definition 2.0 与三类 fixture
-> S1.3 候选前累积身份/产品语义硬门
-> S1.3 CV + I/X/P + L3 + Final Verification + Credential + Audit Anchor + Anchor Proof
-> formal expected-old=F12 CAS promotion 到 S1.3 新锚 F13
-> M1.1 attempt 2 累积验收
-> 用户会签
```

执行约束：

- generation 3 S1.3 attempt 3 永久不再作为入口。
- S1.2 新正式提升完成前，不得生成 S1.3 Execution Packet。
- S1.3 packet 的 `baseline_oid`、source refs 和 Frozen Requirement 必须来自 S1.2 新 formal；不得引用旧 formal `f3fdd265...` 中的 S1.2 产物作为新链输入。
- formal 只允许 `F0 -> F12 -> F13` 单向推进：S1.2 promotion 失败时停留在 `F0`；S1.2 promotion 成功后 `F12` 即成为新的正式状态，不得因后续 S1.3 失败而回退。
- S1.3 任一任务或门禁失败时停留在 `F12`，按 P4 恢复规则重试 S1.3；只有 S1.3 Anchor Proof 和 expected-old=`F12` CAS 全部通过才推进到 `F13`。任一 CAS 的 expected-old 不匹配均 fail closed。
- S1.2 与 S1.3 各自从 generation 4 attempt 1 开始，任务包、claim/fence、CV/I/X/P/L3/FV/Anchor 均使用新身份，旧结论只保留为历史证据。
- 任一阶段失败只按 P4 恢复规则在同代际提高对应 task attempt；若计划、基线或冻结范围再变，必须再次提高 `plan_generation`。

## 9. 修订后的最小实施范围

- S1.2 requirement-set/freeze 的字段级 readiness、状态来源证据与版本链校验，以及 community-workshop、expense-reminder 上游 fixture
- `schemas/v2/product-definition.schema.json`，并保留 v1 历史 Schema
- `src/domain/product-definition.ts`
- `src/domain/machine-receipt.ts`、`schemas/v1/machine-receipt.schema.json` 和产品定义 CLI
- `tests/domain/product-definition.test.ts`
- 三份 product-definition 2.0 正例 fixture 与至少一份 1.0 legacy 拒绝 fixture
- 必要的产品定义负例 fixture 与 Skill 契约回归
- `.codex` 留痕

project-delivery-tool 仅迁移 2.0 线格式，不改变产品语义。CLI 授权边界、正式提升机制和 M1.1 验收标准不变。S1.2 修改仅限字段级 readiness、状态来源证据、字段归属和两类受影响版本链；若需要改变七个 Requirement Field 的总体数据模型、产品定位或 PC-03 定义，应停止并建立新的上游变更，不得扩大本 CR。

## 10. 验收要求

- `non_goal_gaps` 五种状态按第 4 节逐项生效；只有 `identified` 和有字段级确认来源的 `none` 可进入 S1.3。
- `clarification_gaps` 只有显式 `none` 可进入 S1.3；其余四态均由 S1.2 阻断，S1.3 不消费其值。
- `none` 不退化为无来源裸空数组；constraint 冒充 non-goal 的正反例 fail closed。
- `community-workshop` 先重建 S1.2 非目标与澄清状态，再只承接社区新手、低成本创作工作坊、活动报名清单。
- `expense-reminder` 的“工作日早上提醒”在新 S1.2 版本中归入 constraints，`clarification_gaps=none`；S1.3 形成真实目标用户，并通过正确角色承接提醒工具、时间与本地数据约束。
- 产品语义回归独立绑定 S1.2 回放产物；同步篡改 S1.3 内嵌 Frozen Requirement 与产品定义不能通过。
- 保持跨阶段 Frozen Requirement ID、完整 JCS 内容和 digest `3/3` 连续；现有负例、来源摘要、状态机和会签规则不放宽。
- 累积回放在候选形成前通过；失败时不得产生 candidate-ready 或进入任何独立高成本门禁。
- Product Definition 2.0 精确结构、1.0 拒绝、Machine Receipt 信封/subject 版本区分、CLI、Skill 和三类 fixture 迁移均有正负例。
- S1.2 generation 4 完整正式提升先于 S1.3 packet；S1.3 的 baseline 和输入身份来自新 formal。
- 新候选完整重走 CV、I/X/P、L3、Final Verification、Credential、Audit Anchor、Anchor Proof、formal promotion 和 M1.1 attempt 2。

## 11. 风险与回滚

- 兼容风险：`non_goals` 从事实数组改为显式状态结构会改变产品定义 v1 契约；必须保留字段存在性、状态来源和缺项阻塞，不能以允许空值代替完整性。
- 上游风险：community-workshop 与 expense-reminder 都需要新 S1.2 版本和冻结身份，旧 promotion/credential 不得复用；S1.2 promotion 前 formal 保持 `F0`，成功后推进并停驻在 `F12`，不等待 S1.3 完成才更新。
- 来源风险：不得扩大 `clarification_gaps` 消费资格；任何 identified clarification gap 进入 S1.3 前必须先回到 S1.2 归类或解决。
- 回归风险：全局放宽 direct/derived 会削弱角色约束；变更必须按字段和角色最小化。
- 版本风险：Machine Receipt 信封仍为 1.0，产品 subject 为 2.0；顶层与 `data` 层级必须分别校验，禁止把 `data.schema_version` 误读为信封版本或把顶层版本误读为 subject 版本。
- 失败恢复：S1.2 promotion 前失败时 formal 保留 `F0`；S1.2 已 promotion 而 S1.3 失败时 formal 保留 `F12`，不得回退到 `F0`；S1.3 promotion 成功后 formal 为 `F13`。各阶段均保留 CR-004 的 M1.1 退回结论、attempt 2 blocked 证据、旧 Schema、结果和墓碑，不用 ref 回退代替恢复。

## 12. 用户决定

- CR-005 原方案已被用户明确退回，结论 `REVISE / 66`；S1.3 attempt 3 未获授权。
- 第一版修订经第二轮复审为 `REVISE / 75`；generation 3 attempt 3 继续不授权。
- 第二版修订经第三轮复审为 `REVISE / 92`；唯一 P1 为 formal 推进与失败恢复冲突，CR-005 和 generation 4 继续不授权。
- 第三版修订经第四轮独立复审为 `PASS / 98`，P0=0、P1=0、`required_fixes=[]`；当前文本具备提交用户批准条件。
- 用户于 2026-08-12 明确批准 CR-005 为“高风险基础变更 + 当前阶段缺口”，并授权按本 CR 推进 plan_generation 4。
- 授权范围：generation 4 管理面、S1.2 新链、Product Definition 2.0 的 S1.3 新链、两次 formal expected-old CAS、M1.1 attempt 2 及既有独立门禁；不得扩大到 S1.4、产品定位、主载体、技术栈或七字段总体模型变更。
- 当前只允许先推进 generation 4 并完成 S1.2 新链；S1.2 promotion 到 F12 前不得生成 S1.3 Execution Packet，M1.1 会签前不得启动 S1.4。

## 13. 关闭条件

- 用户批准 generation 4、Product Definition 2.0、逐态裁决、上游字段归属、候选前累积硬门和最小实施范围。
- S1.2 generation 4 新版本完成全部独立门禁、最终证据链，并以 expected-old=`F0` 将 formal 单向推进到 `F12`。
- S1.3 从 `F12` baseline 生成 2.0 candidate，候选前累积硬门通过，完成全部独立门禁、最终证据链，并以 expected-old=`F12` 将 formal 单向推进到 `F13`；失败时停留在 `F12`。
- M1.1 attempt 2 通过并完成用户会签。
