# QA

当前阶段为 `P5 / V1` 持续落地。formal=F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`，control=`b006667d8c81bad3ff3ba5d022063e420c7097e2`。M1.1 已正式完成；S1.4 attempt 2 候选 `c2894cd...` 已通过 CV `PASS`、I/X/P `PASS / 99`、L3 `PASS / 98` 与 206/206 全量回归，下一步仅为 Final Snapshot 与正式提升链。S1.4、M1.2、V1、P5 尚未完成；旧代际结果仅作墓碑历史。

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

后续所有验证、阻塞、复测证据和质量缺口记录在本目录或 `.codex/verification-report.md`；当前路线与门禁以 `PROJECT_ROUTE_LOCK.md` 为准。
