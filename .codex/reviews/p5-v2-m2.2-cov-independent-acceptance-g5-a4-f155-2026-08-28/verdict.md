# 结论

`PASS / 100`。固定候选 `a8ba3dae236f3978fd4e97c4ce0062cf81a25b9d` 通过 M2.2 coverage remediation generation 5 attempt 4 的唯一独立 package acceptance；P0/P1/P2=`0/0/0`，`required_fixes=[]`。

本结论只证明不变 test-only 候选在完整 ACK/control/evidence 封装 clone 中，通过了 fresh 摘要复算、targeted/full 验证、displayed coverage 和 same-range raw coverage。它不创建 Result，不授权 reviewer 合入 main、改 refs、移动 formal/control 或同步状态，也不完成 M2.2、V2、`v0.2.0-alpha`、CR-006、formal 或 P5。

## 为什么

1. `HG1-HG4` 全部成立：attempt4 packet=`sha256:26840b36e8814edce50f2525cd9f5d1599b4f96caca23cd1fdfc8bb80a295ceb`、dedup=`sha256:502126f8e15ceb584f20be774449d8b47433695a8c1ebf5288cea9d0b1381220`、subject=`sha256:ff7b2f5e029c7030ad72d44e5177f16440cc2b40dfeb4e279909cc418492e6fd`、Execution Result=`sha256:c3c93a4bb91758f9dbeb543e736c2db8025fa6fca6e0bddcbdd3263ccdee8907`、attempt1-3 acceptance Results 全部经 current-turn RFC8785 复算命中；control 单父链为 `cc60b8d -> bb78415(packet) -> 094748f(claim) -> 4899b85(ready) -> 63f8c9e(ACK)`。review start 时 `refs/nextstep/control` 与 `refs/nextstep/evidence/m2.2-cov-acceptance-ack-f155` 同指向 `63f8c9ed`，且 `review_started_at=2026-08-27T19:45:46Z` 晚于 `accepted_at=2026-08-27T19:43:33Z` 与 `evidence-import-completed_at=2026-08-27T19:44:44Z`。
2. `HG5-HG7` 全部成立：候选相对 `cd69728` 只改 `tests/domain/small-milestone.test.ts` 一处，`9+/1-`，`test()/it()` 与 helper 新增均为 `0`，只增加 `2` 条断言。direct probes 精确确认 `parseVersionChainResult(cyclic)` 命中 `RESULT_INTEGRITY_MISMATCH`、`evaluateVersionChain(null)` 命中 `INVALID_VERSION_CHAIN`。targeted=`29/29`；same-run multi-reporter full 在与 `pnpm check` 对齐的 54 个测试文件上得到 `555/555`；同次 Node native displayed coverage=`94.60/90.01/99.57`，同次 raw coverage=`8380/8858`、`3026/3362`、`697/700`，全部超过 strengthened floors `94.40/89.75/99.57`。
3. `HG8-HG12` 全部成立：没有 production、schema、CLI、Skill、fixture、dependency、config、threshold、exclusion 或 test-count 漂移；`git diff --check` 通过，验证后工作树保持 clean，remote=0、alternates=false。Generation3 plan `c4445e5a8dbd7dd5102355a34dfa8248bb04f069`、entry review/main `cd69728eb52476e7d0788a0b6f2df0f9fcdd2702` 和 attempt3 REVISE `sha256:12120b457bdd1fbc4b505f856c7c53d3c80136bd1ef44d2b9641bb579f8bb816` 都继续可追溯且未被升级。当前 reviewer 只允许写 exact-two。

## 必须修改

无。当前 attempt4 满足 `PASS / 100` 所需全部硬门和维度门槛。

## 证据

1. 候选身份：`commit=a8ba3dae236f3978fd4e97c4ce0062cf81a25b9d`，`tree=4e4d0162fcac237040acc40f0996ecefd1a079a6`，`parent=cd69728eb52476e7d0788a0b6f2df0f9fcdd2702`，`blob=e83ec39b3d2d0482f667c69c7949cfe4458bd9b0`，raw `sha256=b61593ba83498146fb7e6ff904181e4cbccddffeffb35ea22bcf013c9048e95f`。
2. fresh 验证：`node --test dist/tests/domain/small-milestone.test.js dist/tests/cli/small-milestone.test.js dist/tests/domain/execution-packet.test.js dist/tests/cli/execution-packet.test.js` => `29/29`；same-run multi-reporter full => `555/555`，displayed coverage `94.60 / 90.01 / 99.57`。
3. same-run raw coverage：同次 full run 的 LCOV reporter raw counters `LH/LF=8380/8858`、`BRH/BRF=3026/3362`、`FNH/FNF=697/700`，对应 `94.603748024385 / 90.005948839976 / 99.571428571429`。
4. review 边界：allowed output 仅 `.codex/reviews/p5-v2-m2.2-cov-independent-acceptance-g5-a4-f155-2026-08-28/{scorecard.json,verdict.md}`；reviewer 不创建 Result、不改 `main/formal/control`、不写 refs、不访问原仓库。
