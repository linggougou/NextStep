# 结论

`PASS / 100`。固定候选 `87258c32162875bef16994b2259ad16baf4cb72e` 通过 SG-3 generation 5 attempt 1 的唯一正式 package acceptance；P0/P1/P2 为 `0/0/0`。

本结论只表示 SG-3 真实项目价值验证框架 package 已满足独立验收门禁。它不表示 PC-19、V2、V4、P5、formal promotion 或 cumulative acceptance 完成。

## 为什么

- packet、dedup、subject 与 execution Result 摘要已独立复算一致；acceptance 控制链 `65655e5 -> a4df489 -> 1638f2c -> 294f041` 为单父闭合，attempt2 execution/ACK 也与 acceptance packet 预期前置证据一致。
- 候选相对父提交 `44852b2` 的真实写集精确为 packet allowlist 的 8 条路径；无 protected Multica 文件读取、无依赖变更、无控制面写入。
- Schema 与实现对 unknown field、invalid date、non-finite/negative values、sensitive field/content、duplicate run_id 都 fail closed；合法但不合格记录只保留冻结优先级中的单一 reason，duplicate project identity 会排除全部匹配记录。
- aggregate 摘要、排序、qualified-only outcomes/medians、`false_block_count=null` 的 null 语义与 recovery flatten 都按 RFC8785/JCS 公式稳定实现；repository fixtures 始终保持 `qualified_real_runs=0`、`target_qualified_real_runs=3`。
- 定向验证 `9/9`，全量 `pnpm check` 为 `503/503`，`fail/skip/cancel/todo=0/0/0/0`，coverage Lines/Branches/Functions=`93.50/88.62/99.22`。
- CLI 成功分支为 `exit 0 / stderr 空 / stdout 单一 JCS aggregate`，失败分支为 `exit 1 / stdout 空 / stderr 单行稳定错误码`；纯领域实现无生产网络/Git/文件系统/遥测收集或写入。

## 必须修改

无。`required_fixes=[]`。

## 证据

- Subject：`87258c32162875bef16994b2259ad16baf4cb72e`；tree=`a7b317cec57e61b1cac06f55b6f212bf08a8b02a`；parent=`44852b2b56849aac48329990c58143dbb2d2a86b`；subject digest=`sha256:6ff9bb2e7335b438b5d400139e9ea5b1644dc5cce3c347e41f63d8315340c4df`。
- Acceptance packet：`sha256:63bb6a9c780ddfbc6506eecfa64c887585459b6eaffe3125f1669f3717d2abd6`；dedup=`sha256:9f09d73290e31e13b0b3a40c587572bb0533b9dcd1b716745247044030c6ee44`；execution Result=`sha256:917f0f3f76c941bab1dc4bb16605b0522d98dd860cb0b5e11dba2184190eb6b0`。
- Control：packet=`65655e58b0d0b69cb711a9f545b2d64fcb383a3a`；claim=`a4df48979b4f56825e53586bada460d046c80e37`；ready=`1638f2c3345a6ff08e2bc2a5c6ae1da2e72ae37c`；ACK=`294f04131494894d32c29523b807bf9987a9f075`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- 验证：`corepack pnpm build && node --test dist/tests/domain/project-value-validation.test.js dist/tests/cli/project-value-validation.test.js` 为 `9/9`；`corepack pnpm check` 为 `503/503`；`git diff --check` 通过；额外 CLI 烟测在 canonical JCS 输入下返回 `exit 0 / stderr 空 / stdout 单一 aggregate`，重复 run_id 返回 `DUPLICATE_RUN_ID`。我中途一次把未 canonicalize 的 fixture 原文直接喂给 CLI，得到 `NON_CANONICAL_INPUT`；该结果符合契约，但属于审查者额外误用，不计入候选失败结论。
