# 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。M1.1 attempt 2 用户会签包修订候选（R3 终审）通过独立 L3 终审，可提交用户会签。

本 PASS 只覆盖会签包修订文本与必要留痕。M1.1 当前仍为“等待用户会签”；本终审不执行 CAS、不移动 control/formal、不重建 Result、不授权也不启动 S1.4。M1.1 attempt 2 验收本体 `PASS / 97` 维持不变。V1、P5 未完成。

# 为什么

1. REVISE/94 的两项必修（三个 P2 完整披露、覆盖率当前口径）已在提交 `f9bbc89...` 关闭并经本轮复核；REVISE/83 的四项必修（会签效果改写、S1.4 授权隔离、撤回无证据终审 PASS 声明、仅文档/留痕修订）在本轮未提交候选中逐项落地。
2. 三个 P2 在验收报告 §8、会签请求 §9、会签 verdict 必须修改节中逐字列全，均标注不阻塞 M1.1 会签、由宿主相关里程碑承接；与 control Result risks 的三项 P2、已提交 scorecard `severity_summary=0/0/3` 一致。
3. 覆盖率口径统一为可重复值 `148/148`、Lines `90.90%`、Branches `82.94%`、Functions `98.40%`（formal F13 隔离副本与 HEAD `9aef41a...` 独立复跑）；旧 `90.74% / 82.75% / 98.40%` 仅作为不可映射旧运行上下文记录出现，不再标为当前 main 口径。
4. 会签状态转移正确且可执行：批准前“等待用户会签”；用户批准后主控实时重读 formal/control/Result digest/`plan_generation=4`，以实时 expected-old control CAS 固化；CAS 成功后 M1.1 正式完成并关闭 CR-004/CR-005 的 M1.1 会签缺口，V1/P5 仍未完成；读取不一致或 CAS 失败则不固化、不标记完成，继续保持等待会签。该语义与 CR-004 §7、CR-005 §13 关闭条件一致，不再有“会签后 M1.1 仍未完成”的自相矛盾表述。
5. S1.4 授权隔离清晰：本次会签不授权启动 S1.4；固化后只允许单独评估 S1.4 入口，生成 packet、编码、派发仍需后续明确动作。control 中 `pending_dispatch_messages=[]` 且无任何 S1.4 对象。
6. 此前“最终独立文档终审 PASS、必须修复项 0”的既成声明已在 operations-log 与 verification-report 中撤回，注明无对应产物、等待新的独立终审；本终审包即该等待中的新终审产物，此前不存在任何终审 PASS 既成声明。
7. 变更范围合规：未提交变更仅为验收报告、会签 verdict、两处 `.codex` 留痕修订与未提交的 REVISE/83 历史审查包；相对 formal F13，src/tests/schemas/skills/package.json/pnpm-lock.yaml 无差异；未重跑 `pnpm check`、未重建 Result、未移动 control/formal。

# 必须修改

无。`required_fixes=[]`。

后续动作边界（非修改项）：

- 用户明确批准后，主控必须先实时重读并确认 formal=`84c051f7426ec5d2a9bed70aa02a1f321bd81e11`、control=`380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`、Result digest=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`、`plan_generation=4` 均未变化，再以实时 expected-old control 执行 CAS 固化 user sign-off。
- CAS 成功后才可标记 M1.1 正式完成并关闭 CR-004/CR-005 的 M1.1 会签缺口；CAS 失败或读取不一致则不固化、不标记完成。
- 本次会签不授权启动 S1.4；固化后仅允许单独评估 S1.4 入口，packet、编码、派发需后续明确动作。

# 证据

- HEAD：`f9bbc89b042b063d1fc4367cd9ddebd554142a1a`；未提交变更：`docs/qa/p5-v1-m1.1-acceptance-attempt-2-2026-08-13.md`、`.codex/reviews/p5-v1-m1.1-attempt-2-2026-08-13/verdict.md`、`.codex/operations-log.md`、`.codex/verification-report.md`、未跟踪 `.codex/reviews/p5-v1-m1.1-attempt-2-signoff-package-rereview-2026-08-13/`。
- 实时 refs（本轮终审读取）：`refs/nextstep/formal=84c051f7426ec5d2a9bed70aa02a1f321bd81e11`；`refs/nextstep/control=380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`。
- 实时 control 状态：checkpoint `plan_generation=4`、`user_signoff.status=pending`、`next_stage="M1.1 attempt 2 awaiting user sign-off"`；registry `M1.1-I-X-P status=awaiting-user-signoff`、`pending_dispatch_messages=[]`、无 S1.4 任务。
- Result digest 独立复算：对 `control:results/result-milestone-acceptance-m1.1-g4-a2-f72-20260813.json` 仅排除 `result_digest` 后按 RFC8785/JCS 归一化计算，得 `sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`，与 Result 自述及登记一致；Result 记录 `gate_conclusion=通过`、`score=97`、I/X/P=`通过/通过/通过`、`severity_summary=0/0/3`、`required_fixes=[]`。
- control 父链：`380e4ba...` 单父 `dcf3e933...`，该提交仅新增 Result 与会签请求消息、更新 registry/checkpoint。
- 范围核验：`git diff --name-only 84c051f7426ec5d2a9bed70aa02a1f321bd81e11 HEAD` 相对 src/tests/schemas/skills/package.json/pnpm-lock.yaml 为空。
- 语义核验：四份候选文件中“即使完成本次会签/会签后仍未完成”类错误语义 grep 无残留；`dcf3e933` 未出现在验收报告与会签 verdict 中；新增行日期全部为 `2026-08-13`。
- 历史审查链：`.codex/reviews/p5-v1-m1.1-attempt-2-signoff-package-review-2026-08-13/`（`REVISE / 94`，P0/P1/P2=0/1/1）、`.codex/reviews/p5-v1-m1.1-attempt-2-signoff-package-rereview-2026-08-13/`（`REVISE / 83`，P0/P1/P2=0/1/1）、`.codex/reviews/p5-v1-m1.1-attempt-2-2026-08-13/`（验收本体 `PASS / 97`）。
- CR 关闭条件：`docs/change-requests/004-m1-1-cross-stage-fixture-continuity-gap.md` §7、`docs/change-requests/005-product-definition-semantic-contract-gap.md` §13。
- 本轮未运行 `pnpm check`，未修改任何 refs、提交或生产内容；`git diff --check` 通过（见留痕）。
- 终审后措辞增量确认：docs/qa §9 会签引文精化为“满足 M1.1 完成条件；授权主控在重新核对 formal/control/Result/plan_generation 身份后，以实时 expected-old control CAS 固化本次 user sign-off”，经只读复核其余文本逐字未变、语义不变且更精确，维持 PASS / 100（详见 scorecard `post_review_delta`，reviewed_at=2026-08-13T16:00:00Z）。
