# P4 执行机制设计执行计划

状态：已完成；L3 规划审查 `PASS / 95`、P4 -> P5 上游可用性独立审查 `PASS / 94`，用户于 2026-07-28 会签通过
记录日期：2026-07-27
完成日期：2026-07-28

## 1. 阶段目标

基于已会签 P3 版本与里程碑计划、S4 技术架构和交互/验收真源，把执行任务包、派发确认、独立执行、候选验证、集成、最终复验、正式提升、验收、恢复和变更分流设计成可实现、可拒绝、可恢复、可审计的统一机制，作为 P5 产品落地的直接设计上游。

## 2. 当前阶段

- 生命周期阶段：P4 执行机制设计。
- 里程碑编号：P4。
- 阶段名称：执行机制设计。

## 3. 上游真源

- `docs/exec-plans/completed/p3-version-and-milestone-breakdown.md`
- `docs/architecture/s4-technical-architecture.md`
- `docs/architecture/009-s4-technical-input-supplement.md`
- `docs/design-docs/s3-skill-interaction-source.md`
- `docs/product-specs/007-s3-skill-interaction-contract.md`
- `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`
- `docs/product-specs/005-stage-document-contracts.md`
- `PROJECT_ROUTE_LOCK.md`

## 4. 可验收交付物

- `docs/design-docs/p4-execution-mechanism-design.md`
- 本活动计划。
- `PROJECT_ROUTE_LOCK.md`
- `docs/PLANS.md`
- `.codex/operations-log.md`
- `.codex/verification-report.md`
- `.codex/reviews/p4-execution-mechanism-design-2026-07-27/`

## 5. Definition of Done

- P4 设计完整承接 P3 的 PC-09..PC-20、TG 风险和 Final Acceptance，不把现有人工计划误报为产品能力。
- 明确主对话、集成、执行、验证、评估、审查、最终复验和锚验证职责，禁止自我批准。
- `Execution Packet`、控制信封、结果信封和任务台账有字段级语义、身份、基线、代际、幂等和过期规则。
- `full / manual-isolated / blocked` 宿主模式有可执行的分派和拒绝边界。
- 候选验证、产品与交互评估、独立审查、精确最终复验、正式提升五类结论相互独立。
- `Immutable Candidate`、`Final Content Snapshot`、`Verification Credential`、`Audit Anchor`、`Anchor Proof` 和正式引用 CAS 形成闭环。
- 正式提升前后允许修改的内容、白名单、失败状态和重试规则明确。
- Acceptance Profile 由目标项目已接受路线决定；NextStep 自身始终按 headless 的 I/X/P 验收。
- 阻塞、失败、迟到结果、代际推进、控制确认丢失、CAS 竞争和宿主归档失败均有恢复入口。
- Change Intake 能把当前阶段缺口、增强项、高风险变更、后续需求、候选和拒绝分流到唯一入口。
- 设计包含可重复验证场景、正反例、失败判定和证据要求，但不生成真实代码、Schema 文件或执行任务包。
- 候选通过有效 L3 独立规划审查并由用户会签。

## 6. 明确非目标

- 不编写产品实现代码、测试代码、脚本或可执行 Schema。
- 不生成或派发真实执行任务包，不修改任何目标项目。
- 不运行 P3 中的 S1.1..S4.3 小里程碑，不进入 V1 实施。
- 不进入 P5 产品落地，不创建 P5 活动计划。
- 不改变已会签 S4 架构、技术栈、正式引用或证据存储边界；需要改变时先进入 Change Request。
- 不恢复 Web/UI 候选分支，不建设 NextStep Web 界面。
- 不建设 Project Provenance Store、长期 Agent 贡献归因或按 Agent 贡献回退能力。
- 不把宿主能力假设、人工计划样例或文档存在性包装成运行能力已验证。

## 7. 最小可验收闭环

形成一份能从“已会签小里程碑”推导到“可拒绝的逻辑任务包”，并继续覆盖派发、候选、五类独立结论、最终快照、凭证、锚验证、CAS、验收和恢复的 P4 设计候选；通过结构、语义、范围和状态断言后提交独立规划审查与用户会签。

## 8. 设计顺序

1. 冻结上游对象复用表和不可偏离约束。
2. 定义端到端执行流程和职责分离。
3. 定义任务包、控制信封、结果信封和任务台账逻辑契约。
4. 定义候选生成、验证、评估、审查和集成机制。
5. 定义最终快照、项目外凭证、审计锚、锚验证和 CAS 正式提升。
6. 定义 Acceptance Profile、验收报告、Final Acceptance 和宿主归档边界。
7. 定义阻塞、失败、恢复、代际推进和 Change Intake。
8. 建立 P3 PC/TG/S4 风险承接矩阵和验证场景。
9. 运行专项断言、格式检查和有效 L3 独立规划审查。
10. 独立审查通过后提交用户会签；用户会签前不归档、不进入 P5。

## 9. 验证方式

- 字段断言：逐项检查对象、状态、职责、验收、恢复和变更入口。
- 反向断言：从 P3 PC-09..PC-20、TG-02/04/05/07/12/13/14/16/17/18/19 和 S4 高风险项反查承接位置。
- 负向扫描：检查真实代码、可执行 Schema、真实任务包、P5、Web/UI 恢复和 Project Provenance Store 偷跑。
- 状态同步：检查路线锁、PLANS、活动计划、设计候选和 `.codex` 留痕一致。
- 运行 `git diff --check` 及文件级空白检查。
- 按 `judge-harness` L3 契约生成独立审查评分卡和 verdict。

## 10. 阶段出口

阶段出口已于 2026-07-28 通过：用户确认 P4 设计可以作为 P5 产品落地中实现执行任务包、隔离执行、验证、集成、验收、正式提升、恢复和变更治理的正式设计真源。活动计划归档到 `docs/exec-plans/completed/p4-execution-mechanism-design.md`；P5 尚未启动。

## 11. 变更入口

- 发现上游遗漏但不改变已会签范围时，记录为 P4 当前阶段缺口并补齐候选。
- 需要改变产品定位、主流程、S3 交互、S4 架构、P3 版本范围或验收门禁时，必须先进入 `docs/change-requests/`。
- P5 实施建议不得直接写入 P4 正文；只保留可验证的设计约束和实现入口。
