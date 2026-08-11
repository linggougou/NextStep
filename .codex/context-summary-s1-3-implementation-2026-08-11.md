# S1.3 产品定义会签运行候选实施上下文

- 日期：2026-08-11
- 任务身份：`P5 / V1 / M1.1 / S1.3 generation 2 attempt 3`
- 执行任务包：`.codex/runtime/packets/ep-p5-v1-m1.1-s1.3-g2-a3-20260811.json`（只读）
- 任务包摘要：`sha256:5d42a7e22d4347ec55a815a385e139ea5c454c35bd18580d0cc3faba4a89345b`
- Fence：`25`
- 工作父提交：`e2630439720344175a9e690afea37747545c03b2`
- 正式基线：`a854fd4938b34ab24d88e72430be52b397c91096`

## 路线与阶段

- 当前路线：`PROJECT_ROUTE_LOCK.md` 定义的 NextStep Skill 主载体路线。
- 生命周期阶段：S5 开发落地。
- 当前里程碑：P5 / V1 / M1.1 / S1.3。
- 当前阶段出口：实现产品定义会签运行切片的候选提交，供后续独立候选验证与 I/X/P 使用。
- 最小可验收闭环：验证宿主 AI 的 PRD、用户旅程和能力映射候选只引用不可变 Frozen Requirement，并仅由可信独立用户动作形成可恢复会签记录。

## 实施边界

- 允许范围以 attempt 3 任务包 `allowed_paths` 为准；本轮只修改其中的必要子集。
- `PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md` 和 P5 活动计划不在 attempt 3 allowlist 内，管理面更新由主管负责。
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

1. 先新增永久 RED 测试，覆盖缺失模块、必填完整性、来源篡改和伪造会签。
2. 记录实际 RED 结果后，最小实现领域验证、CLI、Schema、fixture 和 Skill 入口。
3. 执行完整测试、覆盖率、Skill/JSON、allowlist、上游、refs/runtime 不变性、安全与差异检查。
4. 仅在所有本地验证通过后创建单个非 merge 候选提交，并返回 `candidate-ready` 或任务包允许的失败状态。

## 任务包有效性

- attempt 1 已 tombstone：其 `PROJECT_ROUTE_LOCK.md` 与 P5 活动计划 source ref 错误标记为 formal OID；本轮不得使用。
- attempt 2 已 tombstone：其 allowlist 包含过宽的管理面写权限；本轮不得使用。
- attempt 3 的上述两份 source ref 绑定 working parent `e2630439720344175a9e690afea37747545c03b2`，执行权限收窄到实现、测试、Skill 与任务留痕。

## 本地验证结果

- RED：在新增永久领域测试后运行 `pnpm test`，如预期因缺少 `src/domain/product-definition.ts` 报 `TS2307`；该失败已记录于操作日志。
- GREEN：最小实现完成后，`pnpm test` 通过 `107/107`；`pnpm check` 通过，覆盖率为行 `90.67%`、分支 `82.63%`、函数 `98.03%`。
- 任务包摘要按 RFC8785 双字段投影复算匹配；working parent 的路线锁与 P5 活动计划原始 SHA-256 均匹配 attempt 3 source refs。
- 新增/修改路径是 attempt 3 allowlist 子集；工作树的 runtime、管理面文件、formal/control refs 均未由本轮修改。
- 官方 npm registry 高危审计无已知漏洞。系统 Python 缺少 PyYAML，已使用隔离临时环境运行官方 Skill `quick_validate.py`，结果为 `Skill is valid!`。
