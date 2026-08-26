# 结论

`PASS / 100`。P0/P1/P2=`0/0/0`。固定 subject=`08ff8a875cd6bfe09593a2fbe05dee193f735c1c`、tree=`0722fca0ab5fee1c9b94ff67a10520c948a4340f`、parent=`64fcee476bcfa51a7d68fabb34f2845d75cf8eb2` 可通过本次 SG-3 契约澄清替代候选独立复审。

## 为什么

澄清候选 `64fcee4` 已把原四个 P1 机械化关闭：真实资格三元组与 `project_origin`、`evidence_binding_digest`、整批拒绝和合法排除分流、单一 exclusion reason 优先级、CLI 四个稳定错误码，以及 sorted runs / qualified-only aggregate / aggregate digest 公式都已冻结在 SG-3 设计与活动计划中。replacement `08ff8a8` 没有回退这些正文修复，只对 exact-6 状态/留痕文件做同步。

更关键的是，四个最高优先级状态源现在已经一致 fail-closed。`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、`docs/PRODUCT_SENSE.md` 与 `docs/change-requests/index.md` 都明确写成：先对包含本次状态同步的替代候选做独立复审，只有 PASS 之后，才允许 corrected attempt 2，并且必须使用 new packet、new fence 130、new worker，且不得复用 attempt 1 packet/claim/ACK/drafts。attempt 1 的 `contract-revision-required`、无 RED、无候选，以及 formal/control 未移动的事实也都被准确复述。

## 必须修改

无。

## 证据

- replacement 写集严格等于 6 个状态/留痕文件：`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、`docs/PRODUCT_SENSE.md`、`docs/change-requests/index.md`、`.codex/operations-log.md`、`.codex/verification-report.md`。
- 原四个 P1 的机械化正文位于 [docs/design-docs/p5-scalability-guardrails-design.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/docs/design-docs/p5-scalability-guardrails-design.md:244) 与 [docs/exec-plans/active/p5-scalability-guardrails.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/docs/exec-plans/active/p5-scalability-guardrails.md:197)。
- fail-closed 状态源位于 [PROJECT_ROUTE_LOCK.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/PROJECT_ROUTE_LOCK.md:34), [docs/PLANS.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/docs/PLANS.md:7), [docs/PRODUCT_SENSE.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/docs/PRODUCT_SENSE.md:74), [docs/change-requests/index.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/docs/change-requests/index.md:16)。
- attempt 1 审计事实与 replacement 状态同步留痕位于 [.codex/operations-log.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/.codex/operations-log.md:2704) 与 [.codex/verification-report.md](/Users/ling/.codex/worktrees/sg3-contract-rereview-clone-rZYGNf/.codex/verification-report.md:2633)。
