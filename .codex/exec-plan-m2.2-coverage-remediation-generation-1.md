# V2 / M2.2 Coverage Remediation Generation 1 执行计划

## 1. 冻结身份、入口与退回权威

- 生命周期/路线：`S5 / P5 / V2 / M2.2 / remediation`。
- `stage_id=P5/V2/M2.2/remediation`，`task_id=M2.2-COV`，`route_generation=1`，`plan_generation=5`，`task_attempt=1`。
- 计划固定入口 main=`1bb83c945de4ed620a44df370cfdeccbaf59451e`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，M2.2 attempt 1 Result control=`c58d803714c13700bdabd3afb1c93ef9ed283f87`。执行任何后续 CAS 前仍须运行时重读 live refs，并以精确 expected-old 单父 CAS fail closed；本计划不得被解释为允许覆盖已经前进的 ref。
- M2.2-I-X-P attempt 1 的 Result digest=`sha256:8f0efa83bdb87ebacf31aff8fb045e6107a1abf5c2ee0f991edc2c1ed20ef1d6`、Result control=`c58d803714c13700bdabd3afb1c93ef9ed283f87` 是永久 `REVISE` authority。该对象及其 packet、fence148、ACK、review=`8c14af38afd1c06601a281d4cd7d3813b9e31099` 均不得重写、删除、重哈希替换或升级为 PASS authority。
- attempt 1 的有效证据保持原义：targeted=`29/29`，full=`555/555`，fail/skip/cancel/todo=`0/0/0/0`，Functions=`99.57`；但 Lines=`94.33 < 94.36`、Branches=`89.60 < 89.65`，因此 HG7 硬门失败，结论=`REVISE / 95`、P0/P1/P2=`0/1/0`。既有 I/P 证据和测试通过数不能抵消覆盖率失败，也不能转化为 M2.2 完成 authority。
- 阶段出口：只通过一个受控、测试专用候选补齐已存在的有效 fail-closed 行为覆盖，完成独立候选审查和受控 main 集成，冻结新的 historical subject；随后以全新的 M2.2-I-X-P attempt 2 控制链和独立 reviewer 重验。attempt 2 精确用户会签前，M2.2 仍未完成。

## 2. 唯一实现范围与测试契约

- remediation Execution Packet 的唯一实现 allowlist：`tests/domain/small-milestone.test.ts`。实现 agent 对任何其他路径均无写权限。
- 只允许在现有测试 `依赖缺失、额外、重复、自依赖、未知、反向、跳级、替代 DAG 与环路精确拒绝` 或等价的既有 fail-closed 测试体内，精确构造同一个不可安全 JSON 化的 cyclic 输入：`const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;`，并加入以下两条断言：
  1. 对 `evaluateSmallMilestonePlan(cyclic)` 断言真实外层错误契约 `INVALID_SMALL_MILESTONE`；该入口在图分析前即因输入不是 safe JSON 而 fail closed，不得误写为内层图错误 `DEPENDENCY_CYCLE`；
  2. 对 `parseSmallMilestonePlan(cyclic)` 断言真实结果完整性错误契约 `RESULT_INTEGRITY_MISMATCH`。
- 不得新增 `test(...)`/`it(...)` 用例，不得改变测试总数；不得新增 fixture、快照、helper 文件或依赖。只允许最小内联构造/克隆和两条 `assert.throws` 断言，不扩大到其他失败面。
- 不得修改 `src/**`、Schema、CLI、Skill、package/lock、配置或生产行为；即使断言暴露生产差异，也必须停止并登记新变更入口，不得在本 remediation packet 内修生产代码。
- 这是测试专用的覆盖缺口修复，不改变 PC-11..PC-13、TG union、I/X/P 维度、M2.2 产品语义或 P3/P4/S4 真源。

## 3. Remediation 控制链与实现角色

1. 本计划先接受唯一独立 entry review。entry review 未达到 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 时，不得创建 remediation packet。
2. 主控重新核对 formal、live control、main、attempt 1 Result digest/control、`route_generation=1` 与 `plan_generation=5` 后，以单独 expected-old 单父 control CAS 创建唯一 `P5/V2/M2.2/remediation / M2.2-COV / attempt 1` Execution Packet；packet allowlist 必须精确等于第 2 节单一路径。
3. packet、claim/fence、dispatch-ready/outbox、dispatch ACK 必须分别使用独立 expected-old 单父 control CAS；不得复用 acceptance attempt 1 的 packet、claim、fence148、ACK、reviewer 或 Result。
4. 只派发一个未参与本计划创作、entry review、控制面写入或 M2.2 attempt 1 验收的独立实现 subagent。它在隔离 worktree 中从 packet 固定 working parent 工作，ACK 固化前不得编码。
5. 实现 subagent 只提交第 2 节的 test-only 变更；提交前运行受影响测试、fresh `corepack pnpm check`、`git diff --check`，并报告 commit/tree/唯一父/写集/测试与覆盖率。不得创建 acceptance、Result、main 集成或 refs authority。
6. 任一身份漂移、重复 claim、stale fence、ACK 前写入、allowlist 越界、测试计数变化、产品代码变化或覆盖率未达标，均将本 remediation attempt 标为 blocked/revision，不得口头豁免。

