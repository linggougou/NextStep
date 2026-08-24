# V1 累计验收 attempt 2 可重放证据计划候选

## 1. 计划身份与原因

- 生命周期：`S5 / P5 / V1 / cumulative acceptance`
- task：`V1-I-X-P-Profile`
- task attempt：`2`
- subject：exact F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- subject tree：`5b97a4432fbedb3dda189e05052c2e7665a1bea8`
- subject parent：`5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`
- working context：以 attempt 2 packet 创建时的 main OID 冻结。

attempt 1 的身份、packet/ACK、17/17 source refs 和集合证据匹配，但 fresh install/check/runner 原始字节不可寻址，Q/continuity/risk 只有汇总，同提交 scorecard 不具备独立审查身份。因此 attempt 1 必须以 `REVISE` 非通过 Result 终结；attempt 2 必须重新执行，不能从 attempt 1 复制任何 fresh PASS 数字。

## 2. 入口门禁

生成 attempt 2 packet 前必须同时满足：

1. attempt 1 独立 L3 evidence review 已形成不可变 `REVISE` 提交，直接父为 `933a72dc...`，写集仅两份 review 文件。
2. attempt 1 非通过 Result 已按 `sha256(JCS(仅排除顶层 result_digest))` 固化并完成 expected-old control CAS。
3. registry attempt 1=`revision-required`，tombstone 的 `minimum_valid_task_attempt=2`，pending=0，outbox 保持 closed，active A1 host 已移除。
4. 本计划经全新独立 reviewer `PASS`、P0/P1=0、`required_fixes=[]`。
5. formal 仍为 F16，main 仅含已审计项目提交和受保护用户未跟踪文件；不得读取该用户文件内容。

任一入口不满足，不得生成 packet、claim/fence 或宿主任务。

## 3. Control 顺序

control 必须维持四个独立父链边界：

1. CAS-1：attempt 1 非通过 Result + registry + checkpoint。
2. CAS-2：attempt 2 packet + dispatch-ready + pending outbox + registry + checkpoint。
3. CAS-3：claim/fence，只修改 outbox + registry + checkpoint；实时 fence=`max(stored fence)+1`。
4. 宿主副作用：CAS-3 成功后才创建唯一 `git clone --no-local` 与唯一 acceptance subagent。
5. CAS-4：ACK + outbox + registry + checkpoint；绑定唯一 host，pending 清零。

不得合并 attempt 1 Result 与 attempt 2 packet，不得合并 packet 与 claim，不得合并 claim 与 host/ACK，不得在真实执行前生成 attempt 2 Result。

## 4. 唯一输出写集

attempt 2 执行者只允许提交：

```text
.codex/reviews/p5-v1-cumulative-acceptance-a2-2026-08-24/version-acceptance.json
.codex/reviews/p5-v1-cumulative-acceptance-a2-2026-08-24/scorecard.json
.codex/reviews/p5-v1-cumulative-acceptance-a2-2026-08-24/verdict.md
```

原始 install/check/runner 内容必须嵌入 `version-acceptance.json`，不得新增第四个证据文件，不得依赖临时路径或不可达 loose object。若体积超过第 10 节硬限，必须停止并修订 packet，禁止截断。

## 5. 原始证据内嵌契约

`evidence_artifacts` 必须恰含：

- `install_log`
- `check_log`
- `runner_script`
- `runner_output`

每项必须包含：`artifact_id`、`media_type`、`storage`、`content_encoding`、`content_base64`、`raw_byte_length`、`raw_sha256`、`encoded_byte_length`、`encoded_sha256`、`git_object_format`、`derived_git_blob_oid`、`raw_is_rfc8785`、`sensitive_scan`。

规则：

- `raw_sha256` 对解码/解压后的原始字节计算。
- `encoded_sha256` 对 base64 解码后、解压前的存储字节计算。
- `derived_git_blob_oid` 按 `blob <byte_length>\0<raw bytes>` 推导，只作复算辅助。
- `runner_output` 必须是 RFC8785/JCS 原始字节；其 rows 与报告中的 rows 逐项 JCS 相等。
- install 原文必须机械解析出 resolved/found_in_store/downloaded/imported，且 `downloaded=0`。
- check 原文必须包含 474 个唯一测试枚举、474 pass、fail/skip/cancel/todo 全零及 coverage summary。
- 敏感扫描只记录规则集摘要和结论，不写入受保护用户文件内容。

## 6. 累计 runner 与机器行

同一 runner、同一 exact-F16 clone、同一 attempt 中生成以下固定集合：

