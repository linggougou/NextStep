# S1.3 产品定义会签运行候选实施上下文

- 日期：2026-08-11
- 任务身份：`P5 / V1 / M1.1 / S1.3 generation 2 attempt 5`
- 执行任务包：`.codex/runtime/packets/ep-p5-v1-m1.1-s1.3-g2-a5-20260811.json`（只读）
- 任务包摘要：`sha256:26bc296bd038d4e52ed797348d85a11d551cf955d8b6087ef82374695ef8b5ee`
- 去重键：`sha256:e057c764fa4a3687574eadbb45e4f4b81acdd675bec637c0bc0e64dfcbad11a1`
- Dispatch：`msg-dispatch-ready-s1.3-g2-a5-20260811`
- Claim：`claim-s1.3-g2-a5-f30-20260811`
- Fence：`30`
- 工作父提交：`4ddd3aff6c230fd4b99a9890110686caecd02296`
- 正式基线：`a854fd4938b34ab24d88e72430be52b397c91096`

## 路线与阶段

- 当前路线：`PROJECT_ROUTE_LOCK.md` 定义的 NextStep Skill 主载体路线。
- 生命周期阶段：S5 开发落地。
- 当前里程碑：P5 / V1 / M1.1 / S1.3。
- 当前阶段出口：实现产品定义会签运行切片的候选提交，供后续独立候选验证与 I/X/P 使用。
- 最小可验收闭环：验证宿主 AI 的 PRD、用户旅程和能力映射候选只引用不可变 Frozen Requirement，并仅由可信独立用户动作形成可恢复会签记录。

## 实施边界

- 允许范围以 attempt 5 任务包 `allowed_paths` 为准；本轮只修改其中的必要子集。
- `PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md` 和 P5 活动计划不在 attempt 4 allowlist 内，管理面更新由主管负责。
- `.codex/runtime/**`、`.codex/reviews/**`、Git refs、registry、checkpoint 仅主 Agent 写入，本轮只读。
- 不实现 S1.4 载体裁决、Acceptance Profile、原型流程或 Web/UI 分支。
- 不实现 S1.5 正式真源写入、一致性提升、真实宿主适配器、真实用户动作探针或 full 支持。
- 不得从 `002/003/004` 复制或补造目标项目事实；这些文档仅提供结构期望。
- 不作 PC-03、M1.1、V1 或 P5 的门禁结论。

## 已核验上下文

- 相邻模式：`requirement-freeze.ts` 提供冻结需求的恢复和完整性验证；`requirement-confirmation.ts` 提供可信确认挑战与进程内 capability 模式；`machine-receipt.ts` 提供严格回执与 JCS 摘要模式。
- 测试模式：Node 原生 `node:test`、AJV 严格 Schema、fixture 驱动 CLI/Skill 验证，`pnpm check` 强制 TypeScript、全量测试和 80% 覆盖率。
- 安全风险：调用方可构造的 JSON、stdin、环境变量、普通文本、裸布尔值和机器回执均不能成为会签信号；所有内容和错误输出必须经过敏感字段控制。
- 工具适配：已读取 `tdd-workflow`、`verification-loop`、`security-review`。本任务按 TDD 执行；项目无需额外 Web/E2E 工具。

## 执行顺序

1. 先新增永久 RED 测试和磁盘负例，覆盖指标仅证明无关计划记录、旅程缺少动作/状态变化/结果。
2. 记录实际 RED 结果后，最小实现可审计的目标/期望输出指标链和有序旅程步骤，并回放三份正例及两份负例。
3. 执行完整测试、覆盖率、Skill/JSON、allowlist、上游、refs/runtime 不变性、安全与差异检查。
4. 仅在所有本地验证通过后创建单个非 merge 候选提交，并返回 `candidate-ready` 或任务包允许的失败状态。

## 任务包有效性

- attempt 1 已 tombstone：其 `PROJECT_ROUTE_LOCK.md` 与 P5 活动计划 source ref 错误标记为 formal OID；本轮不得使用。
- attempt 2 已 tombstone：其 allowlist 包含过宽的管理面写权限；本轮不得使用。
- attempt 3 已 tombstone：I/X/P 的 X/P 发现通用 exact-copy 事实可占用错误语义字段，且三份 fixture 复用同一候选。
- attempt 4 已因产品验收发现“指标证明无关计划记录”和“旅程仅复述参与者/场景”而退回；其 CV 通过不构成 attempt 5 的质量结论。

## Attempt 5 验证目标

- 每个成功指标的 metric、target、evidence_method 都必须以 direct/derived 事实保留来源，并通过同一个 goals/expected_outputs 来源锚形成可审计链；无关计划记录不能充当完成证据。
- 每个用户旅程步骤必须有序，包含 actor、action、state_change、outcome，并分别绑定 scenarios、goals 或 expected_outputs 的合法来源。
- 三份磁盘正例分别体现 community workshop、expense reminder 和 project delivery 的目标一致指标及最小旅程；两份磁盘负例均由测试实际回放。
- 保留 a4 的稳定 ID、字段角色、direct/derived、会签、恢复、CLI/回执、敏感内容和 `manual-isolated consumer contract` 边界。

## Attempt 5 启动核验

- 启动前 HEAD 与指定 working parent 均为 `4ddd3aff6c230fd4b99a9890110686caecd02296`，tracked 工作树干净，正式基线为其祖先。
- a5 packet digest 以排除 `packet_digest` 与 `dedup_key` 的 RFC 8785 投影复算匹配；任务包中的 dedup key 为上述固定值。
- RED、GREEN 和完整验证结果将在本轮操作与验证留痕中追加。
