# P5 自治开发计划（2026-08-26 live 重建版）

## 1. 目标

在不越过 `user-signoff` 与 formal/control 高危门禁的前提下，把 P5 当前实际状态从“文档停在 claim/fence 118”重建为“live control 已完成 dispatch-ready/outbox 与 dispatch ACK，SG-1 实现分支已产出并通过本地检查”，然后按最小闭环继续推进：

1. 先完成 SG-1 独立验收与状态同步。
2. 再决定 SG-1 main 合入。
3. 随后按 `SG-2 -> SG-3` 顺序推进 CR-006 三个护栏闭环。
4. CR-006 收口后，再回到 V2 首个产品 packet 入口。

## 2. 当前 live 状态

- 生命周期阶段：`S5 / P5`
- main：`80fdbaf36cc4aa6ea334ba9543b6d431e8e293a7`
- formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`
- live control：`e0394c27d70ae522ebc1ae754124124d0a9f3242`
- 关键 control 链：`042e007 (claim/fence 118)` -> `96c6bcb (dispatch-ready/outbox)` -> `e0394c2 (dispatch ACK)`
- SG-1 registry：`running`
- SG-1 implementation worktree：`/Users/ling/.codex/worktrees/sg1-g5-a1-f118`
- SG-1 implementation commit：`9fc9dc2e51790e868d30d23fd28c8b8f17d67935`
- SG-1 packet digest：`sha256:04d13a57ce82419534255d126184dc35d6cfce4e35b4c878f0200bf43302be52`
- 已验证：`pnpm check` on SG-1 worktree = `482/482`，`fail=0`

## 3. 关键问题

### 3.1 状态漂移

- `PROJECT_ROUTE_LOCK.md`
- `docs/PLANS.md`
- `docs/PRODUCT_SENSE.md`
- `docs/exec-plans/active/p5-product-implementation-milestones.md`
- `docs/exec-plans/active/p5-scalability-guardrails.md`
- `docs/qa/index.md`
- `.codex/verification-report.md`

以上仍停在 `control=042e007...`、`仅到 claim/fence 118` 的口径，与 live refs 不一致。

### 3.2 当前真实门禁

live registry 已明确：

- SG-1 的 dispatch-ready / outbox / ACK / 编码 / 测试：已发生
- SG-1 的独立验收：仍未发生
- SG-1 的 main 合入：仍未发生
- SG-2 / SG-3 packet：仍未创建
- V2 packet：仍暂停

所以当前不该再把精力放在“是否可以派发 SG-1”，而应切换到“如何独立验收 SG-1，并把项目真源同步到 live 状态”。

## 4. 执行顺序

### A. 状态重建闭环

目标：把 route/docs/.codex 的当前状态同步到 live refs，但不同步到超出已验证事实的未来状态。

最小动作：

1. 记录 live control 链 `042e007 -> 96c6bcb -> e0394c2`
2. 明确 SG-1 当前状态为 `running`
3. 明确“下一步是独立验收，不是再次申请 dispatch”
4. 保持 V2 / SG-2 / SG-3 未启动口径不变

约束：

- 不改 formal/control refs
- 不宣称 SG-1 已通过
- 不把实现分支结果提前写成已合入 main

### B. SG-1 独立验收闭环

目标：对 `9fc9dc2` 做与实现 worktree 解耦的独立验收。

验收核对项：

1. 候选身份：commit/tree/parent 与 packet digest 绑定一致
2. allowlist：真实写集只落在 4 类允许路径
3. TDD 契约：六项边界、`+1` 超限、`null` 不可测、多项超限稳定顺序、未知字段/版本拒绝、跳过会签/CAS 豁免拒绝
4. 纯领域边界：不读 Git、不写文件、不依赖 control/formal
5. 本地验证：至少重跑 SG-1 相关测试，必要时重跑 `pnpm check`

通过后才允许：

1. 写独立验收结论
2. 评估 main 合入
3. 启动 SG-2 准备

未通过则：

1. 只退回 SG-1
2. 不触发 SG-2 / SG-3
3. 不改 formal/control

### C. SG-1 main 合入闭环

前提：

1. SG-1 独立验收 `PASS`
2. 主工作区 dirty 留痕不与合入冲突
3. 合入后主分支仍可本地通过验证

动作：

1. 将 `9fc9dc2` 以最小方式整合回 main
2. 在 main 复跑必要验证
3. 同步 route/docs/.codex 真源

### D. SG-2 闭环

目标：实现“人类可读的项目状态投影”，解决“普通人看不懂现在在哪”的治理成本问题。

顺序：

1. 先基于已收口的 SG-1 状态创建 SG-2 packet
2. 独立 claim/fence / dispatch / 实现 / 验收
3. 合入后再更新状态摘要入口

注意：

- SG-2 不能冒充 PC-12
- 只做只读投影，不改 formal/control，不改产品真源

### E. SG-3 闭环

目标：建立真实项目价值验证框架，但真实运行计数保持 `0/3`，不提前宣称价值闭合。

顺序：

1. SG-2 完成后再创建 SG-3 packet
2. 实现 Schema / domain / CLI / protocol
3. 独立验收只验证“框架可用”，不验证“真实项目价值已经达标”

### F. CR-006 收口后回到 V2

只有在 SG-1/2/3 全部完成并完成各自独立验收后，才返回 V2 首个产品 packet 入口评估。

不允许：

- 以 CR-006 任一子包完成冒充 V2 已启动
- 以状态投影或价值框架冒充 V2 / V4 / P5 完成

## 5. worktree / 子任务分工

### 当前已存在

- `sg1-g5-a1-f118`
  - 类型：实现 worktree
  - 状态：已完成编码并通过本地 `pnpm check`
  - 下一步：独立验收

### 接下来需要建立

1. SG-1 独立验收 worktree
2. 如 SG-1 PASS，再为 main 合入建立独立整合 worktree
3. SG-2 实现 worktree
4. SG-2 独立验收 worktree
5. SG-3 实现 worktree
6. SG-3 独立验收 worktree

原则：

- 实现与验收永不复用同一 worktree
- 验收者不修实现
- 任一闭环通过后立即回收对应 worktree / agent

## 6. 当前最近下一步

1. 先做 SG-1 独立验收
2. 验收通过后同步状态真源
3. 再决定 SG-1 main 合入
4. 然后创建 SG-2 闭环

## 7. 明确不做

- 不替用户执行新的 user-signoff
- 不未经独立验收就把 SG-1 写成完成
- 不在 SG-1 未收口前并发创建 SG-2 / SG-3 packet
- 不把 CR-006 的护栏实现包装成 V2/V4/P5 完成

## 8. 异常修订（2026-08-26 12:23:37 +0800）

- 原计划形成后，越界 subagent 在正式独立验收前把 SG-1 cherry-pick 到 `main=3464fbc6b117fe4ee3b1d8b6c921a2f3dc43fd4c`。
- 该物理合入不改变本计划的验收前置：先封存异常，再对固定候选建立 acceptance packet/claim/fence/dispatch ACK/Result 链。
- 不以 reset/revert 破坏现有 main；正式 PASS 前暂停 SG-2，正式验收失败则单独形成修复/回滚裁决。
