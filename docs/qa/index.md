# QA

当前阶段为 `P5 / post-alpha / V3 Generation 2 / A3.0`。冻结 `v0.2.0-alpha` package 仍为 `local-candidate-usable`，不是稳定版。A3.0-A candidate=`696b03ec25e97c30e52576d971d14f1f565ea729`，independent review/integration main=`1825bcfd01feb796a795d20005577b5e7f26eae4`，review tree=`5b9d932d96786183a213b358c2cc1de379b9b242`；package acceptance attempt 2=`PASS / 100`、P0/P1/P2=`0/0/0`、fresh tests=`589/589`、coverage Lines/Branches/Functions=`94.06/89.05/99.35`、Result=`sha256:3c8203c1baea88227621eb1c1fe02f20e329e8bbd1e940610a8d147b140298f6`，integration control=`c9935db2d39d7990f7e28c8f70aecc7eb953b25e`。formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad` 未移动，`plan_generation=5`；真实项目 refs 未创建。下一唯一入口为 A3.0-B Execution Packet preparation；A3.0-B 尚未 packet/claim/fence/dispatch/编码。CR-006 仍 open、qualified real runs 0/3；V3、V4、Final Acceptance 与 P5 未完成。

## 当前质量状态

- [M1.1 累积验收 attempt 1](./p5-v1-m1.1-acceptance-2026-08-12.md)：`退回 / 73`。
- [当前项目状态偏移审查](../../.codex/reviews/current-project-state-drift-review-2026-08-12/verdict.md)：`REVISE / 66`。
- [当前项目状态偏移复审](../../.codex/reviews/current-project-state-drift-rereview-2026-08-12/verdict.md)：`REVISE / 75`。
- [当前项目状态偏移第三轮复审](../../.codex/reviews/current-project-state-drift-rereview-2-2026-08-12/verdict.md)：`REVISE / 92`。
- [当前项目状态偏移第四轮复审](../../.codex/reviews/current-project-state-drift-rereview-3-2026-08-12/verdict.md)：`PASS / 98`，P0=0、P1=0、`required_fixes=[]`。
- CR-004 已恢复三类 Frozen Requirement 身份、完整内容和 digest 连续性 `3/3`，并已于 2026-08-14 随 M1.1 会签关闭；历史证据保留。
- CR-005 generation 4 新链已完成 F12/F13 正式提升，并已于 2026-08-14 随 M1.1 会签关闭；历史实施与证据保留。
- [M1.1 attempt 2 累积验收](./p5-v1-m1.1-acceptance-attempt-2-2026-08-13.md)：`PASS / 97`，I/X/P 全部通过，P0=0、P1=0、`required_fixes=[]`；2026-08-14 用户会签已固化。
- [S1.3 generation 4 L3 attempt 1](../../.codex/reviews/p5-v1-m1.1-s1.3-generation-4-l3-2026-08-13/verdict.md)：`REVISE / 82`，历史问题已由 attempt 3 修复。
- [S1.3 generation 4 L3 attempt 2](../../.codex/reviews/p5-v1-m1.1-s1.3-generation-4-l3-a2-2026-08-13/verdict.md)：`PASS / 98`，P0=0、P1=0、`required_fixes=[]`。
- [S1.4 candidate verification attempt 2](../../.codex/reviews/p5-v1-m1.2-s1.4-candidate-verification-r2-2026-08-14/verdict.md)：`PASS`。
- [S1.4 independent I/X/P attempt 2](../../.codex/reviews/p5-v1-m1.2-s1.4-independent-ixp-r2-2026-08-14/verdict.md)：`PASS / 99`；其中 self-profile 身份在 verdict 的一处叙述发生转写错误，正确值以 fixture/CV/L3 复算为准：Product Definition `pd-7913f81f...`、digest `096428a4...`、carrier digest `2a582889...`。
- [S1.4 L3](../../.codex/reviews/p5-v1-m1.2-s1.4-l3-2026-08-14/verdict.md)：`PASS / 98`，五条硬门禁全过；仅允许进入 Final Snapshot 与正式提升链。
- [S1.4 Final Verification](../../.codex/reviews/p5-v1-m1.2-s1.4-final-verification-2026-08-14/verdict.md)：`PASS / 98`，206/206、331/331 protected manifest 与项目外 Credential 通过。
- S1.4 Anchor Verification：`PASS / 98`；Anchor Proof=`sha256:8f1ca64045e7c2e8900b7455db86f3503a61473b5fc8652d38a5036e6e0d7475`。同一验证运行曾生成并立即删除一枚未被 control 引用的错误摘要 proof；accepted proof 使用不同内容寻址路径并通过 no-replace/fsync/重读复核，该执行异常已在 proof 与 control Result 中留痕。
- S1.4 formal promotion：expected-old=F13 CAS 成功，formal=F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3`。
- S1.5 formal promotion：expected-old=F14 CAS 成功，formal=F15 `7169e9b019fe2213ca76babb4122a84760bdf112`；FV/AV=`PASS / 100`，444/444。
- S1.6 formal promotion：expected-old=F15 CAS 成功，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；FV/AV=`PASS / 100`，474/474，Q3=100%、Q11=20/20。
- [M1.2 attempt 1 累计验收与用户会签结果](./p5-v1-m1.2-acceptance-attempt-1-2026-08-24.md)：`PASS / 100`，I/X/P/Profile=`25/25/25/25`，P0/P1/P2=`0/0/0`；终审与用户会签 CAS 均已完成，M1.2 正式完成。
- [V1 cumulative acceptance attempt 5 与用户会签候选](./p5-v1-cumulative-acceptance-attempt-5-2026-08-24.md)：`PASS / 100`，474/474、12 sections、17/17 source、PC=8/8、TG=18/18；用户会签、user-signoff ACK 与 V1 formally-completed CAS 已完成，当前仅作历史验收与会签证据。
- [CR-006 cumulative acceptance attempt 1](../../.codex/reviews/p5-cr006-cumulative-acceptance-attempt-1-2026-08-26/verdict.md)：replacement review=`813e9fd`，`PASS / 97`，P0/P1/P2=`0/0/3`。SG-1 两项 P2、SG-2 一项 P2 继续保留；SG-3 evidence-binding 威胁模型边界和真实运行 `0/3` 继续保留。该 PASS 不自动关闭 CR-006，不创建 V2 packet，也不移动 formal。
- V2 entry reassessment attempt 2：review=`cb28627`，因同一 reviewer 创作被审尾差 subject=`ccc182e` 后自审而 `invalid / superseded`，不得作为放行证据。
- [V2 entry reassessment attempt 3](../../.codex/reviews/p5-v2-entry-reassessment-after-cr006-attempt-3-2026-08-26/verdict.md)：review=`bd78c043`、tree=`1509a217`，`PASS / 100`，P0/P1/P2=`0/0/0`，fresh `503/503`、coverage `93.53/88.69/99.22`；仅放行状态同步与形成精确 S2.1 packet 授权请求。
- S2.1 generation 5 attempt 2：candidate=`67dae282`，独立 exact-two review=`3424a8a5`，package acceptance=`PASS / 100`、P0/P1/P2=`0/0/0`；验收 `514/514`，main `514/514`。integration checkpoint=`24ef30a`；其历史下一入口已由 S2.2 有效验收 supersede。
- S2.2 generation 5：candidate=`d35e63d`。attempt 1 temporal-invalid、attempt 2 role-authority-invalid 均只保留为无效历史；attempt 3 独立 review=`6c48b6c`，`PASS / 100`，有效 Result digest=`sha256:332323df803af638aac65a6044d0cf17a171dc8ff5744e213385f18fda089c0e`。
- S2.3 generation 5：attempt 1 M2.1 identity/fence140 永久无效；corrected attempt 2 candidate/review 已进入 main，独立 package acceptance=`PASS / 100`、P0/P1/P2=`0/0/0`，Result digest=`sha256:89e9b721870d1685fd0e1c0172b88ce9f6d8fec04fc2b867c302443f0d867408`。
- S2.4 generation 5：attempt 1 candidate/review=`12fc174` / `c4c984c`，结论=`REVISE / 70`；attempt 2 candidate/review=`45a3eb0` / `411f2ef`，独立 package acceptance=`PASS / 100`、P0/P1/P2=`0/0/0`、root fresh `555/555`、coverage=`94.36/89.65/99.57`，Result digest=`sha256:08901d9dea24d90e81a5d7535cdde3402c32bd15b7046a3b1082baeffc9f434f`，状态=`gate-passed/present-in-main`。其历史下一入口是 M2.1 验收计划冻结与独立入口评估，现已由后续 V2 完成链 supersede。
- [V2 cumulative acceptance attempt 1](./p5-v2-cumulative-acceptance-attempt-1-2026-08-29.md)：independent review=`68888402063b36c75c73e8fe937984781b307d71`、signoff package review=`5d389712431c52352df4b5b50d1fa16e97ea3fc0`，`PASS / 100`、P0/P1/P2=`0/0/0`；Result control=`82e20134381a8a21891babaca6484f54de236974`，用户 ACK=`44993d1789177cbc1e177c422a0adff4fb8f74b1`，分离 completion=`4f466224a442dd9650905722398bfad743e327fa`。该历史记录当时保留的 alpha 入口已由后续独立 package acceptance supersede；CR-006/formal/V3+ 边界仍保留。
- [v0.2.0-alpha package acceptance attempt 3](../../.codex/reviews/p5-v020-alpha-package-acceptance-g5-ap1-a3-f162-2026-08-29/verdict.md)：`PASS / 100`、I/X/P/Profile=`25/25/25/25`、P0/P1/P2=`0/0/0`；Result digest=`sha256:b22a83615695375102a7a3841c27e6936ca6793feab3151a5a5a1e420bf2fbe4`、Result control=`25f5e5a18aae9f87ad6f0dce43513fbbe183fcc1`，integration main=`67438b527a7a88c6cc99c661b6f3d260d24e6877`。冻结项目外 tarball offline smoke 通过，状态=`local-candidate-usable`；不代表 tag/publish/formal 移动/用户级 Skill 安装、CR-006、V3/V4/Final Acceptance/P5 完成。
- A3.0-A package acceptance attempt 2：candidate=`696b03ec25e97c30e52576d971d14f1f565ea729`，review/integration main=`1825bcfd01feb796a795d20005577b5e7f26eae4`，review tree=`5b9d932d96786183a213b358c2cc1de379b9b242`；`PASS / 100`、P0/P1/P2=`0/0/0`、fresh `589/589`、coverage=`94.06/89.05/99.35`，Result digest=`sha256:3c8203c1baea88227621eb1c1fe02f20e329e8bbd1e940610a8d147b140298f6`，integration control=`c9935db2d39d7990f7e28c8f70aecc7eb953b25e`。结论只覆盖只读 inspect 与零写入，不代表 activation、adopted baseline、真实项目接入、A3.0/V3 完成或 formal 移动。

后续所有验证、阻塞、复测证据和质量缺口记录在本目录或 `.codex/verification-report.md`；当前路线与门禁以 `PROJECT_ROUTE_LOCK.md` 为准。
