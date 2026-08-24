# P5 自主持续开发执行计划

## 1. 目标与阶段出口

在不改变已会签产品定位、Skill 主路线、技术栈和验收契约的前提下，按 `V1 -> V2 -> V3 -> V4 -> Final Acceptance` 顺序完成 P5。每个版本都必须形成可运行增量、本地可重复验证、独立 I/X/P/Profile、风险与回滚证据、immutable Result 和阶段状态闭环。

P5 的最终出口仍以 `PROJECT_ROUTE_LOCK.md` 为准：V1-V4 与 Final Acceptance 全部通过，正式 OID、交付清单、风险、回滚和 PC-20.AR 可追溯。

## 2. Phase A：V1 控制链收口

1. 实时重读 main/formal/control、fence 113、packet/ACK、验收提交和用户受保护文件状态。
2. 将 attempt 1 的独立证据审计 `REVISE` 固化为不可变 rejected evidence；按既有重试协议终结 attempt 1，不得生成 PASS Result。
3. 为 attempt 2 固化新的 packet/dedup/claim/fence/ACK；仍绑定 exact F16，但不得复用 attempt 1 的 fresh 运行汇总。
4. 在唯一 no-local clone 中重跑 offline install、`pnpm check` 和累计 runner；把原始内容、字节数、raw SHA、runner source/output、逐阶段连续链、Q 行和 20 项风险探针直接持久化到允许产物。
5. 用全新独立 reviewer 在专属 worktree 审查 attempt 2 三文件、可重放原始证据、17/17 source refs、PC/TG/Q/fail-closed/P2 与授权边界。
6. reviewer 为 PASS、P0/P1=0、required_fixes=[] 后，主控才生成 immutable V1 Result 并执行 expected-old control CAS。
7. 将合格验收三文件和必要状态真源以小步提交纳入 main；不得纳入用户 Multica 未跟踪文件。
8. 形成 V1 会签包与独立终审；总授权不回填为对尚未展示精确 Result 的用户会签，停在明确用户确认边界。
9. 同步 `PROJECT_ROUTE_LOCK.md`、活动计划、README/PLANS/QA 与 `.codex` 留痕，使镜像与真实 refs 一致。

Phase A 出口：V1 registry/checkpoint、Result、审查、会签状态和 main 文档完全一致；formal 是否移动只由既有版本协议决定，不自行发明提升动作。

## 3. Phase B：下一版本入口冻结

1. 从 P3 版本拆解与 P5 活动计划读取下一版本的精确 PC、TG、里程碑、DoD、依赖、非目标和验收类型。
2. 若只是既定 V2 路线内推进，更新阶段镜像与执行计划；若出现新需求、漏项或路线改变，先进入 Change Intake。
3. 独立执行 entry review 和计划 review；未通过前不生成 Execution Packet。
4. 以实时 expected-old control 固化 packet/dedup/dispatch-ready/outbox/registry/checkpoint，再创建唯一 claim/fence 与 ACK。

Phase B 出口：下一版本入口真源、计划、packet 和派发身份全部不可变且可复算。

## 4. Phase C：功能并行实施模型

每个版本按依赖图拆成 2-3 个互斥工作包：

- W1：fixture/schema/契约或数据真源；只拥有冻结输入与对应测试。
- W2：domain/kernel；只拥有领域实现与领域测试。
- W3：adapter/CLI/Skill/receipt；只拥有组合根、适配器和集成测试。

若实际版本结构不同，以 P3/P5 真源为准重新划分；共享 Schema 或严格父链不并行修改。所有 worker 必须从同一 working parent 建立独立 worktree，先 RED、后 GREEN、再自检，提交后由主控按依赖顺序集成。

## 5. Phase D：逐版本验收链

每个候选依次经过：

1. 主控定向测试与全量 `pnpm check`。
2. 独立 Candidate Verification。
3. 独立 I/X/P/Profile。
4. L3 `judge-harness` 四角色评分。
5. Result/control CAS。
6. Final Content Snapshot、protected manifest、write transaction。
7. 唯一 no-local clone 的 Final Verification 与 Credential。
8. Audit Anchor、Anchor Verification、Proof。
9. expected-old formal CAS（仅在既有协议要求且所有前置门禁通过时）。
10. 版本 Result、会签包、状态同步与计划归档。

任一门禁出现 P0/P1、required_fixes、摘要/父链/写集漂移、测试失败或证据缺失，立即退回原责任 worktree 修订；不得包装为完成。

## 6. 串并行与所有权

- 可并行：互斥功能写集、只读真源审计、不同独立审查角色、不同 fixture 矩阵。
- 必须串行：路线锁/阶段切换、Schema 最终冻结、main 集成、Result 注册、control/formal CAS、会签状态变更。
- 主代理负责冲突处理、摘要复算、全量验证、refs 不变性和最终回收。
- subagent 不得修改未分配路径，不得回滚他人改动，不得更新 control/formal/main refs。

## 7. 持续循环与停止条件

完成一个版本后，重新读取路线锁和活动计划，再进入下一版本。循环持续到 P5 Final Acceptance 出口关闭；遇到以下情况必须停止推进并留痕：

- 路线锁与产品/技术真源冲突；
- 需要重写骨架、改变技术栈、主流程或验收门禁；
- 同一阻塞连续三轮无法解除；
- 无法保护用户改动或无法构造可重复本地验证；
- 项目定义要求不可代理的用户判断，且现有总授权不足以表达该具体判断。

## 8. 当前分派

- `v1_result_control_map`：只读梳理 Result/CAS 先例与会签边界。
- `v1_acceptance_evidence_audit`：只读反扫 V1 验收证据是否足以注册 Result。
- `post_v1_route_map`：只读冻结 V1 剩余门禁和下一版本路线/并行写集。

三路均使用专属 worktree，不共享写集；完成后由主控集成结论并回收。
