# V2 / M2.2 Coverage Remediation Generation 3 执行计划

## 1. 冻结身份、入口与不可变历史

- 生命周期/路线：`S5 / P5 / V2 / M2.2 / remediation`。
- `stage_id=P5/V2/M2.2/remediation`，`task_id=M2.2-COV`，`route_generation=1`，`plan_generation=5`，`task_attempt=3`。
- 计划固定 parent/main=`0f3186979873216fe792cf88c0f4d9a4c61dff0a`、tree=`6cb6821a34a595c13754d2fa3bd9f8c888e6884d`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，入口 control=`4be4583553ece90ce80b18de6220d602d5382dd3`。任何后续控制动作仍须运行时重新读取 live main/formal/control，并使用精确 expected-old 单父 CAS；本计划不得覆盖已前进的 ref。
- attempt 2 candidate=`8d6a70d09c03d0cb6a4938bfbac2c512fe9df1f9`、independent review=`1b2b541c5f4fa0d41fe1a5aa8f36e1fa175f119f`、package-acceptance Result ref=`results/result-package-acceptance-m2.2-cov-g5-a2-f152-20260828.json`、digest=`sha256:6852fa81021d6fffddd9bd1fb1623ea5d4a69939750773009260ae9b45187f99`，结论=`REVISE / 96`、P0/P1/P2=`0/1/0`。三者只作为不可变 historical evidence 保留，不得集成、改写、重哈希替换或冒充 PASS authority。
- attempt 2 的独立 no-local fresh 证据为 domain=`6/6`、targeted=`29/29`、full=`555/555`、零 fail/skip/cancel/todo；Node native displayed=`94.34/89.70/99.57`，same-run raw Lines=`8357/8858=94.34409573267104%`、Branches=`3003/3348=89.69534050179212%`、Functions=`697/700=99.57142857142857%`。唯一 P1 是 Lines 未达到当轮冻结门槛；该 REVISE 不授权 main integration 或 state-sync。
- Generation 3 从固定 main parent `0f318697...` 独立重启，不继承 attempt 2 candidate 的一行 small-milestone null 断言，也不得 cherry-pick、squash、rebase 或合入 attempt 2 candidate/review。
- 本计划作者只负责计划候选，不参与后续实现或 entry review；计划候选本身不创建 packet、claim/fence、dispatch、ACK、Result 或任何完成 authority。

## 2. 唯一实现范围与精确补丁契约

- Generation 3 Execution Packet 的唯一 allowlist：`tests/domain/small-milestone.test.ts`。实现 agent 对其他任何路径均无写权限。
- 必须把现有单行 import：

  `import { evaluateVersionChain } from "../../src/domain/version-chain.ts";`

  精确替换为：

  `import { VersionChainError, evaluateVersionChain, parseVersionChainResult } from "../../src/domain/version-chain.ts";`

- 在既有测试 `权威 S2.2 parser、项目绑定、摘要与结果完整性全部 fail closed` 内，紧接现有 cyclic assertions 之后、`const result = evaluateSmallMilestonePlan(base);` 之前，加入且只加入以下两条断言。第二条就是本 Generation 的 null assertion；不得带入 attempt 2 historical-only 的 `evaluateSmallMilestonePlan(null)` 断言：

```ts
  assert.throws(
    () => parseVersionChainResult(cyclic),
    (error) => error instanceof VersionChainError && error.reasons.some((reason) => reason.code === "RESULT_INTEGRITY_MISMATCH"),
  );
  assert.throws(
    () => evaluateVersionChain(null),
    (error) => error instanceof VersionChainError && error.reasons.some((reason) => reason.code === "INVALID_VERSION_CHAIN"),
  );
```

- 第一条必须证明 circular unsafe result 由真实公开 `parseVersionChainResult` fail closed 为 `VersionChainError`，且 `reasons` 至少包含 `RESULT_INTEGRITY_MISMATCH`；第二条必须证明 null candidate 由真实公开 `evaluateVersionChain` fail closed 为 `VersionChainError`，且 `reasons` 至少包含 `INVALID_VERSION_CHAIN`。
- 候选 diff 必须精确为 exact-one file、numstat=`9+/1-`、净增=`8`：import replacement=`1+/1-`，两条四行断言=`8+`。不得改写现有 cyclic 断言、测试名称或任何其他行。
- 新增 test/it=`0`、fixture/snapshot/helper=`0`、生产/config/Schema/CLI/Skill/package/lock/dependency 改动=`0`。若冻结断言暴露产品契约差异，必须 fail closed 并进入新的变更分流，不得在本 packet 内修改生产代码。
- 这是 test-only coverage remediation，不改变 PC-11..PC-13、TG union、I/X/P 维度、P3/P4/S4 真源或 M2.2 产品语义。

## 3. 研究证据与 strengthened hard gates

