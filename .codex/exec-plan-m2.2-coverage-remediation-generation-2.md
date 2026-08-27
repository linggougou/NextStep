# V2 / M2.2 Coverage Remediation Generation 2 执行计划

## 1. 冻结身份、入口与不可变历史

- 生命周期/路线：`S5 / P5 / V2 / M2.2 / remediation`。
- `stage_id=P5/V2/M2.2/remediation`，`task_id=M2.2-COV`，`route_generation=1`，`plan_generation=5`，`task_attempt=2`。
- 计划固定 parent/main=`ea342c25bda8191f1dbc001458acb130ce1d581a`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，入口 control=`c8d01e75b4a07ec5225af847eebccf4363a3e8dd`。任何后续控制动作仍须运行时重新读取 live main/formal/control，并使用精确 expected-old 单父 CAS；本计划不得覆盖已前进的 ref。
- state-sync `REVISE` Result digest=`sha256:633528e46fb525ef8f648644007bd6cfbc311dd9fa61732de2ab5d05bba11a57` 是 Generation 2 的唯一退回入口权威。它只说明 original-main-like fresh 的 Branches 未达本轮门槛，不得被解释为 attempt 1 候选或独立审查失败。
- attempt 1 candidate=`68710ca8146ee79e8ce00bd06c93509455da58f0`、independent review=`ea342c25bda8191f1dbc001458acb130ce1d581a` 与完整 PASS authority 均保持有效、不可改写、不可删除、不可重哈希替换。PASS authority 的 kind 精确为 `package-acceptance Result`，ref=`results/result-package-acceptance-m2.2-cov-g5-a1-f150-20260828.json`，digest=`sha256:f4a0407ea5350bb10fc1b5724e296207ab742844480366433534f0cb391a8b31`，Result control=`eae5af53317c7c24104a2a8254482904c495a6be`；短哈希、candidate、review 或 state-sync Result 均不得替代该 authority。Generation 2 必须线性建立在这些历史之上，不得 amend/rebase/压平 attempt 1。
- attempt 1 original main fresh=`555/555`、fail/skip/cancel/todo=`0/0/0/0`、Lines/Branches/Functions=`94.36/89.64/99.57`；仅 Branches=`89.64 < 89.70` 触发 state-sync `REVISE`。测试通过数、Lines 与 Functions 不能抵消该硬门失败。

## 2. 唯一实现范围与精确测试契约

- Generation 2 Execution Packet 的唯一 allowlist：`tests/domain/small-milestone.test.ts`。实现 agent 对其他任何路径均无写权限。
- 只允许在既有测试 `权威 S2.2 parser、项目绑定、摘要与结果完整性全部 fail closed` 内加入且只加入一条断言：

  `assert.throws(() => evaluateSmallMilestonePlan(null), expectCode("INVALID_SMALL_MILESTONE"));`

- 不得新增 `test(...)`/`it(...)`、fixture、snapshot、helper、依赖或文件；不得修改现有 cyclic 断言、测试名称、测试数量或其他失败面。
- 不得修改 `src/**`、Schema、CLI、Skill、package/lock、配置或生产行为。若该断言暴露生产契约差异，必须 fail closed 并进入新的变更分流，不得在本 packet 内修生产代码。
- 这是覆盖率状态同步后的第二次 test-only remediation，不改变 PC-11..PC-13、TG union、I/X/P 维度、P3/P4/S4 真源或 M2.2 产品语义。

## 3. 计划入口、packet 与 fence151 实现链

1. 本计划候选必须先接受唯一独立 entry review；只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才可进入 Generation 2 packet preparation。
2. 主控重新核对 formal、live control、live main、state-sync REVISE Result digest、attempt 1 三项不可变 authority、`route_generation=1` 与 `plan_generation=5` 后，以单独 expected-old 单父 control CAS 创建唯一 `M2.2-COV / task_attempt=2` Execution Packet；allowlist 必须精确等于第 2 节单一路径。
3. packet、claim/fence151、dispatch-ready/outbox、dispatch ACK 必须分别使用独立 expected-old 单父 control CAS；不得复用 attempt 1 的 packet、claim、fence149、ACK、实现 host 或 review authority。
4. 只派发一个未参与本计划创作、entry review、控制面写入、attempt 1 实现或 attempt 1 候选审查的唯一实现 subagent。它必须在隔离 worktree 中固定 packet working parent；ACK 固化前只允许 readiness-only，不得安装、测试、编码或提交。
5. ACK 后实现 subagent 先执行 offline/frozen 依赖安装，再只落第 2 节单条断言。它不得自审、合入 main、创建 Result 或写 control/formal。
6. 任一身份漂移、重复 claim、stale fence、ACK 前写入、allowlist 越界、测试数量变化、生产/配置改动或门槛失败，都必须把本 attempt 标为 blocked/revision，禁止口头豁免。

## 4. 实现验证与独立候选审查 fence152

