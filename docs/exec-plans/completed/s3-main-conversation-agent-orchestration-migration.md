# S3 主对话 Agent 编排契约迁移实施计划

状态：已完成，迁移复审与四份材料会签均通过

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已通过独立复审的主对话 Agent 编排设计小步迁移到 007、008、009、S3 正文和阶段入口，同时保持四份材料待会签及 S4 门禁关闭。

**Architecture:** 采用“007 定义产品交互边界、008 定义独立验收门禁、S3 正文定义唯一交互协议、009 定义宿主能力与 S4 技术输入”的单向分层。实施使用单写入 Agent 串行修改，主任务校验当前工作区基线后集成，独立只读 Agent 对最终迁移包复审。

**Tech Stack:** Markdown 真源、Git 工作区基线、Shell 断言、`git diff --check`。

---

## 1. 当前边界

- 生命周期阶段：`S3 Skill 交互真源`。
- 变更入口：`docs/change-requests/002-main-conversation-agent-orchestration.md`；迁移开始基线状态为“独立复审通过，待迁移”，当前状态以 CR 正文为准。
- 设计依据：`docs/design-docs/s3-main-conversation-agent-orchestration-design.md`，第三次独立 L2 复审为 `PASS / 96`。
- 阶段出口保持不变：007、008、009、S3 正文分别由用户会签后，才能进入 S4。
- 本轮非目标：不实现 Agent 编排，不冻结具体 API/MCP/schema，不进入 S4，不替用户会签，不提交、不推送。
- 工作区保护：目标文件及其他项目文件包含未提交用户改动；不得回滚、覆盖或格式化无关内容。

## 2. 文件职责与迁移映射

| 文件 | 唯一职责 | 本轮迁移内容 |
|---|---|---|
| `docs/product-specs/007-s3-skill-interaction-contract.md` | S3 产品交互格式契约 | 主对话唯一沟通入口、三层职责、默认安静、上下文防火墙、计划内自动分派和例外决策边界 |
| `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md` | 下游验收契约 | 候选验证、产品/交互评估、独立审查、精确最终集成复验、审计锚与正式提升前置门禁 |
| `docs/design-docs/s3-skill-interaction-source.md` | 唯一交互协议真源 | 扁平调度流程、最小任务包、结果信封、控制信封、代际/去重/恢复、主对话摘要、归档与异常状态 |
| `docs/architecture/009-s4-technical-input-supplement.md` | S4 技术输入契约 | 两阶段 capability preflight、三态结论、核心运行时对象、不可变候选/凭证/审计锚/CAS 的技术必答项与风险验证 |
| `docs/exec-plans/active/s3-skill-interaction-source.md` | S3 里程碑执行真源 | 增加 CR 002 迁移范围、迁移后复审门禁和验证清单 |
| `PROJECT_ROUTE_LOCK.md` | 路线与阶段门禁 | 将编排设计纳入 S3 交付/DoD，保留“不实现编排”和 S4 关闭边界 |
| `docs/PLANS.md` | 当前计划入口 | 链接本迁移计划并说明迁移包复审、四份分别会签的先后门禁 |
| `docs/change-requests/002-main-conversation-agent-orchestration.md` | 变更治理记录 | 迁移复审通过后更新为“迁移复审通过，待四份材料会签”，不标记正式材料已会签 |
| `docs/change-requests/index.md` | CR 索引 | 同步 CR 002 当前状态 |

## 3. 基线与写入规则

以下 SHA-256 是开始迁移时的当前工作区基线；写入前后均需核对，任何意外变化都进入冲突处理：

| 文件 | 开始基线 SHA-256 |
|---|---|
| `PROJECT_ROUTE_LOCK.md` | `d9d1ec93fa966d2a664c01c40b1360e454bdcdfd7650eb7711a7840261fc9631` |
| `docs/PLANS.md` | `06875dbfb95b23fc22e2f2e3c6cfb2f699a6abd282a32882dfe8483268bdf543` |
| `docs/product-specs/007-s3-skill-interaction-contract.md` | `c461078022314299a9363c48f4826111a825c0fc36fdd2a88a9603e0ed94caf4` |
| `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md` | `d24cf4d259c0ff67a96fa94ace8d1c12cfd6813a97c40defb26d988c1f45ee99` |
| `docs/architecture/009-s4-technical-input-supplement.md` | `2ffb9e6579d54e0130f45e8d6d2a2610367a6013775477c706ed70d787e285e2` |
| `docs/design-docs/s3-skill-interaction-source.md` | `9761ef6a23b974ab5e9c2d2bd17195d7f07a4c5eddf11a5c2a260a2b87823700` |
| `docs/exec-plans/active/s3-skill-interaction-source.md` | `51dafb2a541d81e5f012851ca992ce49f832b1727cc6009cb58d9096cac24037` |
| `docs/change-requests/002-main-conversation-agent-orchestration.md` | `e3417921e96a0ab11e3c2b2e44641076556107bccf5238b0732b82cfe4403343` |

