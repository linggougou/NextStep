# 结论

`REVISE / 80`。P0/P1/P2=`0/2/0`，`required_fixes=2`。

候选 `c1cbf4b7b47da3a77c6f9ef11b66cd7c4829c144` 的整体骨架是对的：当前写集保持 exact-three，V3 的主顺序也锁成了 `S3.1 → S3.2 → S3.3 → S3.4-A → S3.4-B → S3.4-C → S3.5-A → S3.5-B`。但它还不能放行，因为有两处会直接影响后续 packet 的唯一边界和上游一致性。

# 为什么

- 当前候选的机械边界是干净的：唯一父提交是 `691393988fa64a00c1398519b6c0fa9eacd1b1f8`，tree=`87d5588ae4daed2cbf2911036734c9bbfc5a8ad7`；当前写集正好是 `.codex/exec-plan-v3-generation-1.md`、`.codex/operations-log.md`、`.codex/verification-report.md` 三个文件，`git diff --check` 无输出，受保护未跟踪路径未入写集。
- 候选也正确保留了范围边界：`.codex/exec-plan-v3-generation-1.md:31`、`:211`、`:270`、`:288-293` 明确没有偷渡 `CR-006` 关闭、`V4`、`Final Acceptance`、`PC-19/PC-20`、`P5` 完成，也没有把 `P4-V16` 错写成可在 V3 完成 `FA/PC-20`。
- 但第一处实质问题是 M3.1/PC-14 的出口被弱化了。上游 P3 明确要求 `PC-14` 和 `M3.1` 必须达到“至少一个正式支持主宿主通过 full 模式自动分派与恢复验收”，见 [p3-version-and-milestone-breakdown.md](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/completed/p3-version-and-milestone-breakdown.md:130) 与 [同文件](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/completed/p3-version-and-milestone-breakdown.md:258)。但候选只在 V3 版本出口保留了这个要求（计划文件 `:28`），而在 M3.1 出口 `:18` 和 S3.2 收口 `:124` 写成了 “S3.1+S3.2 累计验收和用户门禁即可完成 M3.1/PC-14”。这会留下一个错误路径：M3.1 可能在没有任何正式 `full` 主宿主时被误判完成。
- 第二处实质问题是 S3.5-B 的 future allowlist 不自洽。候选在计划文件 `:238-256` 允许修改 `src/domain/project-status-projection.ts`、`src/adapters/node/project-status-source.ts`、`src/cli/project-status.ts` 及其测试，但没有纳入现有直接依赖的 schema 和 fixture。当前 [tests/domain/project-status-projection.test.ts](/Volumes/2T/CODE/A_Mine/NextStep/tests/domain/project-status-projection.test.ts:8) 直接导入 `schemas/v1/project-status-projection.schema.json`，同文件 [line 16](/Volumes/2T/CODE/A_Mine/NextStep/tests/domain/project-status-projection.test.ts:16) 与 [tests/cli/project-status.test.ts](/Volumes/2T/CODE/A_Mine/NextStep/tests/cli/project-status.test.ts:10) / [line 11](/Volumes/2T/CODE/A_Mine/NextStep/tests/cli/project-status.test.ts:11) 又直接依赖 `tests/fixtures/project-status/available-source.json`。而 CR-006 已冻结过这套 contract surface，见 [p5-scalability-guardrails.md](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/active/p5-scalability-guardrails.md:141) 和 [line 148](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/active/p5-scalability-guardrails.md:148)。如果 S3.5-B 真要扩展 `project-status`，缺这两类路径就会逼着后续 packet 越界修改，或者让 exact-18 根本无法落地。

# 必须修改

- 在 M3.1 出口与 S3.2 收口规则中显式恢复上游 P3 的 `full` 宿主要求：`M3.1/PC-14` 只有在至少一个正式支持主宿主通过 `full` 自动分派与恢复验收、且 `blocked` 不列入支持时才可完成；该要求不能只放在 V3 版本出口。
- 修正 S3.5-B 的 future exact allowlist，使其与当前 `project-status` contract surface 自洽：至少补入 `schemas/v1/project-status-projection.schema.json` 与 `tests/fixtures/project-status/**`，或者完全移除本 packet 对 `project-status` 相关文件的修改并同步重算 exact count。

# 证据

- 机械校验：`git show --format=%P/%T` 证明单父与 tree；`git diff-tree --name-only -r 691393988... c1cbf4b7...` 返回正好 3 个文件；`git diff --check 691393988... c1cbf4b7...` 无输出。
- 当前顺序与边界：计划文件 [line 18](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:18)、[line 28](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:28)、[line 124](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:124)、[line 211](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:211)、[line 238](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:238)、[line 270](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:270)、[line 288](/tmp/nextstep-v3-g1-entry-review-wlgCTB/.codex/exec-plan-v3-generation-1.md:288)。
- 上游 M3.1/PC-14 约束：P3 文件 [line 130](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/completed/p3-version-and-milestone-breakdown.md:130) 与 [line 258](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/completed/p3-version-and-milestone-breakdown.md:258)。
- S3.5-B 依赖面：当前 [tests/domain/project-status-projection.test.ts](/Volumes/2T/CODE/A_Mine/NextStep/tests/domain/project-status-projection.test.ts:8)、[line 16](/Volumes/2T/CODE/A_Mine/NextStep/tests/domain/project-status-projection.test.ts:16)、[tests/cli/project-status.test.ts](/Volumes/2T/CODE/A_Mine/NextStep/tests/cli/project-status.test.ts:10)、[line 11](/Volumes/2T/CODE/A_Mine/NextStep/tests/cli/project-status.test.ts:11)，以及已冻结 SG-2 范围 [p5-scalability-guardrails.md line 141](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/active/p5-scalability-guardrails.md:141) / [line 148](/Volumes/2T/CODE/A_Mine/NextStep/docs/exec-plans/active/p5-scalability-guardrails.md:148)。