| 区段 | 固定行数 | 主键与要求 |
|---|---:|---|
| continuity | 18 | 三项目 × S1.1-S1.6；逐阶段 canonical、digest、外键、语义与项目不换料 |
| Q1 | 15 | 三项目 × goals/scenarios/constraints/expected_outputs/non_goal_gaps |
| Q2 | 3 | 每项目一个未冻结下游进入探针 |
| Q3 | 18 | 三项目 × PC-03..08，记录 required/present/missing set |
| Q6 | 17 | Profile fixture ID/digest、expected conclusion/error、actual |
| Q11 | 20 | 每 risk ID 一行，内含三个 project_results，不扩张为 60 分母 |
| write | 13 | scenario ID/name/record digest 精确匹配 index |
| architecture negatives | 15 | fixture ID/name/record digest 精确匹配 index |
| rollback | 5 | rollback ID/trigger/terminal/next action/proof/actual |
| fail-closed | 32 | `FC-001..FC-032`，引用底层 row，不允许汇总占位 |
| dispatch negative | 5 | expired/terminal replay/duplicate fence/cross-task/host mismatch |
| source verification | 17 | 每个 packet source ref 按其 digest kind 独立复算 |

所有区段必须具有 `passed`、`failed`、`total`、`status`、`rows`、`rows_jcs_digest`，summary 必须由 rows 机械派生。

## 7. Continuity 最低记录

每个项目的每个 stage row 固定包含 `row_id/project_id/repository_id/stage_id/input_records/output_records/foreign_key_checks/semantic_checks/status`。record 必须携带 `record_type/id_field/record_id/canonical_content_base64/canonical_byte_length/canonical_sha256/source_fixture_ref/source_fixture_raw_sha256`。

- S1.1：Requirement Intake、Requirement Set ID/content digest。
- S1.2：Frozen Requirement 完整 JCS、confirmation/view binding。
- S1.3：Product Definition、frozen binding、challenge/display/user-action/signed record。
- S1.4：prototype、carrier decision/binding、Profile/candidate/decision/route。
- S1.5：project context、candidate change、write plan、confirmation envelope、working baseline、transaction/result、before/after/readback。
- S1.6：candidate/assessment、F15 binding、project fixture、五份 source、10 field、20 risk、5 rollback 与 scope。

每阶段必须证明 canonical round-trip、digest、自上阶段外键、项目身份和产品语义连续，不能只列阶段名。

## 8. 执行者自检与独立审查

执行者的 `scorecard.json` 必须：

- `record_type=acceptance-executor-self-check-scorecard`
- `lane=acceptance-executor-self-check`
- `independence.is_independent_review=false`
- `approval_effect=none`
- `routing=requires-separate-independent-review`
- reviewers 仅含 `acceptance_executor_self_check`

不得声明 Verifier/Strict Judge/Anti-Slop Judge/Chief Reviewer。`verdict.md` 只能声明“验收候选 PASS/REVISE/REJECT”，不能允许登记 Result。

执行提交固定后，必须由不同 host、不同 worktree 的全新 L3 reviewer 生成另一目录两文件 review commit；该 commit 必须以 acceptance commit 为唯一父级，重新解码四类内嵌内容并复算所有 rows。只有独立 review `PASS` 才允许生成 immutable Result。

## 9. 自检断言

执行者至少运行：

1. 全部 JSON exact-set 与未知字段拒绝。
2. F16/packet/dedup/ACK/claim/fence/host/control 父链与 lease。
3. 四个 artifact 解码、长度、raw/encoded SHA、derived blob OID。
4. install downloaded=0；check 474 个唯一测试且全部通过；coverage 不低于 93.41/88.84/99.15。
5. continuity=3×6；Q/write/negative/rollback/fail-closed 数量精确且 ID 唯一。
6. 17/17 source refs、PC-01..08、十二个 TG 和三项 P2。
7. 所有 summary 与 rows 重算相等。
8. executor scorecard 明确非独立，三文件 raw/JCS digest 可复算。
9. 相对 F16 精确三文件写集、`git diff --check`、`git fsck --strict`、worktree clean。
10. pre/post main/formal/control/F16 tree 与受保护未跟踪文件路径/stat 不变；禁止读取用户文件内容。

## 10. 体积、运行与停止条件

软限：install 512 KiB、check 2 MiB、runner script 256 KiB、runner output 4 MiB。超过软限使用确定性 gzip（mtime=0）后 base64，禁止截断。

硬限：`version-acceptance.json` 10 MiB，解压后全部原始内容 16 MiB。超过硬限时停止，先修订 packet 以允许额外受控证据文件。

任一身份、摘要、行数、独立性、体积、敏感扫描、测试、覆盖率或 refs 不匹配，验收候选必须 `REVISE/REJECT/BLOCKED`；不得创建 PASS Result、会签、移动 formal、声明 V1/P5 完成或进入 V2。

## 11. 非目标与历史保留

- attempt 1 分支/提交、三文件、独立 REVISE review、非通过 Result、原 packet/ACK/outbox/claim/fence 和 registry tombstone永久保留。
- attempt 2 不引用 attempt 1 的 PASS 数字作为当前事实。
- 不证明 trusted-host/full、真实用户动作或长驻 registry 生命周期/容量。
- 不恢复 Web/UI，不引入服务、数据库或远程控制面，不实施 V2。
