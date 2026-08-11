# S1.3 产品定义会签第 7 次尝试上下文

- 日期：2026-08-11
- 任务身份：`P5 / V1 / M1.1 / S1.3 generation 2 attempt 7`
- 执行任务包：`.codex/runtime/packets/ep-p5-v1-m1.1-s1.3-g2-a7-20260811.json`（只读）
- 任务包摘要：`sha256:ff216e6340036a02e00a4b70676b2237cb39bfe5dfc42b70c82f5df0df0c9e88`
- 工作父提交：`b0189d06c9a5597ec794a279b33570b00b64d4b9`
- 工作父的唯一父提交：`c9071e7af70de7365b15f65c0f73e4f13106c176`
- 正式基线与 `refs/nextstep/formal`：`a854fd4938b34ab24d88e72430be52b397c91096`
- 启动时 `refs/nextstep/control`：`563144c01aacdebdb6a5bc4b6b8a9102cc8faf4a`

## 路线与阶段

- 生命周期阶段：S5 开发落地。
- 当前里程碑：P5 / V1 / M1.1 / S1.3。
- 当前阶段出口：修复 L3 的四项 P1，形成单父候选提交，供后续独立 CV、I/X/P 和 L3 重新执行。
- 最小可验收闭环：产品定义候选以 Frozen Requirement 为唯一事实来源，旅程按 semantic source 独立完成，会签只能消费当前 confirmed 的模块私有 session。
- 明确非目标：不修改路线锁、计划、P3/P4/S4/产品/设计/架构真源、runtime/reviews、依赖、TypeScript 配置或 Git refs；不进入 S1.4/S1.5，不宣称 PC-03、M1.1、V1 或 P5 完成。

## 前置核验

- `HEAD` 精确为 working parent `b0189d06c9a5597ec794a279b33570b00b64d4b9`，启动时 tracked 工作树干净。
- `a854fd4938b34ab24d88e72430be52b397c91096` 存在、为 `HEAD` 祖先，formal ref 指向该 OID。
- packet 按 RFC8785 排除 `packet_digest` 和 `dedup_key` 后以 SHA-256 重算，结果精确匹配任务包摘要。
- 项目没有特化 `AGENTS.md`；已读取路线锁、活动计划、operations log、verification report、L3 scorecard、TDD/verification/security skills 和相邻实现。
- CodeGraph 命令可用但项目未初始化，且路线锁要求询问后才能初始化；本轮不写 `.codegraph/`，以 `rg`、领域模块和 Node 测试作替代影响分析。

## 相邻模式与最小设计

- `src/domain/requirement-confirmation.ts` 已验证 `current_state`、模块私有 `WeakMap` session record、单调 `evaluated_at` 和 `user-action/evaluate/view-change` reducer 模式；产品定义只复用该模式的必要边界。
- `src/domain/product-definition.ts` 当前按全局序列连接旅程状态，并将会签 session 直接绑定到单次 verified replay，无法阻断跨来源完成和旧确认复活。
- Schema、领域测试、Skill 测试和三份 fixture 是本轮可修改的消费者契约；fixture 仍仅证明 `manual-isolated consumer contract`，不证明真实宿主、真实用户动作或 `full` 支持。

## TDD 与验证计划

1. 先在领域/Skill 测试和 `l3-regressions.json` 中写入四项可执行反证，并运行 `pnpm test` 记录 RED。
2. 最小实现 semantic-source 分区状态机、完整 metric 链、产品定义 current-state reducer、direct role ledger、activity/result 摘要绑定和 S1.3 Skill guard。
3. 更新三份独立正例 fixture，运行 GREEN、`pnpm check`、官方 Skill validator、官方 registry audit、JSON、安全和范围反扫。
4. 所有门禁通过后才创建一个非 merge 中文候选提交；formal/control 不移动，也不 push。

## 本地结果

- RED：116 项中 112 项通过、4 项按预期失败，分别证明跨来源伪完成、direct 角色坍缩、缺少 current-state reducer 和 Skill 阶段入口冲突。
- 初始 GREEN：117/117 通过；`pnpm check` 覆盖率为行 90.91%、分支 82.04%、函数 98.20%。主管随后以动态反证发现事件 getter TOCTOU、可变 replay 和同一旧 display 新 confirm session 三条会签复活路径，先后形成 117/118 与 118/120 RED。
- 加固 GREEN：事件采用精确字段单次快照，verifier 深快照 replay，session 按 display 摘要唯一化；`pnpm check` 最终 120/120，覆盖率为行 90.84%、分支 82.21%、函数 98.25%。Skill 明确 replacement display 必须经 reducer。
- Plato 复核进一步发现 Proxy 快照重入 P1：旧状态读取早于事件快照，可由 trap 重入 reject/cancel 后被外层 confirm 覆盖。新增双路径永久回归先得到 120/121 RED；将 reducer 的当前状态读取移到事件快照之后，`pnpm test` GREEN 为 121/121。
- 第二轮复核确认外层 event Proxy 已关闭，但发现 `view-change.display` 嵌套 Proxy 可在状态读取后重入并复活终态。新增 confirmed session 的 reject/cancel 双路径回归先得到 121/122 RED；view-change display 改为状态读取前的严格 JSON 深快照后，`pnpm check` 以 122/122 GREEN，覆盖率为行 90.78%、分支 82.02%、函数 98.26%。
- 辅助门禁：官方 Skill validator 在 `/tmp` 临时 PyYAML 环境返回 `Skill is valid!`；官方 npm registry audit 无已知漏洞；60 份适用 JSON 可解析，既有故意空 JSON 负例由拒绝测试覆盖。
- 不变性：12 个改动路径均在 packet allowlist；路线/计划、上游真源、runtime/reviews、依赖配置和 formal/control ref 保持不变。
- 状态：外层 event 与嵌套 display 两类 Proxy 重入修复均已通过本地 TDD，Godel/Sol 独立复核 `PASS / P0=0 / P1=0`。尚未 amend 单父候选、生成 Execution Result、执行独立 CV/I/X/P/L3 或正式提升；不构成 PC-03、M1.1、V1、P5 或正式提升结论。
