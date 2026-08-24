# V1 累计验收 attempt 4 本地控制 ref 镜像恢复计划候选

## 1. 身份与唯一修复范围

- 生命周期：`S5 / P5 / V1 / cumulative acceptance`
- task/attempt：`V1-I-X-P-Profile / 4`
- exact subject：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- subject tree/parent：`5b97a4432fbedb3dda189e05052c2e7665a1bea8` / `5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`
- control entry：`6145820b9c90113723584385dffc5f4bb59f111d`
- attempt 3 Result：`sha256:358a98e78deffa4c5d87e7dcb17186cb9e5f4a4f0773f7df33b187fec2246dec`
- minimum valid attempt：`4`

attempt 4 只修复 A3 的 `RF-P1-03-NO-LOCAL-REF-MIRROR`。不得修改业务代码、formal、shared control、F16、PC/TG 真源、fixed rows、Profile、验收阈值或成功路径门禁。

## 2. 串行控制与本地 ref 镜像

严格执行并保持每步为独立边界：

1. 计划 fresh 独立评审 `PASS` 后，主控以 expected-old=`6145820...` 创建 A4 packet/ready/pending CAS。
2. 主控以 packet control 为 expected-old 单独领取 next fence，预期为 `116`。
3. claim CAS 成功后才创建唯一新的 `git clone --no-local` 和唯一 executor host；先只核验 exact F16、分支、clean、packet/claim/expiry 与工具链。
4. readiness 通过后，主控单独创建 ACK CAS；ACK 必须绑定 fence116、唯一 host 和 clone 路径。
5. ACK CAS 成功后，主控把精确 ACK control OID 发送给 executor。executor 仅在该 attempt 专属 clone 内执行：

   ```text
   git update-ref refs/nextstep/formal ea04b57de83d6c548dcb1629b1f61832db8375ad
   git update-ref refs/nextstep/control <exact-attempt-4-ack-control-oid>
   ```

6. executor 必须机械确认两个 local-only ref 的 OID、`HEAD=F16`、index/worktree clean；该动作不得触碰共享仓库的同名 refs，不得通过 fetch/push 更新 shared control/formal，也不得进入提交写集。
7. 只有上述 post-ACK preflight 全部通过，才允许本 attempt 的首次 fresh install/check/runner。

clone 内 local-only refs 是测试环境身份镜像，不是 control CAS、formal promotion 或共享 ref 移动。任何 OID 不一致、shared ref 漂移或工作树变脏均立即 `REVISE/BLOCKED`。

## 3. Fresh 重放与证据

- 使用新的唯一 no-local clone；不得修复、重跑或复用 A3 clone，不得复制 A1/A2/A3 的 install/check/runner output 字节。
- frozen/offline install 必须 `downloaded=0`；`pnpm check` 必须 474/474，fail/skip/cancel/todo 全零，coverage 不低于 `93.41/88.84/99.15`。
- cumulative runner 必须在同一 clone、同一 attempt 中 fresh 执行并产生固定 rows：`18/15/3/18/17/20/13/15/5/32/5/17`。
- 内嵌完整 `install_log/check_log/runner_script/runner_output`，机械绑定 raw/encoded length、SHA-256、Git blob OID、JCS 与敏感扫描。preflight 的 ref OID/clean 证据必须进入 install log 或 runner output 的不可变执行上下文。

## 4. PC/TG 闭环不回退

- PC-01..08 均使用结构化 `{section_id,row_ids,resolved_rows_jcs_digest}`，引用必须存在、非空、唯一并通过 closure join。
- PC-07 只绑定 `write_consistency/fail_closed/rollback`，禁止引用 S1.7；PC-08 只绑定 `architecture_negatives/q11/rollback`，禁止引用 S1.8。
- `covered_tgs` 与顶层 `tg_evidence` 必须精确为 18 项：`TG-01,02,03,04,05,06,08,09,10,11,12,13,14,15,16,17,18,19`；每个 Q11 `tg_binding` 必须 join 到顶层 evidence row。
- 三项既有 P2 原样承接，不升格、不丢失。

## 5. 写集、独立性与 Result

executor 唯一写集为：

```text
.codex/reviews/p5-v1-cumulative-acceptance-a4-2026-08-24/version-acceptance.json
.codex/reviews/p5-v1-cumulative-acceptance-a4-2026-08-24/scorecard.json
.codex/reviews/p5-v1-cumulative-acceptance-a4-2026-08-24/verdict.md
```

executor scorecard 必须 `is_independent_review=false`、`approval_effect=none`。候选冻结后必须由另一个全新 host/worktree 只新增独立 review 两文件，review commit 以 candidate 为唯一父。只有独立 L3 通过且主控复算全部身份、摘要、rows、artifact、PC/TG closure 后，主控才可在另一笔 control CAS 创建 immutable Result。

## 6. 成功链与停止条件

PASS Result CAS、独立会签包终审、signoff-request CAS、针对精确 Result 的新用户 ACK CAS、V1 completion CAS、独立 V2 entry evaluation 六段保持不可合并。broad autonomy、历史会签或计划 PASS 均不能代替精确 V1 用户会签。

任一 ref 身份、freshness、测试、覆盖率、artifact、fixed rows、PC/TG join、source ref、独立性或受保护文件门禁失败，必须 `REVISE/REJECT/BLOCKED`；不得同 attempt 修补后重跑并包装 PASS。

## 7. 受保护文件与回收

受保护未跟踪文件只允许路径/stat 确认，禁止读取、修改、暂存、清理或纳入摘要。A3 candidate/review 分支保持命名可达；A3 executor clone 在 Result、分支可达、clean、fsck/cat-file 验证后才可移入唯一废纸篓路径。A4 clone/reviewer worktree 按同一可恢复回收契约处理。
