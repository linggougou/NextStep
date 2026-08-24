# QA

当前阶段为 `P5 / V2 entry-evaluation`。formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，control=`6d5120078a137ecf74b4a4b58cbcba37a61b7148`。V1 attempt 5 累计验收与独立 L3 均 `PASS / 100`，会签包 replacement 终审=`PASS / 99`，精确用户会签、ACK 与独立 completion CAS 已完成，V1 已 formally-completed。当前只允许独立 V2 入口评估；P5 未完成，V2 packet、dispatch 与编码未授权，旧 attempt 仅作墓碑历史。

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
- [V1 cumulative acceptance attempt 5 与用户会签候选](./p5-v1-cumulative-acceptance-attempt-5-2026-08-24.md)：`PASS / 100`，474/474、12 sections、17/17 source、PC=8/8、TG=18/18；当前仅为会签候选，用户尚未会签。

后续所有验证、阻塞、复测证据和质量缺口记录在本目录或 `.codex/verification-report.md`；当前路线与门禁以 `PROJECT_ROUTE_LOCK.md` 为准。
