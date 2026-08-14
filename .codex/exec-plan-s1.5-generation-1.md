# P5 / V1 / M1.2 / S1.5 Generation 1 执行计划

状态：入口评估通过，计划冻结前状态同步中；尚未生成 Execution Packet，尚未编码或派发。

## 1. 目标与边界

S1.5 实现 Skill 入口到目标项目工作树的**候选变更、显式确认、dry-run 预览、受控回写与失败不提升**闭环，承载 PC-06 与 PC-07。S1.5 只在三类目标项目 fixture 上证明行为，不把 fixture、dry-run 或工程可构建包装为正式全链路产品能力。

- formal 基线：F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3`
- 当前 control 基线：以派发前实时读取的 `refs/nextstep/control` 为准；本计划冻结时为 `f3581247189e719370f339b0e061e47d8df5556c`
- 计划代际：`plan_generation=4`，不推进代际、不创建墓碑
- 主载体：`Skill / 聊天入口`；真源仍为项目文档、`PROJECT_ROUTE_LOCK.md` 与阶段真源
- 活跃上游真源：
  - `docs/design-docs/s3-skill-interaction-source.md`（S3 §3.1、§6、§7、§9、§11、§14）
  - `docs/product-specs/007-s3-skill-interaction-contract.md`（上下文防火墙与入口契约）
  - `docs/product-specs/008-downstream-interaction-product-acceptance-contract.md`
  - `docs/architecture/009-s4-technical-input-supplement.md`（S4 写入、隔离、恢复与证据输入）
  - `docs/design-docs/p4-execution-mechanism-design.md`
  - `docs/exec-plans/completed/p3-version-and-milestone-breakdown.md` 的 S1.5 行
  - S1.4 F14 正式产物与 Acceptance Profile 三重身份链

历史迁移设计 `docs/design-docs/s3-main-conversation-agent-orchestration-design.md` 与迁移计划仅作历史证据，不作为本 packet 的正式 source_refs。

## 2. 计划冻结时吸收的入口评估修复

1. **Dedup 投影冻结**：S1.5 Execution Packet 的 dedup JCS 投影固定为七字段：`repository_id`、`plan_id`、`plan_generation`、`task_id`、`task_attempt`、`packet_digest`、`route_generation`；`packet_digest` 仍排除 `packet_digest` 与 `dedup_key` 后按 RFC8785 计算。CV/FV/AV 必须独立复算并检查 packet、ready、ack、outbox、registry 五处一致。
2. **冲突回执裁决**：保留既有 `PROFILE_CONFLICT_REJECTED` 用于身份/路线 Profile 冲突；新增 S1.5 专用 `WRITE_CONFLICT_REJECTED` 用于确认后基线变化、目标文件冲突或写入事务版本冲突；既有 S1.2–S1.4 回执不得改写。部分写入/不可安全回滚使用 `WRITE_PARTIAL_BLOCKED`，权限/项目不可访问使用 `WRITE_ACCESS_BLOCKED`，均 fail closed。
3. **V1/V3 边界**：S1.5 仅写目标项目 fixture 的隔离工作树，并可在 fixture 内生成提交作为一致性证据；不得写 NextStep `refs/nextstep/formal`、`refs/nextstep/control`、控制 registry、Final Snapshot、Audit Anchor 或正式提升对象。`registry-transition`、`snapshot-materialize`、`formal-promote` 留给 V2/V3。
4. **Fixture 输入语义**：P3 所称“目标项目写入 fixture”不存在于上游；由 W1 先构造并自验三类写入 fixture，之后才允许依赖它的实现切片集成。fixture 必须包含正例、只读/权限故障、写中故障、符号链接逃逸、基线漂移、部分写入与不可安全回滚场景。
5. **确认隔离**：新建通用 `confirmation-node` 组合模块，不修改 S1.2 `requirement-confirmation.ts` 的既有行为；S1.2 freeze 回放 digest 必须字节级恒定。

## 3. 最小 Definition of Done

- [ ] `V1 / M1.2 / S1.5` 阶段守卫、唯一项目根/阶段解析、同名/嵌套/符号链接/越界/权限阻塞成立。
- [ ] 候选变更必须绑定项目根、正式/工作树基线、目标路径、before/after digest 与确认后果；基线变化不覆盖。
- [ ] 显式确认链绑定 challenge/view/display/action/result、候选 digest、项目身份、基线与过期时间；未确认、过期、取消、自批、视图变化均拒绝。
- [ ] dry-run 只预览，commit/write 必须由集成职责调用；机器回执为单一 RFC8785/JCS JSON stdout，诊断只写 stderr，失败 exit 1。
- [ ] 单文件临时写入、fsync、原子重命名与逐目标验证；部分写入只回退可证明属于本次事务的变更，不安全回退则阻塞，不使用破坏性 Git 命令。
- [ ] 写入失败不更新会签、阶段、formal/control 或正式状态；回执包含已写/未写/冲突基线/恢复入口等结构化 data。
- [ ] 三类 fixture 完成入口→确认→dry-run→回写→重读验证→fixture 内提交/回放链；权限、写中故障、基线漂移、符号链接逃逸与主对话写入尝试均 fail closed。
- [ ] 既有 206 用例零回归；S1.2 freeze digest 恒定；`pnpm check` 全过，覆盖率不得低于 F14 口径 Lines 91.07% / Branches 83.80% / Functions 98.36%。
- [ ] 不触碰 S1.1–S1.4 既有 fixture/测试、已会签产品/技术文档、package/lock/tsconfig；新增依赖、改会签语义、改门禁或改宿主能力必须先走 Change Request。

## 4. 并行切片与互斥写集

先由 W1 构造并验证 fixture；共享导出签名冻结后，W2/W3 可并行；W4 最后集成。

| 切片 | 职责 | 独占写集 | 关键 RED→GREEN 证据 |
|---|---|---|---|
| W1 | 三类目标项目写入 fixture、权限/写中故障与 fs-fault harness | `tests/fixtures/write-consistency/**`、`tests/support/fs-fault-fixture.ts`、其专属 fixture 测试 | 真实只读、不可写、写中失败、symlink escape、基线漂移、部分写入与 rollback ownership |
| W2 | 项目/阶段上下文、候选变更与 dry-run 领域契约 | `src/domain/project-context.ts`、`src/domain/candidate-change.ts`、对应 `schemas/v1/**`、`tests/domain/project-context.test.ts`、`tests/domain/candidate-change.test.ts`、对应 CLI 负例 | 根解析、路径边界、基线摘要、before/after digest、敏感/未知字段 fail closed |
| W3 | 通用确认节点、写入事务与 Node 文件写入适配 | `src/domain/confirmation-node.ts`、`src/domain/write-transaction.ts`、`src/adapters/node/file-write.ts`、对应 schema/测试 | 未确认/过期/自批、版本冲突、原子写、部分写入、归属回退与阻塞 |
| W4 | CLI、机器回执、Skill 阶段入口、command-policy 与集成回归 | `src/cli/**` 中 S1.5 专属入口、`src/domain/machine-receipt.ts` 兼容扩展、`src/domain/command-policy.ts`、`skills/nextstep/SKILL.md`、`tests/cli/**`、`tests/skill/**` | 单回执、stdout/stderr、exit code、主对话写入拒绝、S1.2 digest 回归、依赖方向断言 |

共享文件归属：`SKILL.md`、`command-policy.ts` 与回执 schema/receipt 集成只由 W4 修改；其他 worker 不得改共享文件或他人写集。

## 5. 执行与验收顺序

1. 主控冻结本计划、entry scorecard 与状态同步，并以实时 expected-old=`f3581247189e719370f339b0e061e47d8df5556c` 完成 S1.5 packet/dispatch-ready control CAS。
2. 领取 fence 82，按 W1→W2/W3→W4 顺序派发隔离 worktree；CAS 成功前任何 worker 不得编码或派发。
3. 集成候选只允许来自四切片互斥写集；主控运行冲突、路径、上游保护、依赖方向和全量 `pnpm check`。
4. 独立 CV 只读复验精确候选；失败即退回并创建新 attempt，不覆盖旧证据。
5. 独立 I/X/P 按 PC-06/07 与 NextStep headless Profile 验收，冲突不降级；双门通过后由新 Qwen L3 复审。
6. L3 通过后冻结 Final Content Snapshot、protected manifest 与 Write Transaction；再执行独立 Final Verification、项目外 Credential、Audit Anchor、Anchor Verification、Anchor Proof。
7. 全链通过后仅以 expected-old=F14 CAS 正式推进到 F15；CAS 前不宣称 S1.5/M1.2/V1/P5 完成，S1.6 不启动。

## 6. 明确非目标与回滚

- 不恢复 Web/UI、不引入前端框架/数据库/常驻服务/新宿主适配器。
- 不实现 V2/V3 的 registry-transition、snapshot-materialize、formal-promote，不写 NextStep 正式 refs。
- 不修改已会签 S3/007/008/009/S4/P3/P4 文档；若语义需变更，先走 Change Request。
- 任一切片失败保留 RED/阻塞证据，回到本切片或 Change Intake；不得删除历史结论、强制重置、覆盖用户改动或 push。
