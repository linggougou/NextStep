# S1.3 产品定义会签运行候选实施上下文

- 日期：2026-08-11
- 任务身份：`P5 / V1 / M1.1 / S1.3 generation 2 attempt 6`
- 执行任务包：`.codex/runtime/packets/ep-p5-v1-m1.1-s1.3-g2-a6-20260811.json`（只读）
- 任务包摘要：`sha256:397afc29e726c96d1b133b26116cd9adefb0ebbe0d6324a4780b402bc1503d9b`
- 去重键：`sha256:94eeeed96244891ac36e67d03d44263b1118357f6955fc47ec37d4b0e73ed9f6`
- Dispatch：`msg-dispatch-ready-s1.3-g2-a6-20260811`
- Claim：`claim-s1.3-g2-a6-f32-20260811`
- Fence：`32`
- 工作父提交：`c728816881aa403e6a980ba15b1bdbad75774006`
- 正式基线：`a854fd4938b34ab24d88e72430be52b397c91096`

## 路线与阶段

- 当前路线：`PROJECT_ROUTE_LOCK.md` 定义的 NextStep Skill 主载体路线。
- 生命周期阶段：S5 开发落地。
- 当前里程碑：P5 / V1 / M1.1 / S1.3。
- 当前阶段出口：实现产品定义会签运行切片的候选提交，供后续独立候选验证与 I/X/P 使用。
- 最小可验收闭环：验证宿主 AI 的 PRD、用户旅程和能力映射候选只引用不可变 Frozen Requirement，并仅由可信独立用户动作形成可恢复会签记录。

## 实施边界

- 允许范围以 attempt 6 任务包 `allowed_paths` 为准；本轮只修改其中的必要子集。
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

1. 先新增永久 RED 测试和磁盘负例，覆盖 direct goal 三重复用、带目标词的无关 evidence、no-op action、任意状态和无用 outcome。
2. 记录实际 RED 结果后，以受控 measurement/target/evidence、受控动作和状态机、完成转换摘要交叉引用取代开放文本判断，并回放三份正例及两份负例。
3. 执行完整测试、覆盖率、Skill/JSON、allowlist、上游、refs/runtime 不变性、安全与差异检查。
4. 仅在所有本地验证通过后创建单个非 merge 候选提交，并返回 `candidate-ready` 或任务包允许的失败状态。

## 任务包有效性

- attempt 1 已 tombstone：其 `PROJECT_ROUTE_LOCK.md` 与 P5 活动计划 source ref 错误标记为 formal OID；本轮不得使用。
- attempt 2 已 tombstone：其 allowlist 包含过宽的管理面写权限；本轮不得使用。
- attempt 3 已 tombstone：I/X/P 的 X/P 发现通用 exact-copy 事实可占用错误语义字段，且三份 fixture 复用同一候选。
- attempt 4 已因产品验收发现“指标证明无关计划记录”和“旅程仅复述参与者/场景”而退回；其 CV 通过不构成 attempt 5 的质量结论。

## Attempt 6 验证目标

- 成功指标必须使用受控 measurement/target/evidence，其中 target 锚定合法目标或期望输出，evidence 以序号和摘要绑定同一产品定义内的 completed 旅程转换。
- 旅程必须使用受控动作与状态机，只允许 `not-started -> in-progress -> completed` 的连续推进，且 outcome 与 `to` 状态相等。
- 三份磁盘正例分别体现 community workshop、expense reminder 和 project delivery 的独立身份、两步合法状态推进和目标一致完成证据；两份磁盘负例实际覆盖 CV 绕过。
- 保留 a5 的稳定 ID、字段角色、direct/derived、会签、恢复、CLI/回执、敏感内容和 `manual-isolated consumer contract` 边界。

## Attempt 6 启动核验

- 启动前 HEAD 与指定 working parent 均为 `c728816881aa403e6a980ba15b1bdbad75774006`，tracked 工作树干净，正式基线为其祖先。
- a6 packet digest 以排除 `packet_digest` 与 `dedup_key` 的 RFC 8785 投影复算匹配；任务包与 dispatch-ready 的 dedup key 均为上述固定值。
- RED、GREEN 和完整验证结果将在本轮操作与验证留痕中追加。
