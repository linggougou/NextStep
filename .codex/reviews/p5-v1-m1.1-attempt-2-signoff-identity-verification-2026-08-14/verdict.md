# M1.1 Attempt 2 User Sign-off — CAS 前独立身份核验 verdict

- review_id: `p5-v1-m1.1-attempt-2-signoff-identity-verification-2026-08-14`
- 核验时间：2026-08-14T10:18:16+08:00（实时读取仓库/refs）
- 核验身份：全新独立身份核验 Agent，非此前验收、终审或会签确认 Agent。

## 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。

**`CAS_ALLOWED=true`**。八项硬门全部通过，允许以实时 expected-old 执行一次 M1.1 attempt 2 user sign-off CAS：

- `expected_old_control=380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`（必须使用实时 control OID，而非 checkpoint.control_parent_oid）。
- formal 必须保持 F13：`refs/nextstep/formal=84c051f7426ec5d2a9bed70aa02a1f321bd81e11`，CAS 不得移动 formal ref。
- 用户批准只授权 user sign-off CAS，**不授权 S1.4**；控制面不存在任何 S1.4 packet/outbox/task/candidate。
- CAS 失败**不得标记完成**：不得以旧 expected-old 盲目重试，必须从实时 refs 重新执行身份核验。

## 为什么

1. **refs 身份精确匹配**：实时 `git rev-parse` 得 formal=`84c051f7426ec5d2a9bed70aa02a1f321bd81e11`、control=`380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`，与期望值逐项相等。
2. **result_digest 独立复算匹配**：对 control 内 `results/result-milestone-acceptance-m1.1-g4-a2-f72-20260813.json` 仅剔除顶层 `result_digest` 后，用独立实现的 RFC 8785/JCS（键按 UTF-16 code unit 排序、无空白、ES number/string 语义，canonical 4707 字节）复算得 `sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`，与文件存储值、checkpoint.user_signoff.result_digest、registry result_digest、signoff 请求消息 result_digest 及期望值五方一致。
3. **状态机一致**：checkpoint `plan_generation=4`、`formal_oid` 与实时 formal 一致、`user_signoff.status=pending`、`pending_dispatch_messages=[]`；registry `M1.1-I-X-P#2` 状态 `awaiting-user-signoff` 且为全 registry 唯一 awaiting 条目（attempt 1 已 generation-invalidated），fence 72、claim、host_task_id 与 Result 一致。
4. **父链合法**：control 全链无合并提交、唯一根 `eff8cd69...`；当前提交的单父 `dcf3e933...` 与 checkpoint.control_parent_oid 吻合，但 CAS expected-old 按规则取实时 control OID `380e4ba...`。
5. **上游终审产物真实**：final-review（2026-08-13）与 final-confirmation（2026-08-14）scorecard 均可解析、`verdict=PASS`、`required_fixes=[]`，verdict.md 均落盘。
6. **工作树边界干净**：未提交变更仅为会签确认/必要 `.codex` 留痕（operations-log +6、verification-report +7）与两个评审包目录；无暂存、`git diff --check` 通过；无生产代码、测试、Schema、依赖改动。
7. **S1.4 零对象、零授权**：packets/、outbox/ 无任何 s1.4 文件，registry 无 S1.4 条目；全部 S1.4 文本均为禁止语境（signoff 请求 forbidden_before_signoff、CR-005 forbidden_before_f12、各非目标条款）。

## 必须修改

无。`required_fixes=[]`。

CAS 执行方必须遵守的约束（非修订项）：

- expected-old 只允许为实时 `380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`；CAS 前后不得移动 formal，formal 保持 F13。
- 本次授权范围仅 user sign-off CAS；不得顺带启动 S1.4、不得宣称 M1.1/V1/P5 完成。
- CAS 失败时保持 `user_signoff.status=pending` 与 registry `awaiting-user-signoff`，不得标记完成，须重新身份核验后再决定重试。

## 证据

| # | 硬门 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | formal OID | pass | `git rev-parse refs/nextstep/formal` = `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`；`control:promotions/formal-promotion-s1.3-g4-a3.json` new_formal_oid / observed_formal_oid_after_cas 同值（F13） |
| 2 | control OID | pass | `git rev-parse refs/nextstep/control` = `380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad` |
| 3 | result_digest 独立复算 | pass | 独立 RFC 8785/JCS 复算 `sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`，canonical 4707 字节，与存储/期望一致 |
| 4 | checkpoint/registry 状态 | pass | checkpoint: plan_generation=4、formal_oid 匹配、user_signoff pending、pending_dispatch_messages=[]；registry: `M1.1-I-X-P#2=awaiting-user-signoff`，result_ref/result_digest 一致 |
| 5 | 单父链与 expected-old | pass | control 全链逐提交父数=1、唯一根 `eff8cd69...`；expected_old_control 取实时 `380e4ba...` |
| 6 | 终审/终确认产物 | pass | 两份 scorecard.json jq 可解析、verdict=PASS、required_fixes=[]；verdict.md 均存在（PASS / 100） |
| 7 | 工作树变更范围 | pass | `git status --porcelain`：仅 `M .codex/operations-log.md`、`M .codex/verification-report.md`、`??` final-confirmation 评审包与本核验包；NOTHING_STAGED；`git diff --check` 通过 |
| 8 | 无 S1.4 / 授权边界 | pass | packets/、outbox/ 无 s1.4 文件；registry 无 S1.4 条目；S1.4 文本仅出现在禁止语境；signoff 请求 next_allowed_action 不含 S1.4 |

辅助证据：`control:messages/msg-user-signoff-request-m1.1-g4-a2-20260813.json`（signoff_required=true、signoff_status=pending、forbidden_before_signoff 含“启动 S1.4/声明 M1.1 完成/进入 V1/移动 formal ref”）；`control:messages/msg-user-decision-cr005-approved-20260812.json`（authorized_sequence 终于 “run M1.1 attempt 2 and request user signoff”）。

本核验为只读复核：未修改候选文档、Result、control、formal、源码、测试、配置、提交或 refs；未运行 `pnpm check`、未运行测试、未提交、未更新任何 ref；唯一写作为本评审包（scorecard.json 与 verdict.md）。