- 同一事实只在一份真源完整定义，其他文件使用约束级摘要和引用。
- 显式上游继续保持 `007 -> 008 -> S3 -> 009`，不得形成 S3 对 009 的上游反向引用。
- 原设计稿仅作为已迁移的历史设计来源与复审证据保留，不得继续自称当前设计真源；当前唯一详细交互协议由 S3 正文承载。
- 任何文件写入失败都不得更新 CR 为“已迁移”，也不得恢复会签建议。

## 4. 实施任务

### Task 1: 迁移产品与验收契约

**Files:**

- Modify: `docs/product-specs/007-s3-skill-interaction-contract.md`
- Modify: `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`

- [x] 在 007 必填字段中加入主对话唯一入口、三层职责、上下文隔离、分派/例外边界、最小摘要和恢复边界。
- [x] 在 007 会签标准中明确目标是保护语义稳定性和用户心流，不以节省 Token 为验收目标。
- [x] 在 008 增加候选验证、产品评估、审查、精确最终复验与正式提升五类独立结论。
- [x] 明确最终集成内容变化后旧结论失效，集成 Agent 不得自我批准。
- [x] 保持两份文件状态为 `待会签`。

### Task 2: 迁移唯一交互协议真源

**Files:**

- Modify: `docs/design-docs/s3-skill-interaction-source.md`

- [x] 扩充交互定位和主流程，写入逻辑三层、物理扁平、独立任务隔离和项目真源通信。
- [x] 定义最小任务包、结果信封、`dispatch-ready` / `dispatch-ack`、单调代际、去重、墓碑和恢复规则。
- [x] 明确所有执行与验收结果绑定代际、任务尝试、派发消息、任务包与候选/最终摘要。
- [x] 定义低代际 `stale-result`、同代际 `identity-conflict` 和最终 CAS 失败的阻塞行为。
- [x] 定义主对话默认安静、按需展开、自动归档及只有阻塞/决策例外上报。
- [x] 保留既有项目解析、事务式写入、用户会签和 Web/UI 候选分支规则。

### Task 3: 迁移 S4 技术输入

**Files:**

- Modify: `docs/architecture/009-s4-technical-input-supplement.md`

- [x] 加入 `host-bootstrap` 与 `project-probe` 两阶段 capability preflight。
- [x] 将结论限定为 `full`、`manual-isolated`、`blocked`，禁止同任务串行静默冒充严格隔离。
- [x] 扩充核心对象和系统能力，覆盖任务台账、控制信封、代际快照、不可变候选、项目外凭证、项目根审计锚和正式引用 CAS。
- [x] 增加消息乱序、迟到结果、验证污染、审计锚越界、CAS 竞争和归档失败的风险验证。
- [x] 保持 008 和 S3 正文为强制上游，保持本文待会签。

### Task 4: 同步阶段入口与变更状态

**Files:**

- Modify: `docs/exec-plans/active/s3-skill-interaction-source.md`
- Modify: `PROJECT_ROUTE_LOCK.md`
- Modify: `docs/PLANS.md`
- Modify: `docs/change-requests/002-main-conversation-agent-orchestration.md`
- Modify: `docs/change-requests/index.md`

- [x] 把主对话编排与上下文隔离纳入 S3 交付物、DoD 和验证方式。
- [x] 将 CR 002 状态更新为“已迁移，待迁移包复审”。
- [x] 保持四份正式材料 `待会签`，迁移包复审通过前仍暂停会签建议。
- [x] 保持 S4 为未开始，不改变四份材料分别会签的阶段出口。

### Task 5: 验证与独立复审

**Files:**

- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`
- Create: `.codex/reviews/s3-main-conversation-agent-orchestration-migration-2026-07-13/verdict.md`
- Create: `.codex/reviews/s3-main-conversation-agent-orchestration-migration-2026-07-13/scorecard.json`

- [x] 检查设计字段在 007、008、009、S3 正文中的唯一归属和覆盖率。
- [x] 扫描状态、四会签门禁、S4 禁入、旧措辞和占位符。
- [x] 检查显式上游图无循环。
- [x] 扫描“真源”“详细协议”“待迁移”引用，确认原设计稿仅为历史证据，当前详细交互协议只指向 S3 正文。
- [x] 运行 `git diff --check`。
- [x] 由独立只读审查 Agent 给出 `PASS / REVISE / REJECT` 与 0-100 评分。
- [x] 只有迁移包 `PASS` 且无 P0/P1 时，才把 CR 002 更新为“迁移复审通过，待四份材料会签”。
- [x] 更新 `.codex` 结束留痕；不创建提交或推送。

## 5. 回滚与失败判定

- 基线变化：停止对应文件写入，重新读取并重做迁移补丁，不覆盖新改动。
- 部分迁移：保持 CR 002 为“迁移中”或“待修订”，四份材料继续暂停会签。
- 迁移复审发现 P0/P1：只修复本 CR 范围内的迁移增量并重新复审；不得进入 S4。
- 无法安全识别本轮差异：停止自动回退，保留证据并请求用户处理。
- 迁移通过但未会签时：正式材料仍是候选真源，S4 保持关闭。该条件已于 2026-07-13 解除，用户已按 `007 -> 008 -> S3 -> 009` 完成四份材料会签。
