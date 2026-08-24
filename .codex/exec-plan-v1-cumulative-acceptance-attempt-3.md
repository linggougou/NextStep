# V1 累计验收 attempt 3 PC/TG 闭环修复计划候选

## 1. 计划身份与入口

- 生命周期：`S5 / P5 / V1 / cumulative acceptance`
- task：`V1-I-X-P-Profile`
- task attempt：`3`
- subject：exact F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- subject tree/parent：`5b97a4432fbedb3dda189e05052c2e7665a1bea8` / `5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`
- control entry：`a2e0cad094a5600c1309acb51b3a28069dfd08c2`
- attempt 2 Result：`sha256:bcab36b863fe1d3418d0474866aa4501be847da9fba0bcd72a526bf324b8c518`

attempt 3 只修复 attempt 2 独立 L3 冻结的两个 P1 证据闭环缺陷，不改变产品、技术栈、路线、Profile、PC/TG 真源或验收阈值。计划必须先经全新独立 reviewer `PASS`，才允许生成 packet。

## 2. 必改项

### 2.1 PC 引用闭环

`pc_evidence` 不得用 `PC` 数字机械拼接 `S1.x`。每个引用必须解析到实际存在的 section、stage 和 row：

| PC | 必须闭合的真实 evidence |
|---|---|
| PC-01 | `q1` + continuity `S1.1` |
| PC-02 | `q2` + continuity `S1.2` |
| PC-03 | `q3` + continuity `S1.3` |
| PC-04 | `q3`/`q6` + continuity `S1.4` |
| PC-05 | `q3` + continuity `S1.5` |
| PC-06 | `q3` + continuity `S1.6` |
| PC-07 | `write_consistency` + `fail_closed` + `rollback`，不得引用 S1.7 |
| PC-08 | `architecture_negatives` + `q11` + `rollback`，不得引用 S1.8 |

每条 PC ref 使用结构化 `{section_id, row_ids, resolved_rows_jcs_digest}`；`row_ids` 非空、唯一且必须存在。runner 和报告都必须执行全量 closure join，悬空引用直接失败。

### 2.2 TG 引用闭环

attempt 3 packet 的 `covered_tgs` 与顶层 `tg_evidence` 必须精确为下列 18 项并集：

`TG-01, TG-02, TG-03, TG-04, TG-05, TG-06, TG-08, TG-09, TG-10, TG-11, TG-12, TG-13, TG-14, TG-15, TG-16, TG-17, TG-18, TG-19`。

它等于原冻结的 12 项与 Q11 实际绑定的 6 项补集。每个 Q11 `tg_binding` 必须在顶层具有同 ID evidence row；顶层不得多项或少项。每个 TG row 使用结构化 section/row 引用并通过 closure join，不能只写 `status=pass`。

## 3. Fresh 执行与证据契约

attempt 3 不得复制 attempt 2 的 fresh 数字或原始内容。必须在新唯一 `git clone --no-local`、同一 exact-F16、同一 runner、同一 attempt 中重新执行：

1. frozen/offline install，机械解析 `downloaded=0`；
2. `pnpm check`，474 个唯一测试全部通过，fail/skip/cancel/todo 全零，coverage 不低于 `93.41/88.84/99.15`；
3. cumulative runner，重新生成完整 continuity/Q/write/architecture/rollback/fail-closed/dispatch/source rows；
4. 内嵌 `install_log/check_log/runner_script/runner_output` 完整原始字节，绑定 raw/encoded length、SHA-256、derived Git blob OID、敏感扫描；runner output 必须为 RFC8785/JCS。

固定 section 行数保持：`18/15/3/18/17/20/13/15/5/32/5/17`。每个 summary 必须由 rows 机械派生，`rows_jcs_digest` 必须独立可复算。三项 P2 原样承接。

## 4. 控制父链与唯一宿主

严格串行：

1. A3 packet + ready + pending outbox + registry/checkpoint，expected-old=`a2e0cad...`；
2. claim/fence 单独 CAS，实时 fence=`max(stored fence)+1`，预期为 115；
3. CAS 成功后才创建唯一 no-local clone 与唯一 executor host；
4. host readiness 后单独 ACK CAS，pending 清零；
5. ACK 后才执行验收。

不得合并 packet/claim/host/ACK，不得在执行或独立 review 前生成 Result。

## 5. 写集与独立审查

执行者唯一输出：

```text
.codex/reviews/p5-v1-cumulative-acceptance-a3-2026-08-24/version-acceptance.json
.codex/reviews/p5-v1-cumulative-acceptance-a3-2026-08-24/scorecard.json
.codex/reviews/p5-v1-cumulative-acceptance-a3-2026-08-24/verdict.md
```

执行者 scorecard 必须是非独立自检，`approval_effect=none`，不能创建 Result。候选冻结后派发全新不同 host/worktree 的 L3 reviewer，唯一写集为另一目录两文件；review commit 必须以 candidate commit 为唯一父级。

任何 reviewer 越过两文件所有权写 control/main/formal，只能作为未接纳审计草稿保留；`refs/nextstep/control` 仅由主控在独立复算后执行 expected-old CAS。

## 6. 停止条件

任一身份、摘要、artifact、行数、PC/TG closure、runner 实质、测试、覆盖率、敏感扫描、体积、source ref 或独立性失败，必须 `REVISE/REJECT/BLOCKED`。不得创建 PASS Result、发起会签、移动 formal、声明 V1/P5 完成或进入 V2。
