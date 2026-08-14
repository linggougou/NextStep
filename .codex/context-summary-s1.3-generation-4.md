# S1.3 Generation 4 上下文摘要

## 当前阶段

- 生命周期：S5 开发落地。
- 当前里程碑：P5 / V1（M1.1 已完成；S1.4 入口仅允许独立评估，尚未启动）。
- 正式基线：formal F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`；main 基线为 `9263c2fa6f1de05aced69ee52f96fae489ffe22e`。
- 当前产品候选：`0dc22758a9138f7d69ad812d7617eda709d0c392`，在 Product Definition 2.0 基础上补齐历史恢复后的当前 readiness 与 non-goals source-state 强绑定。
- 当前公开控制：`04677ae041443ba9bca740bb70b814b5347d6b26`，由旧 control `380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad` 单父 CAS 推进；`plan_generation=4`，`pending_dispatch_messages=[]`（pending=0）；Result digest=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`。S1.3 generation 4 已正式提升到 F13。
- 里程碑真源：`PROJECT_ROUTE_LOCK.md`、P3 完成计划、P5 活动计划、CR-005。

## 本轮目标

实现 Product Definition 2.0，并在候选形成前真实回放三类 S1.1 -> S1.2 -> S1.3 链路，证明 Frozen Requirement ID、完整 canonical JSON、digest 与产品语义连续率均为 3/3。

## 最小可验收闭环

1. 从 F12 生成并持久化 S1.3 generation 4 Execution Packet、dispatch-ready 和确认状态。
2. 以 TDD 实现 Product Definition 2.0、Machine Receipt/CLI 迁移、三类 fixture 与 Skill 消费契约。
3. 在 candidate-ready 前运行三类累计硬门和 `pnpm check`。
4. 固定单父候选；之后才允许运行 CV、I/X/P、L3 和最终证据链。

## 并行边界

| Worktree | Agent | 独占写入范围 | 输出 |
|---|---|---|---|
| domain-schema | Claude Code | `src/domain/product-definition.ts`、`schemas/v2/product-definition.schema.json`、独立 v2 domain 测试 | 2.0 类型、Schema、字段级来源和旧 1.0 拒绝 |
| receipt-cli | OpenCode | `src/domain/machine-receipt.ts`、`schemas/v1/machine-receipt.schema.json`、`src/cli/product-definition.ts`、对应独立测试 | 信封 1.0 / subject 2.0 严格绑定 |
| fixtures-skill | Claude Code | `tests/fixtures/product-definition/**`、`skills/nextstep/SKILL.md`、`tests/skill/product-definition-skill.test.ts` | 三类 2.0 正例、1.0 legacy 负例与 Skill 契约 |
| cumulative | OpenCode | `tests/domain/product-definition.test.ts` | 独立绑定 F12 S1.2 回放产物的累计硬门与攻击负例 |

共享文件不允许并行写入。主控负责 packet/control、合并冲突、必要的测试适配、完整回归和 `.codex` 收口。

## 验收条件

- `prd.non_goals` 只接受 `identified` 或 `none` 状态对象；`none` 保留完整 Requirement Set item 摘要。
- constraint 不得冒充 non-goal，S1.3 不消费 `clarification_gaps`。
- Product Definition 1.0 明确拒绝；不提供自动迁移或双读。
- Machine Receipt 顶层 `schema_version=1.0`，产品 data 和对象版本均为 `2.0`。
- community-workshop、expense-reminder、project-delivery-tool 三类真实累计链身份与语义均通过，且同步篡改失败。
- `pnpm check` 通过，覆盖率行、分支、函数均不低于 80%。
- changed paths 在 packet allowlist 内，formal 已按完整证据链提升到 F13，S1.4 不启动。

## 明确非目标与失败恢复

- 不改变七个 Requirement Field 总体模型、产品定位、主载体、技术栈、P3/P4 门禁或 M1.1 验收标准。
- 不复用 generation 3 的候选、签名、Credential、Anchor 或门禁结论。
- 不启动 S1.4，不 push。
- 任一实施或门禁失败时 formal 停留 F12；先按 P4 在 generation 4 提高对应 attempt，不回退 formal。

## 工具替代

用户最初要求使用第三方 Claude Code 或 OpenCode；后续明确改为所有正式子 Agent 使用 `gpt-5.6-luna / xhigh`。正式 CV、I/X/P 与 L3 均按新要求执行并在完成后回收。

2026-08-14 状态同步：M1.1 attempt 2 `PASS / 97` 用户会签已通过 control CAS 固化，M1.1 formally-completed；CR-004/CR-005 已关闭，历史内容与证据保留。Final Snapshot、Final Verification、Credential、Audit Anchor、Anchor Proof 与 F12→F13 CAS 已完成；V1、P5 尚未完成。S1.4 未启动且本次会签未授权启动，下一步仅允许独立评估 S1.4 入口。Orca 编排 CLI 缺失及第三方异常仍仅作历史诊断。