- 隔离研究环境对第 2 节精确补丁连续两次执行 fresh full，均为 `555/555`、fail/skip/cancel/todo=`0/0/0/0`；两次 Node native displayed 均为 Lines/Branches/Functions=`94.47/89.85/99.57`，same-run raw 均为 Lines=`8368/8858=94.468277%`、Branches=`3009/3349=89.847716%`、Functions=`697/700=99.571429%`。
- 上述连续两次结果只证明该 exact-one 补丁具有可行性和波动余量，不是 Generation 3 implementation、candidate review、main state-sync 或 M2.2 acceptance authority；三层正式环境必须分别 fresh 重跑。
- 为防覆盖率波动，implementation worktree、fence154 independent candidate review 和 original-main-like state-sync 统一使用 strengthened hard gates：同次 Node native summary 两位 displayed Lines>=`94.40`、Branches>=`89.75`、Functions>=`99.57`；同一 Node native range aggregation raw Lines>=`94.40%`、Branches>=`89.75%`、Functions>=`99.57%`。
- 每次正式 full 都必须记录 Node native displayed、same-run raw covered/total 与精确比率；LCOV 仅可作为旁证，禁止替代、拼接或混算任一正式门槛，也禁止由两位 displayed 反推 raw counts。
- 三层环境均须通过：domain suite 精确 `6/6`；M2.2 四文件 targeted 精确 `29/29`；fresh `corepack pnpm check` 至少 `555/555` 且 fail/skip/cancel/todo=`0/0/0/0`；`git diff --check` 通过。
- 实现候选还必须证明 changed paths 精确等于唯一 allowlist、numstat=`9+/1-`、净增=`8`、测试发现数不变、没有 coverage ignore/no-op/unreachable/threshold/config padding，提交后 tracked clean。

## 4. 独立 entry review、packet 与 fence153 实现链

1. 本计划候选必须先形成单一提交、唯一父=`0f3186979873216fe792cf88c0f4d9a4c61dff0a`、写集 exact-three，并交给未参与本计划创作或后续实现的唯一独立 entry reviewer。
2. 只有 entry review=`PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]`，主控才可进入 Generation 3 packet preparation；任何 `REVISE`/`REJECT`、身份或证据缺口都必须停止，不得口头豁免。
3. packet 前主控必须重新核对 live main/formal/control、attempt 2 candidate/review/Result digest 与 historical-only 禁集成状态、`route_generation=1`、`plan_generation=5`、`task_attempt=3`，并把第 2 节 exact-one allowlist、精确补丁、numstat 和第 3 节 strengthened hard gates 完整固化进 packet。
4. packet、claim/fence153、dispatch-ready/outbox、dispatch ACK 必须分别使用独立 expected-old 单父 control CAS；不得复用 attempt 2 的 packet、claim、fence151、ACK、实现 host、fence152 reviewer 或 Result。
5. 只派发一个未参与本计划创作、entry review、Generation 1 实现或 Generation 2 实现的唯一新实现者。它必须固定 packet working parent=`0f318697...` 和 tree=`6cb6821...`，在隔离 worktree 中只拥有唯一 allowlist，并适配共享代码库中的并发工作而不回滚或覆盖他人改动。
6. ACK 固化前实现者只允许 readiness-only，不得安装、构建、测试、编码或提交；ACK 后才可先执行 offline/frozen 依赖安装、运行真实函数 probe，再用 `apply_patch` 落第 2 节精确补丁并执行第 3 节全部门禁。
7. 任一重复 claim、stale fence、ACK 前写入、角色复用、allowlist/numstat/测试数漂移、生产或配置改动、coverage artifact 不可核对或门槛失败，都必须把 attempt 3 标为 blocked/revision，禁止降低门槛或 padding coverage。

## 5. fence154 独立候选审查、线性集成与 state-sync

1. 实现候选只能交给另一个未参与本计划、entry review、Generation 1/2 实现、Generation 3 实现或既往 M2.2-COV 候选审查的唯一新 reviewer；候选 review 使用新的独立 packet/claim/fence154/ready/ACK 控制链。
2. fence154 reviewer 只消费冻结 candidate 和控制证据，不修改候选、main、control、formal 或 Result；它必须在独立隔离环境 fresh 复验 exact-one、`9+/1-`、两条真实公开函数断言、domain `6/6`、targeted `29/29`、full>=`555/555`、全零失败和第 3 节 displayed/raw strengthened hard gates。
3. 只有独立候选审查=`PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]`，主控才可重新解析 live main 并证明其仍等于允许的 expected-old，然后从 fixed parent 对 Generation 3 candidate 执行线性 fast-forward 集成；attempt 2 candidate/review 继续保持 historical-only，禁止一并集成。
4. 线性集成后必须在 original-main-like 环境重新执行 fresh domain、targeted、full 和同次 Node native displayed/raw coverage，完整满足第 3 节 strengthened hard gates。实现或 reviewer 环境的证据不得替代 state-sync。
5. original-main-like fresh PASS 后，主控才可用独立 expected-old 单父 control CAS 固化 state-sync PASS Result，并冻结线性集成提交为新的 M2.2 historical subject；任一 main 漂移、测试失败、coverage floor、写集或 artifact 门禁失败都必须 state-sync `REVISE`，不得冻结新 subject。
6. 只有 state-sync PASS 后，才允许基于新的 historical subject 准备 `P5/V2/M2.2/acceptance / M2.2-I-X-P / task_attempt=2` 的全新控制链；不得复用 M2.2 acceptance attempt 1、attempt 2 remediation review 或旧 Result/host/fence。

## 6. 明确非授权与本轮停点

- 本计划候选与未来 entry review 均不授权 Generation 3 packet、claim/fence153、dispatch、实现、fence154 candidate review、main integration、state-sync CAS 或 M2.2 acceptance attempt 2；每一步必须满足各自独立控制门禁。
- Generation 3 remediation 不授权用户会签、M2.2 formally-completed、formal 移动、V2 cumulative packet/完成、`v0.2.0-alpha`、CR-006 关闭、P5 完成或 qualified real runs 状态变化。
- 本轮计划写集严格为 `.codex/exec-plan-m2.2-coverage-remediation-generation-3.md`、`.codex/operations-log.md`、`.codex/verification-report.md` exact-three；不运行产品测试，不修改实现文件，不写 control/formal/main，不访问原工作树受保护未跟踪目标。
- 本轮停点是提交 exact-three 计划候选并交给新的独立 entry reviewer；本计划作者不得继续承担 entry review 或后续实现。