- 实现候选至少执行：受影响 domain suite 精确 `6/6`；M2.2 四文件 targeted 精确 `29/29`；fresh `corepack pnpm check` 至少 `555/555` 且 fail/skip/cancel/todo=`0/0/0/0`；`git diff --check` 通过。
- coverage 必须按同一次运行分别报告且不得混算：第一层是 `pnpm check` 的 Node native summary 两位显示值；第二层是同一 Node native range aggregation 的原始 covered/total 与精确比率；第三层 LCOV reporter 只允许作为旁证，不得替代前两层、不得把 LCOV covered/total 与 Node native summary 拼接成门禁结论。实现 worktree 的结果仅是候选证据，不得替代后续 original-main-like fresh state-sync。
- 候选必须形成单一提交、唯一父等于 packet working parent、exact-one 写集等于 `tests/domain/small-milestone.test.ts`，提交后 tracked clean。
- 候选交给另一个未参与计划、entry review、实现或控制面写入的唯一独立 reviewer；review claim/fence 固定为 fence152。reviewer 只消费冻结候选和控制证据，不修改候选或 refs。
- reviewer 必须证明 exact-one、单条 null 断言、测试数不变、无生产/配置/依赖变化、domain `6/6`、targeted `29/29`、full 至少 `555/555`、零 fail/skip/cancel/todo；同次 Node native summary 两位显示值达到 Lines>=`94.36`、Branches>=`89.70`、Functions>=`99.57`，同一 Node native range raw 比率达到 Lines>=`94.36%`、Branches>=`89.69%`、Functions>=`99.57%`，且 `git diff --check` 通过。LCOV 不得替代或混算这些硬门。
- 独立候选审查只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才允许线性集成；否则保持 attempt 1 历史有效并为 Generation 2 登记 revision，不得合入 main。

## 5. 线性集成与 original-main-like fresh state-sync

1. 候选 PASS 后，主控重新解析 live main 并验证其仍是 packet 冻结链允许的 expected-old；只允许线性 fast-forward 集成候选，不得 cherry-pick、squash、rebase 或改写 attempt 1/2 历史。
2. 集成后必须在 original-main-like 环境重新执行 fresh full 与 coverage，而不是复用实现 worktree 或 reviewer 的结果。正式硬门先按同次 `pnpm check` 的 Node native summary 两位显示值判定：Lines>=`94.36`、Branches>=`89.70`、Functions>=`99.57`；同时必须从同一 Node native range aggregation 记录原始 covered/total，并分别重算 raw Lines ratio>=`94.36%`、raw Branches ratio>=`89.69%`、raw Functions ratio>=`99.57%`。full 至少 `555/555` 且 fail/skip/cancel/todo=`0/0/0/0`。LCOV reporter 只能旁证，不能替代、拼接或混算任一正式硬门。
3. 临时注入实测 `555/555`；同一 Node native range raw Lines=`8360/8858=94.377963%`、Branches=`3003/3348=89.695341%`、Functions=`697/700=99.571429%`，只满足 raw floors=`94.36%/89.69%/99.57%`；对应 Node native summary 两位显示=`94.38/89.70/99.57`，满足 displayed floors=`94.36/89.70/99.57`。不得声称 raw Branches>=`89.70%`。这些数值只证明该最小断言具备可行性，不是候选审查、main state-sync Result 或后续验收 authority；正式结论必须来自线性集成后的 fresh 运行。
4. original-main-like fresh PASS 后，主控才可用独立 expected-old 单父 control CAS 固化新的 state-sync PASS Result，并冻结该线性集成提交为新的 M2.2 historical subject；PASS Result 与 subject 身份必须相互绑定且可重算。
5. 任一 fresh 指标未达标、测试不为零失败、main 漂移、写集不精确或覆盖 artifact 不可核对时，state-sync 必须 `REVISE`；不得冻结新 subject，不得进入 M2.2 attempt 2。

## 6. M2.2 attempt 2 入口与明确非授权

- 只有第 5 节 state-sync PASS 后，才允许基于新 historical subject 准备全新的 `P5/V2/M2.2/acceptance / M2.2-I-X-P / task_attempt=2` 控制链；不得复用 M2.2 acceptance attempt 1 的 packet、fence148、reviewer、Result 或 host。
- 新 historical subject 只能是通过线性集成和 original-main-like fresh PASS 的提交，不得使用实现候选、独立 review commit、临时注入工作树或 live 漂移提交替代。
- 本计划候选与 entry review 本身不授权 Generation 2 packet、claim/fence151、dispatch、实现、review fence152、main 集成、state-sync CAS 或 M2.2 attempt 2 acceptance packet；每一步仍须满足对应控制门禁。
- 本计划及 Generation 2 remediation 不授权 user-signoff、M2.2 formally-completed、formal 移动、V2 cumulative packet/完成、`v0.2.0-alpha`、CR-006 关闭、P5 完成或 qualified real runs 状态变化。
- 本轮计划写集严格为本文件、`.codex/operations-log.md`、`.codex/verification-report.md` exact-three；不运行产品测试，不修改产品文件，不访问原仓库受保护未跟踪目标，不改 `refs/nextstep`。
