# 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。commit `6a80b8fd8d701b37738f80eb482af330c79b51dd` 上的 M1.2 attempt 1 用户会签包通过最终独立 L3 终审，可进入 control `user-signoff-request`。

本 PASS 不是用户批准，也不完成 M1.2，不移动 control/formal，不重建 Result，不启动 V1 累计验收或 V2。用户明确批准且新的独立身份复核与实时 expected-old control CAS 成功前，M1.2 仍为未完成；V1、P5 未完成，V2 未授权。

# 为什么

1. 精确身份一致：subject=`6a80b8fd8d701b37738f80eb482af330c79b51dd`、tree=`41a6bc03ceb63809aaae409cdb670d4951ac1729`、单父=`fb2b42ff6b00c45e947f30a9ea349b5bcb8d50e5`、formal F16=`ea04b57de83d6c548dcb1629b1f61832db8375ad`、control=`89225143315f44f6b057748be3aa8fc77e123ff9`，与报告、路线锁、计划和 Result 全部一致。
2. Result 摘要独立复算匹配：仅排除顶层 `result_digest` 后按 JCS 口径得到 `sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`。Result 为 `PASS / 100`，I/X/P/Profile 均 `25/25`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。
3. 原始验收评审提交 `4ca8295fe52b13acc85fed768795fbd4c0ad32d4` 直接父为 F16，且相对 F16 精确新增 `milestone-acceptance.json`、`scorecard.json`、`verdict.md` 三文件；三份摘要复算匹配 Result。三文件共同覆盖 TG 完整并集、S1.3→S1.6 三类累计链及 F16 subject digest，没有证据缺口。
4. 报告与 Result 指标逐项一致：全量回归 `474/474`；覆盖率 Lines/Branches/Functions=`93.41%/88.84%/99.15%`；三类累计连续性 `3/3`；Q6=`17/17`、写入语义=`13/13`、Q3=`10/10`、Q11=`20/20`、回滚=`5/5`、架构负例=`15/15`。报告准确保留 `headless-primary/manual-isolated` 限制，未把 UI fixture 写成 Web/UI 主线证据。
5. 路线锁、PLANS、活动执行计划、README、QA 索引和两份 `.codex` 留痕一致维持 formal F16，并准确表述 M1.2 仅“验收通过、等待会签包终审/用户会签”，尚未正式完成；V1/P5 未完成，V2 未授权。
6. control 前置状态正确：M1.2 attempt 1 的 fence=`112`，状态为 `gate-passed-awaiting-signoff-package-review`，`milestone_status=not-completed`、`signoff_status=not-requested`；checkpoint 已登记 Result，`completed_milestones` 仍仅含 M1.1，`pending_dispatch_messages=[]`。终审通过后才创建会签请求，不存在抢跑。
7. 会签效果没有自相矛盾：用户批准后仍须由新的独立身份核验者实时重读 formal/control/Result，再以实时 expected-old control 执行 CAS；仅 CAS 成功后 M1.2 才正式完成。身份漂移或 CAS 冲突则不固化、不标记完成且禁止盲重试。M1.2 会签只关闭 M1.2，并仅允许后续单独评估 V1 累计验收入口，不自动授权任何后继实施。

# 必须修改

无。`required_fixes=[]`。

后续硬边界（非修改项）：

- 先在 control 新增独立 `user-signoff-request`，保留既有 M1.1 用户会签记录，不得覆盖历史。
- 用户明确批准后，由新的独立审查身份重读 formal/control/Result 身份；只有全部匹配时，才可使用实时 expected-old control CAS 固化。
- CAS 成功后才可把 M1.2 标记为正式完成；CAS 冲突或身份漂移时保持未完成并重新评估，不得盲重试。
- 本次终审与后续 M1.2 会签均不完成 V1/P5、不授权 V2，也不生成或派发下一阶段 packet。

# 证据

- subject：`6a80b8fd8d701b37738f80eb482af330c79b51dd`；tree=`41a6bc03ceb63809aaae409cdb670d4951ac1729`；parent=`fb2b42ff6b00c45e947f30a9ea349b5bcb8d50e5`。
- 实时 refs：formal F16=`ea04b57de83d6c548dcb1629b1f61832db8375ad`；control=`89225143315f44f6b057748be3aa8fc77e123ff9`。
- Result：`control:results/result-milestone-acceptance-m1.2-g4-a1-f112-20260824.json`；独立 JCS 摘要=`sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`。
- 原始验收评审：commit `4ca8295fe52b13acc85fed768795fbd4c0ad32d4`；`milestone-acceptance.json` JCS=`sha256:f186c27a4ce41edf265c5c6f7644c36334544c57051be8db0e6d8dd0456d5856`；`scorecard.json` JCS=`sha256:665ca1e56d0b679daa3646b3c29f3d525d1405872b20f7f4b4abb344da9a77cf`；`verdict.md` raw SHA-256=`sha256:ac1f03cfd5c0e41bd0a1ff2031c10c8922d0fc27e5a083b142a07ae3610f66df`。
- 会签报告：`docs/qa/p5-v1-m1.2-acceptance-attempt-1-2026-08-24.md`，raw SHA-256=`e98caaaf4e099bec95e8cebecab52cb0e723699eabb16a350245454093add7b0`。
- 路线与计划：`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、`docs/exec-plans/active/p5-product-implementation-milestones.md`，摘要见 scorecard。
- 机械检查：终审开始时工作树 clean；`git diff --check HEAD^ HEAD` 通过；subject 相对父提交只含八个批准的报告、路线、计划、索引与留痕文件，无生产代码、测试、Schema、Skill、依赖或 ref 变化。
- 保护边界：本轮未读取、修改或纳入用户未跟踪 Multica 文件；未改 main/formal/control/evidence；未重跑全量测试、未重建 Result。
