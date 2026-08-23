# S1.5 过期执行态恢复与集成摘要

## 当前路线

- 生命周期：`S5 开发落地`
- 当前里程碑：`P5 / V1 / M1.2 / S1.5`
- formal 基线：F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3`
- main 基线：`a028bb7eccf3df4601cb3655e9e56e56f3c83066`
- 审计时 control：`e1a470c0307d1126cce42b38cf4bc63596facba9`
- 恢复后 dispatch control：`adb075fb7f8da577bde7362639438425e9ea01ca`（attempt 2 / fence 83）
- candidate-ready control：`110e5dc91af4f6ce123b6fef4be5de65447c5518`

## 恢复事实

- S1.5 Execution Packet 已存在，`task_attempt=1`、`plan_generation=4`、packet digest=`sha256:f5981aea939ed0fc471fcd7a2970be9dc45d8e2e79e33bb81b8cbe1bf8f9c52e`。
- fence 82 已记录 W1/W2/W3 phase-1 三路派发；outbox=`partially-dispatched`，remaining=`S1.5-W4`，租约已于 2026-08-14 过期。
- W1/W2/W3 分支提交仍可达：`900294d...`、`f28f81d...`、`73e4138...`。原临时 worktree 已不存在，需在新的隔离环境中重放与复验。
- 恢复必须以高于 82 的 fence 和 expected-old control CAS 进行；旧 fence 不得继续写入。
- attempt 1 packet 已过期并由墓碑关闭；attempt 2 packet digest=`sha256:f3431d00d52646c08560e958521149f280dc9481f98e0b500296771085a81a32`，dedup=`sha256:bb0b1e7f9d3e3d5d804c0bd246e034246093b38fa430b336234c01bdaf6d49c6`，绑定隔离分支 `codex/s1.5-g4-a2-integration`。
- W1/W2/W3 已在新隔离 worktree 分别复验通过，并以 `1e67103`、`91f0841`、`11de2bb` 集成；集成基线 `pnpm check` 为 313/313，覆盖率 Lines 92.76% / Branches 87.38% / Functions 98.88%。
- 最终候选为 `f226e0fce689284b5f02747784d82c09c47b3ec5`，subject digest=`sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30`；主控复验 374/374，覆盖率 Lines 92.79% / Branches 87.55% / Functions 99.00%。
- Execution Result digest=`sha256:7a0197f807214041402cf6e947b85d1c17494145e01e511d2977fbb5b3d722bd`；registry 已为 `candidate-ready`，formal 仍为 F14。

## Subagent 执行分工

- 用户于 2026-08-22 明确授权“使用 subagent 模式继续执行”。
- W4 worker：独占 W4 允许写集，在 attempt 2 integration worktree 中按 TDD 实现并提交。
- 架构契约核对：只读检查 W2/W3 组合 API、CLI 契约、依赖方向与回归测试缺口。
- 恢复/验收预审：只读检查 control/formal 边界、W1-W3 基线和候选证据门禁。
- 主控：只负责协调、集成复验、`.codex` 留痕和后续 control CAS；独立 CV/I/X/P/L3 仍不由实现 worker 或主控自批。

## 本轮最小可验收闭环

1. 独立复验 W1/W2/W3 的提交父链、互斥写集、构建和测试。
2. 用新 fence 恢复 control，保留过期租约和旧宿主任务证据。
3. 在隔离集成分支合入 W1/W2/W3，按 TDD 先写 W4 失败测试，再实现 CLI、机器回执、Skill 阶段守卫与依赖方向。
4. 运行受影响测试、`pnpm check`、输出纪律、路径边界、敏感字段和上游保护反扫。
5. 只生成待独立 CV/I/X/P/L3 的精确候选；本轮不自批门禁，不移动 formal F14，不启动 S1.6。

## 文件边界

- W1：`tests/fixtures/write-consistency/**`、`tests/support/fs-fault-fixture.ts` 及其测试。
- W2：`project-context` / `candidate-change` 领域、Schema 与对应测试。
- W3：`confirmation-node` / `write-transaction` / Node 文件适配、Schema 与对应测试。
- W4：S1.5 专用 CLI、`machine-receipt.ts`、`command-policy.ts`、`skills/nextstep/SKILL.md`、`tests/cli/**`、`tests/skill/**`、`tests/architecture/**`。
- 禁止：已会签产品/设计/架构真源、package/lock/tsconfig、S1.1–S1.4 现有 fixture、formal ref、未经 CAS 的 control ref。

## 工具与代替流程

- `CodeGraph`：项目未初始化，路线锁要求“需询问”，本轮不自动建索引；用 `rg`、真源文档、既有测试和 TypeScript 类型检查替代。
- 子 Agent：已获用户明确授权并按互斥写集派生一个 W4 worker 与两个只读审查代理；独立门禁仍不以当前实现/预审代理替代。

## 2026-08-23 后续验证状态

- Attempt 2 的 `374/374` 为不可复现的证据口径，已由独立 CV `REJECT / 78` fail closed；Node 24.11.1、24.14.0、24.19.0 对精确 subject 均稳定复现 `353/353`。上述“主控复验 374/374”只保留为当时记录，不再作为有效门禁证据。
- Attempt 3 未修改生产代码，以新的 immutable Packet/Execution Result 将口径纠正为 Node 24.14.0、pnpm 10.33.2、36+36 测试文件、337+16=`353/353`、覆盖率 92.82/87.62/99.00。
- Attempt 3 Evidence Correction=`PASS/100`；CV=`PASS/100`、8/8；I/X/P+Profile=`PASS/100`、6/6、write-consistency 13/13、Profile 17/17、Q6=100%，P0/P1/P2 均为 0。
- 双门 Result 已用 expected-old CAS 固化到 control `1c3eb36336da3b34c76d7178362c5e799b0a6427`，formal 仍为 F14；下一步为独立 L3，不得提前宣称 S1.5 正式完成。
