# 结论

`PASS / 100`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。V1 的 S1.1-S1.6 累计验收入口通过独立 L3 评估。

唯一 `next_allowed_action`：准备一份 V1 cumulative acceptance Generation 1 计划候选，并把该计划候选交给另一轮独立评审。本裁决不授权生成 packet、claim/fence，不授权派发或运行正式 V1 验收，不移动 formal/control；V1/P5 仍未完成，V2 未授权。

# 为什么

1. 当前身份精确且稳定：subject=`ba7cb6c003bf7f4f11bde33f94f0cb5e6dcf3702`、formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`、control=`a99593f940c6f38fba2147fc9b2c5bb5594c93a7`，pending dispatch=`0`。
2. M1.1 attempt 2 与 M1.2 attempt 1 均在 registry、checkpoint、会签 ack 中一致登记为 `formally-completed/approved`。两份 Result 排除 `result_digest` 后的独立 JCS 复算分别匹配 `sha256:341d36aa...` 与 `sha256:73daa214...`；会签 formal、Result、身份核验和 CAS 记录互相绑定。
3. S1.1-S1.6 的正式证据足以进入规划：S1.1 F11 是 F16 祖先；当前 generation 4 修复链为 F0→F12→F13，后接 F13→F14→F15→F16。六份 promotion 的摘要、tree、expected-old ancestry 与 CAS success 均独立校验通过；checkpoint 对六阶段均登记 Snapshot、FV、Credential、Anchor、AV、Proof 与 promotion。
4. 后续计划的精确验收并集已可冻结：S1.1-S1.6、M1.1/M1.2、PC-01..08；TG-01/02/03/04/05/06/11/12/15/16/17/19；I/X/P/Profile；`community-workshop`、`expense-reminder`、`project-delivery-tool` 三项目的 S1.1→S1.6 端到端连续性。
5. 适用指标并集为 Q1=`100%`、Q2=`100% 阻断`、Q3=`100%`、Q6=`100%`、Q11=`20/20`。后续计划还必须冻结缺字段/未知版本/敏感内容/摘要错绑、未确认/未冻结/终态重放、跨项目换料、项目根越界、Profile 冲突、写入故障、架构负例和不安全回滚的完整 fail-closed 并集，以及 `15/15` 架构负例、`5/5` 回滚入口。
6. M1.1 的 S1.1→S1.3 `3/3` 与 M1.2 的 S1.3→S1.6 `3/3` 只能证明入口有基础，不能直接拼接成 V1 PASS。正式 V1 验收必须在同一个精确 F16 隔离上下文中重新执行三项目 S1.1→S1.6 全链、全量回归、Q 指标与 I/X/P/Profile，并形成新的 Result、独立评审、报告和用户会签。
7. M1.1 的三个 P2 必须继续承接：manual-isolated/headless 不证明 trusted-host/full 或真实用户动作；dispatch 因果顺序以 control Git 父链为准；长驻 trusted-host session registry 的生命周期与容量上界未证明。入口 PASS 不会把这些历史风险静默清零。

# 必须修改

无。`required_fixes=[]`。

后续计划候选的硬边界（非修改项）：

- subject 固定为 F16，不得移动或重建 formal。
- 完整纳入 scorecard 中的 PC/TG/Q/三项目连续性/fail-closed/rollback/risk 并集。
- 明确旧 M1.1/M1.2 Result 只作为前置证据，不作为 V1 Result 的拼接输入。
- 计划候选完成后先独立评审；评审通过前不得创建 V1 正式验收 packet、claim/fence 或 dispatch。

# 证据

- subject：`ba7cb6c003bf7f4f11bde33f94f0cb5e6dcf3702`；tree=`a18432964e7b7f537b38ba976ad5c4bc6421c114`；parent=`df9d843d4b2a6ab6855b9c4d75e5ca33101187f1`。
- 实时 refs：formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`；control=`a99593f940c6f38fba2147fc9b2c5bb5594c93a7`。
- M1.1：Result JCS=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`；会签身份核验 scorecard JCS=`sha256:9cffd19db7bae3cd5e5063ef6ccb03b7e0e65cab1ac1e32e3c2c82eeced9f40d`。
- M1.2：Result JCS=`sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`；会签身份核验 commit=`18ab4101bb50513d84f497f2b2b026f5548b4b6e`、scorecard JCS=`sha256:e80feb3747454aaf3a302cba9f6078e3256824cb9668a92b22c6c0b73bda52b8`。
- 正式链：`8ffaf658...` 是 F16 祖先；`f3fdd265...→8540763a...→84c051f7...→024c1db6...→7169e9b0...→ea04b57d...`。六份当前 promotion 的 digest/tree/ancestry/CAS 均通过。
- 验收真源：`docs/exec-plans/completed/p3-version-and-milestone-breakdown.md` 的 PC/TG、V1、M1.1/M1.2、小里程碑、Q1-Q12 与版本验收矩阵；`docs/exec-plans/active/p5-product-implementation-milestones.md` 的当前入口和 V1 出口。
- 状态真源：`PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、control `checkpoint.json` 与 `registry.json` 一致表述 M1.1/M1.2 已完成、V1/P5 未完成、V2 未授权。
- 机械边界：评估开始时工作树 clean；subject `git diff --check HEAD^ HEAD` 通过；不存在 V1 cumulative acceptance 计划或 packet；本轮未修改 main/formal/control/evidence，未读取或触碰用户未跟踪 Multica 文件，也未运行正式 V1 验收。
