# V1 累计验收 attempt 5 runner coverage parser 恢复计划候选

## 1. 身份、入口与唯一修复范围

- 生命周期：`S5 / P5 / V1 / cumulative acceptance`
- task/attempt：`V1-I-X-P-Profile / 5`
- exact subject：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- subject tree/parent：`5b97a4432fbedb3dda189e05052c2e7665a1bea8` / `5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`
- control entry：`25a770ef6e47647e0e12d5bd8abb1288d1007e5b`
- attempt 4 Result：`sha256:35b9ff2da30351c2beaf8e812c17bfed7b76bb4d1a098466529f885acdb68139`
- minimum valid attempt：`5`

attempt 5 只修复 `RF-P1-04-RUNNER-COVERAGE-PARSER`：fresh runner 必须识别 Node `v24.14.0` coverage report 的字面量聚合标签 `all files`。同时把 install 退出码改为直接进程状态采集，禁止 Bash `PIPESTATUS`/zsh `pipestatus` 或 pipeline 包装器歧义。不得修改业务代码、F16、formal、shared control、PC/TG 真源、fixed rows、Profile、验收阈值或任何成功路径门禁。

## 2. 计划评审与串行控制链

1. 本计划必须先由全新独立 reviewer 在专属 worktree 中 L3 评审为 `PASS`；reviewer 只能新增两份计划评审文件，不能修改计划、路线锁、control 或 refs。
2. PASS 后主控才可从 exact control entry 创建 A5 packet/ready/pending CAS；packet、claim/fence、ACK、Result 必须为四个独立 expected-old 单父控制边界。
3. claim 前按控制面全部历史 fence 重新计算 `max(fence)+1`；若无并发漂移预期为 `117`，但不得把预期值替代实时 CAS 检查。
4. claim CAS 后才创建唯一新的 `git clone --no-local` 与唯一 executor；readiness 阶段只核验 exact F16、clean、无 local custom refs、packet/claim/expiry 和工具链，不执行 install/check/runner。
5. readiness 通过后主控单独 ACK CAS，绑定唯一 host、claim 与实时 fence；executor 只能在收到 exact ACK OID 后进入执行阶段。

任何父链、packet/dedup、fence、expiry、host、F16 或工作树身份不一致，立即停止且不得生成成功候选。

## 3. ACK 对象与 clone-local ref 镜像

A4 已证明此机制可行，A5 必须在自己的新 clone 中 fresh 重做，不能复用 A4 字节：

1. object-only import 前记录完整 `for-each-ref` 清单/摘要和 `.git/FETCH_HEAD` 存在性/摘要。
2. 只执行 `git fetch --no-write-fetch-head <shared-repository> <exact-A5-ACK-OID>`，并用 `git cat-file -e <ACK>^{commit}` 验证对象可读。
3. import 前后完整 ref 清单/摘要与 FETCH_HEAD 必须逐字节相等；shared formal/control 必须仍为 F16/exact ACK。
4. 仅在 clone 内创建 `refs/nextstep/formal=F16` 与 `refs/nextstep/control=exact ACK`，随后验证 HEAD=F16、index/worktree clean、除这两条 local-only refs 外无 ref 变化。

local-only refs 只是测试身份镜像，不是 shared ref 更新、formal promotion 或 control CAS，不进入候选写集。

## 4. Fresh install/check 与可移植退出码

- install、check、runner 各只执行一次；同 attempt 内禁止修补后重跑。
- install 日志使用直接 stdout/stderr 重定向，退出码取被执行进程本身；禁止 pipeline、`PIPESTATUS`、`pipestatus` 或“后续命令已运行”推断替代明确退出码。
- frozen/offline install 必须 exit 0 且 `downloaded=0`；fresh `pnpm check` 必须 exit 0、474/474，fail/skip/cancel/todo 全零，coverage 不低于 `93.41/88.84/99.15`。
- 任何一次命令失败都必须保留完整原始字节并 fail closed；不得把 wrapper、日志解析或 shell 差异包装成通过。

