# QA

当前阶段为 `P5 / V1 / M1.1` 缺口处理。代码基线 `pnpm check` 为 `123/123`；已墓碑、未形成候选的 S1.3 generation 3 attempt 2 曾达到 `125/125`，不能作为当前 HEAD 测试数或正式候选证据。

## 当前质量状态

- [M1.1 累积验收 attempt 1](./p5-v1-m1.1-acceptance-2026-08-12.md)：`退回 / 73`。
- [当前项目状态偏移审查](../../.codex/reviews/current-project-state-drift-review-2026-08-12/verdict.md)：`REVISE / 66`。
- [当前项目状态偏移复审](../../.codex/reviews/current-project-state-drift-rereview-2026-08-12/verdict.md)：`REVISE / 75`。
- [当前项目状态偏移第三轮复审](../../.codex/reviews/current-project-state-drift-rereview-2-2026-08-12/verdict.md)：`REVISE / 92`。
- [当前项目状态偏移第四轮复审](../../.codex/reviews/current-project-state-drift-rereview-3-2026-08-12/verdict.md)：`PASS / 98`，P0=0、P1=0、`required_fixes=[]`。
- CR-004 已恢复三类 Frozen Requirement 身份、完整内容和 digest 连续性 `3/3`，但产品语义链尚未正式闭环。
- CR-005 已通过独立审查并获用户批准；当前仅授权进入 generation 4 管理面和 S1.2 新链，尚未生成任务包或移动 formal。

后续所有验证、阻塞、复测证据和质量缺口记录在本目录或 `.codex/verification-report.md`；当前路线与门禁以 `PROJECT_ROUTE_LOCK.md` 为准。