## 4. 候选独立审查与受控 main 集成

- 候选必须交给另一个未参与实现、计划、entry review 或控制面写入的独立 reviewer；实现 subagent 不得自审。reviewer 只消费 candidate commit 与冻结 packet/control 证据，不得修改候选或 refs。
- 候选审查至少证明：差异精确只有 `tests/domain/small-milestone.test.ts`；没有新增测试用例计数；恰有第 2 节两条 cyclic fail-closed 断言；生产代码/Schema/fixture/dependency 均未变化；targeted 仍为 `29/29`；fresh full 至少 `555/555` 且 fail/skip/cancel/todo=`0/0/0/0`；coverage Lines/Branches/Functions 至少 `94.36/89.65/99.57`；`git diff --check` 通过。
- 独立候选审查必须形成专属 exact-three review receipt 并以 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 收口；否则退回新的 remediation attempt，不得合入 main。
- 主控在候选 PASS 后重新解析 live main，并以 expected-old 防漂移方式受控集成 candidate。若 main 已前进，仅允许证明单父可兼容后重新候选化/复审；不得强推、重写、rebase 掩盖或覆盖他人改动。
- 集成成功后，以该包含 test-only remediation 的 main checkpoint 作为新的 historical subject 候选。主控必须冻结并复算其 commit/tree/唯一父/subject digest，证明它包含原 `b68dd897...` 的有效 S2.3/S2.4 产品树语义和唯一 test-only 增量；旧 subject 与 attempt 1 历史保持可寻址。
- 在新的 historical subject 身份、fresh 门禁和集成 ancestry 全部固化前，不得创建 M2.2 acceptance attempt 2 packet。

## 5. M2.2-I-X-P attempt 2 独立重验

- 新验收身份固定为 `stage_id=P5/V2/M2.2/acceptance`、`task_id=M2.2-I-X-P`、`task_attempt=2`、`route_generation=1`、`plan_generation=5`；维度仍严格为 `I / X / P`，不得增加 Profile。
- attempt 2 必须创建全新的 acceptance packet/dedup、claim/fence、dispatch-ready/outbox 与 dispatch ACK，每一步均为独立 expected-old 单父 control CAS。不得复用 attempt 1 的 packet digest、claim、fence148、ACK evidence ref、review commit、Result 或 host identity。
- 主控以 `git clone --no-local` provision 一次性副本，移除 origin，确认无 alternates，detached checkout 新 historical subject；依赖只允许 offline/frozen 安装。ACK 前冻结 formal 与 pre-ACK ready control，ACK 后只允许 controller 以 create-once namespaced evidence ref 注入精确 ACK 对象，不更新 clone 内 frozen control ref。
- 唯一 acceptance reviewer 必须未参与 remediation 实现、候选审查、main 集成、attempt 1 验收或控制面写入；由同一 host 完成 ACK 前 readiness-only 与 ACK 后正式评审。readiness 阶段不运行测试、不写文件，ACK 必须绑定同一 host。
- attempt 2 重跑原 M2.2 四个 targeted domain/CLI test 文件，计数仍为 `29/29`；fresh full 必须至少 `555/555`，fail/skip/cancel/todo=`0/0/0/0`；coverage floors Lines/Branches/Functions=`94.36/89.65/99.57`。同时重新验证 PC-11..PC-13、TG=`TG-02,TG-04,TG-07,TG-13,TG-16,TG-19`、S2.3/S2.4 authority、I/X/P 失败面、零副作用与完整 control 时序。
- reviewer 输出固定为专属 exact-three `milestone-acceptance.json`、`scorecard.json`、`verdict.md`，并以新 historical subject 为唯一父提交。只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才允许主控创建状态为 `passed-awaiting-user-signoff` 的新 Result。
- attempt 2 即使 PASS，也不得改写 attempt 1 的 REVISE authority。精确 Result 的 user-signoff ACK 仍必须由用户另行明确会签；本计划不授权主控代替用户会签。

## 6. DoD、停止条件与非目标

- DoD：test-only candidate 经过独立审查；受控进入 main；新的 historical subject 身份固定；attempt 2 使用全新 packet/fence/ACK/独立 reviewer 完成重验；fresh targeted/full/coverage 和 I/X/P 全部满足硬门。
- 任一测试/覆盖率、角色隔离、ACK 时序、ref 差异、subject ancestry、allowlist、单父 CAS 或 exact-three 输出不成立时立即停止并保留证据；不得降低 coverage floor、增加测试计数来掩盖范围膨胀，或将 attempt 1 翻转为 PASS。
- 本计划不授权 user-signoff ACK、M2.2 completion、formal 移动、V2 cumulative packet/验收/完成、`v0.2.0-alpha` 打包或发布、CR-006 关闭、P5 完成、qualified real runs 计数变化。
- 不修改产品代码，不新增产品能力，不重写路线锁/产品真源/验收真源，不进入 V3/V4/Final Acceptance/S7/S8。
- 本计划提交本身只冻结 remediation 执行边界并追加两份留痕，不创建 packet、claim/fence、dispatch、候选、review、Result 或任何 ref 变更。
