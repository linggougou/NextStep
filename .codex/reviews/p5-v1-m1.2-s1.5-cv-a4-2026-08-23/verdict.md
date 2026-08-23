# S1.5 Candidate Verification attempt 12 裁决（CV attempt 4 / L2）

评审对象：`git:128e86bc8ecc23dd3f0ce2150bc2744edb3751d9`（tree `814361368dde1233b788f30545f292a6a3ca0f2e`）

固定 packet：`git:e387bacaa4e97d2215233110ffd23fcc105efbd9:gate-requests/gate-candidate-verification-s1.5-g4-a4-20260823.json`

claim / fence：`claim-s1.5-cv-g4-a4-f99-20260823` / `99`

## 结论

**PASS / 100**，P0/P1/P2 = **0/0/0**。8 项 hard gates 全部通过，`required_fixes=[]`。

本结论只覆盖 S1.5 attempt12 Candidate Verification，不批准或冒领 I/X/P、L3、F15、S1.5/M1.2/V1/P5 完成、S1.6 启动或 `full` host support。

## 核心证据

subject 的 commit/parent/tree 与 `sha256(JCS({commit_oid,parent_oid,tree_oid}))` 精确匹配。gate Packet、Execution Packet、Execution Result 及两组七字段 dedup 均独立 RFC8785 复算匹配；execution fence `98`、CV fence `99` 和 ACK host 绑定成立。attempt 2 的 `REJECT / 78`、gate/result blob 与 Result digest `sha256:3e2d5377dc1d9d362a7f103fb88d6402b576582c0b4136b46a8c0c1c2f6b0323` 原样保留。

`d9632c5..subject` 恰为四条 allowlist 路径，forbidden 命中 0，线性祖先与 `git diff --check` 通过；attempt12 相对 repair parent 只修改 W16 的 adapter/test 两路径。package、lock、schema、skill、docs、路线锁和 refs 路径均未变化。

Node `v24.14.0`、pnpm `10.33.2` 下，`pnpm install --offline --frozen-lockfile` 成功且 downloaded 0。37 个 source/compiled 测试文件，两次 `pnpm check` 都是 `444/444`、0 fail；覆盖率分别为 `93.04/88.54/99.09` 与 `93.07/88.62/99.09`，稳定高于 `92.90/87.62/99.00`。

专项复跑 `196/196`：三类目标 fixture 均完成项目/阶段解析→preview→独立显式确认→dry-run 零写→commit→read-back→fixture Git commit，并绑定 candidate/project/formal/HEAD/dirty/targets/digests/plan/envelope。3 正例、6 故障、4 布局的 `13/13` RFC8785 record digest 匹配。

attempt7-12 的写入、清理、恢复与竞态矩阵全部 fail closed。attempt12 noProof 在 root 内、移出 root、realpath 失败以及 basename empty/missing/same-content competitor/native EEXIST 组合中，都保持首次 error/code/cause/transaction state 与 first-wins metadata，固定报告 `candidate-proof-unavailable`，不进入 root/basename 观察或 cleanup；成功和失败均 `state_promotion=none`。

独立敏感标记探针的 contract/write 两条路径均 exit 1、stdout 单一 JCS、stderr 仅 diagnostics，stdout/stderr 零标记泄漏；`WRITE_*` 与 `PROFILE_CONFLICT_REJECTED` 不降级。S1.2 Frozen Requirement 的规范字节与 digest 保持 `sha256:21a0f7ce08ed8cbd5a4d7a8dbc1d21629c6c77b6927e66bd27c128d22532f58a`。

验证窗口内 subject/tree、main=`8c5e5aef…`、formal=`024c1db6…`、control=`e387bac…` 均不变；本 review 分支只新增 packet 指定的 `scorecard.json` 与 `verdict.md`。

## 必须修改

无。
