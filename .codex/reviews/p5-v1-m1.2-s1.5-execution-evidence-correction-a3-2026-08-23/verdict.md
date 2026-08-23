# S1.5 attempt 3 Execution Evidence Correction 裁决

评审对象：`git:f226e0fce689284b5f02747784d82c09c47b3ec5`（tree `c5d2e7c2a22023970d4a73feba856afdd44cd891`）

固定 packet：`git:4dd2b7fd368d64fa440774fbd7a70fefb2e32b00:packets/ep-p5-v1-m1.2-s1.5-g4-a3-20260823.json`

claim / fence：`claim-s1.5-g4-a3-evidence-f86-20260823` / `86`

权威验证窗口 control 起点：`c70b34266882a31f140c9e5d07d89e0aafb6e3b2`

## 结论

**PASS / 100**，P0/P1/P2 = **0/0/0**，七条 execution evidence correction 硬门全部通过。

本轮只纠正 attempt 3 的隔离执行证据：精确 subject 在 Node `v24.14.0`、pnpm `10.33.2` 下可重复得到 `353/353`、0 fail。attempt 2 immutable Execution Result 中的 `374/374` 声称和 attempt 2 Candidate Verification 的 `REJECT / 78` 原样保留，不被回写、豁免或包装为通过。

## 执行证据

- 全新隔离 worktree 初始不存在 `node_modules`。`pnpm install --offline --frozen-lockfile` 退出 0，10 个包全部从本地复用，下载数为 0。
- `pnpm check` 退出 0，typecheck、build 与 coverage 全部通过；原始测试汇总为 353 tests、353 pass、0 fail、0 cancelled、0 skipped、0 todo。
- 计数交叉核对为 36 个 source test files、36 个 compiled test files、337 个顶层通过项加 16 个 nested subtest，共 353。
- 覆盖率为 Lines `92.82%`、Branches `87.62%`、Functions `99.00%`，逐项高于 F14 基线 `91.07 / 83.80 / 98.36`。
- packet digest `sha256:35f2a9595b108f2fe10aaaf02981c4c60d07e1080e24082128e418e6f2caa139`、dedup key `sha256:e5bf8635d654d7fc53c21a8c8cd699a8f1f0bccf2aad770812ed4b7d7cc388df` 与 subject digest `sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30` 均经 RFC8785/JCS 独立复算匹配。
- 原始 working parent `a028bb7…` 到 subject 的 38 条 changed paths 与 attempt 2 Execution Result 的 `changed_paths` 集合精确恒等，双方差集为空。
- 验证窗口内 main=`f226e0f…`、formal=F14 `024c1db…`、control=`c70b342…`、subject tree=`c5d2e7c…` 均不变；产品代码、测试、Schema、Skill、依赖与文档未修改。review 分支相对 subject 只新增本目录的 `scorecard.json` 与 `verdict.md`。

## 历史与门禁边界

attempt 2 的 `374/374` 不是本轮通过项。本轮的新证据明确记录 attempt 2 CV `REJECT / 78`，并以新的 attempt 3 固定环境解释正确测试口径：`337 top-level + 16 nested = 353`。

本 PASS 仅允许主控据此形成新的 immutable attempt 3 Execution Result，并重新派发独立 Candidate Verification。不得复用 attempt 2 的 CV 或 I/X/P 作为 attempt 3 双门结论；不得启动 L3、Final Verification、Anchor、F14→F15 CAS、S1.6，也不构成 S1.5、M1.2、V1 或 P5 完成。
