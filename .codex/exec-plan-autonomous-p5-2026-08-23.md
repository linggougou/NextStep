# P5 夜间自主推进执行计划（2026-08-23）

## 1. 授权与执行边界

- 用户于 2026-08-23 明确授权主控在其休息期间自主规划并持续开发，要求各功能使用隔离 worktree 派发 subagent，并在验收合格后回收对应 agent/worktree。
- 本授权允许执行既定 P5 路线内的计划、实现、验证、受控 Git 提交与项目内治理留痕；不改变 `PROJECT_ROUTE_LOCK.md` 的产品路线、技术栈、阶段出口、正式提升协议或用户会签要求。
- formal/control 的推进继续使用项目既有 expected-old CAS、单父 control 链、fence、Result、Final Verification、Credential、Audit Anchor 和 Anchor Proof 协议；任何门禁失败都必须 fail closed。
- 不 push、不发布、不删除用户成果，不把自动验收冒充协议中要求的显式用户会签。

## 2. 实时冻结基线

- main / S1.5 candidate：`f226e0fce689284b5f02747784d82c09c47b3ec5`
- candidate tree：`c5d2e7c2a22023970d4a73feba856afdd44cd891`
- candidate digest：`sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30`
- control：`110e5dc91af4f6ce123b6fef4be5de65447c5518`
- formal F14：`024c1db6d941b6f771746c8d6249fb8a09b816f3`
- S1.5 Execution Result：`sha256:7a0197f807214041402cf6e947b85d1c17494145e01e511d2977fbb5b3d722bd`
- 已有实现门禁：`pnpm check` 374/374；Lines 92.79%、Branches 87.55%、Functions 99.00%。

## 3. 里程碑 DAG

1. S1.5 双独立门禁：为精确候选创建 CV 与 I/X/P gate request、dispatch intent、fence 84/85 claim 和 ack；分别在全新隔离 worktree 中执行，结果互不引用对方的未完成结论。
2. S1.5 L3：仅在 CV 与 I/X/P 均为 PASS 且 P0/P1=0 后创建独立 L3；失败则冻结正式链并以新 attempt 修复。
3. S1.5 正式证据链：冻结 Final Content Snapshot 与 protected manifest，执行独立 Final Verification，写入项目外 create-once Credential，构造唯一父 Audit Anchor，执行 Anchor Verification 并写入项目外 Anchor Proof。
4. S1.5 formal promotion：逐项复算 JCS/raw SHA/权限/父链/祖先/受保护路径/pending outbox；仅在 expected-old=F14 时 CAS 到 F15，并以独立 control commit 固化 promotion。
5. S1.6 入口与计划：同步路线锁和活动计划，独立评估依赖、范围、PC 覆盖、测试矩阵和写集；完成变更分流、Generation 计划和 Execution Packet/control CAS 后才允许编码。
6. S1.6 并行 TDD：按冻结写集创建独立 worktree；每个 worker 先交付 RED，再交付 GREEN/REFACTOR 与本地门禁。主控只做受控集成和跨切片契约修复。
7. S1.6 独立验收与正式链：重复 CV、I/X/P、L3、Final Verification、Credential、Anchor Verification、formal promotion 的职责隔离流程。
8. M1.2 / V1 / P5 累计验收：执行所有可自动化门禁、回归、风险反扫和交付证据；协议要求显式用户签署的节点记录为待用户醒后确认，不擅自替代。
9. 收口：回收已完成 agent/worktree，清理仅有的 prunable worktree 元数据，更新 `.codex`、路线锁、计划、QA/发布证据并输出实时状态。

## 4. Subagent 与 worktree 规则

- 每个实现、CV、I/X/P、L3、Final Verification、Anchor Verification 使用不同 subagent；验收 agent 不参与被验对象实现。
- 每个写任务拥有互斥 write set；所有 agent 必须声明自己不是仓库中唯一工作者，禁止回滚他人改动。
- review worktree 从精确 subject detached/独立分支创建；review 仅允许写 packet 指定的 `.codex/reviews/...`，不得修改生产代码或 refs。
- 主控负责 control CAS、结果摘要复算、合入、冲突处理、全量验证和 worktree 回收。

## 5. 统一验收与停止条件

- TDD：新功能或缺陷修复必须保留 RED→GREEN→REFACTOR 证据；覆盖率不得低于项目冻结口径且绝不低于 80%。
- 验证闭环：typecheck、build、全量测试、覆盖率、安全扫描、diff/allowlist、JSON/JCS、Git 完整性与 refs 前后不变均需可重复。
- 质量门：综合分至少 90 且建议 PASS；P0/P1=0。任一路为 REVISE/REJECT、摘要不匹配、ref 漂移或 pending dispatch 非零，立即停止对应正式链。
- 高危停止：路线、技术栈、产品定位、验收门禁或安全边界需要改变时，写明影响并等待用户确认；本计划不授予绕过路线锁的权限。