## 5. Runner parser 精确契约

runner source 必须在执行前冻结并进入 artifact。coverage parser 必须：

1. 在 `start of coverage report` 与 `end of coverage report` 的同一最后完整区块内查找聚合行。
2. 接受 Node 24 实际字面量 `all files`；可兼容 Unicode ellipsis `…`，但不得依赖 ellipsis 才能通过。
3. 以行首、分隔竖线和三个数值列为结构边界，拒绝零匹配、多匹配、NaN、越界数值、区块缺失或区块外伪造行。
4. runner 运行前只允许用合成的 `all files`/`…` 两条固定字符串做 parser 单元预检；不得用实际 check log 预跑完整 runner。
5. 唯一 runner 必须 exit 0，并产生非空 RFC8785/JCS output；output 必须与验收报告中的 sections 和摘要机械相等。

## 6. 固定 rows、source、PC/TG 闭环

- 十二个 section 行数精确为 `18/15/3/18/17/20/13/15/5/32/5/17`；ID 唯一、summary、rows JCS digest 和逐行 evidence join 全部通过。
- packet 的 17 项 source refs 必须 fresh 重算 `17/17`，不得复用 A4 结论字节。
- PC-01..08 使用结构化 `{section_id,row_ids,resolved_rows_jcs_digest}`；PC-07 只绑定 `write_consistency/fail_closed/rollback`，PC-08 只绑定 `architecture_negatives/q11/rollback`，禁止 S1.7/S1.8。
- `covered_tgs` 与顶层 `tg_evidence` 精确覆盖 `TG-01,02,03,04,05,06,08,09,10,11,12,13,14,15,16,17,18,19`；每个 Q11 `tg_binding` 必须 join 到顶层 evidence row。
- 三项既有 P2 原样承接，不升格、不丢失。

## 7. Artifact、写集与独立 L3

四类 artifact=`install_log/check_log/runner_script/runner_output` 必须内嵌完整 fresh 原始字节，并绑定 raw/encoded length、SHA-256、Git blob OID、JCS 和敏感扫描。executor 唯一写集为：

```text
.codex/reviews/p5-v1-cumulative-acceptance-a5-2026-08-24/version-acceptance.json
.codex/reviews/p5-v1-cumulative-acceptance-a5-2026-08-24/scorecard.json
.codex/reviews/p5-v1-cumulative-acceptance-a5-2026-08-24/verdict.md
```

executor 自检必须标记 `is_independent_review=false`、`approval_effect=none`。候选冻结后由另一个从未参与生成的全新 host/clone 只新增独立 L3 两文件，review commit 必须以 candidate 为唯一父。只有独立 L3 `PASS` 且主控复算 commit/tree/parent、exact write sets、raw/JCS/blob、artifact、rows/source/PC/TG closure 后，主控才可创建 immutable Result CAS。

## 8. 成功链、保护与回收

成功链六段不可合并：`PASS Result CAS` → `独立会签包终审` → `signoff-request CAS` → `针对精确 Result 的新用户 ACK CAS` → `V1 completion CAS` → `独立 V2 entry evaluation`。当前 broad autonomy、历史确认或计划 PASS 均不能替代精确 V1 用户会签。

受保护未跟踪文件 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md` 只允许路径/stat 确认，禁止读取、修改、暂存、摘要、验收、清理或回收。任一 ref、freshness、测试、coverage、artifact、parser、rows/source/PC/TG、独立性或保护门禁失败，必须 `REVISE/REJECT/BLOCKED`，不得同 attempt 重跑。

executor/reviewer 分支必须先命名可达；worktree/index clean、`git diff --check`、`git fsck` 与 candidate/review `cat-file` 通过后，专属 clone 才可移动到唯一废纸篓路径做可恢复回收。主控独占 main、formal、shared control 与所有 CAS。
