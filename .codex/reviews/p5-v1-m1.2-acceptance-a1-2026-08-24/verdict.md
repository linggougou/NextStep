# 结论

**`PASS / 100`**。精确 F16 subject `ea04b57de83d6c548dcb1629b1f61832db8375ad`（tree `5b97a4432fbedb3dda189e05052c2e7665a1bea8`）通过 M1.2 attempt 1 累计验收；I/X/P/Profile=`25/25/25/25`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。

本 PASS 只表示 M1.2 验收本体具备形成 immutable Result 与用户会签候选的条件。用户尚未会签，M1.2、V1、P5 均不得标记正式完成；V1 的 S1.1-S1.6 累计验收必须在 M1.2 用户会签后单独启动。

# 为什么

- **I 通过**：唯一 `git clone --no-local` 隔离副本 detached 到 F16，使用 Node `v24.14.0`、pnpm `10.33.2` 完成 offline frozen install（downloaded=`0`）和正式 `pnpm check`，结果 `474/474`、0 fail，覆盖率 Lines/Branches/Functions=`93.41/88.84/99.15`。F13→F14→F15→F16 祖先关系、三份 promotion 与各阶段 CV/I-X-P/L3/FV/AV/Credential/Anchor/Proof/control 摘要链全部匹配。
- **X 通过**：Profile 冲突与缺确认、主对话写入、写入失败、用户改动覆盖、create no-replace、父路径替换、摘要漂移、风险缺失/重复/未知、错误阶段、非 F15、敏感内容与冒领 full 均 fail closed；15/15 架构负例全部拒绝。
- **P 通过**：`community-workshop`、`expense-reminder`、`project-delivery-tool` 三项目从 S1.3 Product Definition 到 S1.6 architecture assessment 的完整 canonical 内容、身份与摘要连续率为 `3/3`；write=`13/13`、Q3=`10/10`、Q11=`20/20`、rollback=`5/5`，PC-04..08 与 packet 所列 12 项 TG 均有可执行证据。
- **Profile 通过**：17/17 fixture 与 expected 精确一致，Q6=`100%`。`ui-with-evidence` 仅作为 Profile 规则证据，不恢复或宣称 Web/UI 主路线。
- packet digest `sha256:aaf4cc5e...` 与 dedup `sha256:7688757f...` 独立 RFC8785 复算匹配；fence `112` 的 ready/ACK/outbox/registry 与 host `codex-subagent:/root/m12_truth_map` 一致，ACK control `0295efbb...` 的直接父为 claim control `c792bf32...`。
- 验收窗口内项目产品、`docs/qa`、main/formal/control/evidence 与用户 Multica 未跟踪文件均未修改；正式 clone 与专属 review worktree 在收口前均 clean。

# 必须修改

无。`required_fixes=[]`。

# 证据

- Gate packet：`control:gate-requests/gate-milestone-acceptance-m1.2-g4-a1-20260824.json`；packet/dedup/source refs=`11/11` 匹配。
- Subject：`ea04b57de83d6c548dcb1629b1f61832db8375ad`；parent=`5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`；tree=`5b97a4432fbedb3dda189e05052c2e7665a1bea8`。
- 全量验证：offline frozen install；`pnpm check`=`474/474`；覆盖率=`93.41/88.84/99.15`。
- 累计矩阵：项目连续率=`3/3`；Q6=`17/17`；write=`13/13`；Q3=`10/10`；Q11=`20/20`；rollback=`5/5`；architecture negatives=`15/15 fail closed`。
- 正式链：F13→F14→F15→F16 三段 promotion digest 全部复算匹配；15 份 CV/I-X-P/L3/FV/AV Result digest 全部匹配；3 份 Credential 与 3 份 Proof 均 raw/JCS/内容寻址名一致、`0600`、`link_count=1`，evidence root=`0700`。
- 细化机器记录：同目录 `milestone-acceptance.json`；评分合同：同目录 `scorecard.json`。
