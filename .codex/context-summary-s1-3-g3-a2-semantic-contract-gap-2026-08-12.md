# S1.3 Generation 3 Attempt 2 语义契约缺口上下文摘要

## 当前阶段与边界

- 生命周期：S5 开发落地；P5 / V1 / M1.1 / S1.3 generation 3。
- 当前 formal：`f3fdd26542e5e562f0b01a9a716d3eb8b46cae36`。
- 当前最小闭环：修复 CR-004 后重走 S1.3 与 M1.1；S1.4 关闭。
- attempt 2 packet 禁止修改 `src/**`、`schemas/**`，只允许两份受影响 fixture、领域测试和留痕。

## Attempt 2 结果

- 执行者先获得产品语义回归 `21/23 RED`，修订后主管 `pnpm check` 为 `125/125`。
- 覆盖率：Lines `90.78%`、Branches `82.15%`、Functions `98.26%`。
- 实际写集仅三份 allowlist 文件；生产源码、Schema、CLI、第三个 fixture、refs 未变。
- 主管与独立评审均判定不可创建候选：`non_goals` 必填与上游无非目标冲突；constraint 仍被包装成 non-goal；语义测试未独立绑定 S1.2 真源；通用 target-user 断言被弱化。
- control result digest：`sha256:d12eb69f11a3023ca38c4410b3b516f469d12831eb1e49e5401448a7baae1c93`；control commit `d48b544aa3566d3e6a5bd985054301dfdc52326c`。
- attempt 2 已墓碑失效；执行者已只撤销自己的三处未提交差异，项目工作树恢复干净。

## 根因

- Schema 的通用 facts 定义对所有字段强制 `minItems: 1`，领域 `assertFacts` 同样拒绝空集合。
- `prd.non_goals` 的允许来源包含 `constraints`，与 P 门禁的角色隔离要求冲突。
- `expense-reminder` 的“工作日早上提醒”位于已冻结 `clarification_gaps`，而产品 activity/result/capability 的来源角色未覆盖它。
- 同一 S1.3 fixture 内部自洽不能替代 S1.2 独立真源绑定。

## 下一入口

- CR-005：产品定义非目标与来源角色契约缺口。
- 原方案经用户审查为 `REVISE / 66`，attempt 3 未获授权。
- 修订候选已完成逐态裁决：`non_goal_gaps` 只有 `identified/none` 可进入 S1.3；`clarification_gaps` 只有 `none` 可进入；其余状态退回 S1.2。
- “工作日早上提醒”归入 S1.2 constraints；community-workshop 与 expense-reminder 均需新 S1.2 版本。
- 三类 S1.1 -> S1.2 -> S1.3 累积回放前移到候选形成前。
- 该变更影响 Schema/数据模型语义，属于高风险基础变更；修订候选必须等待用户重新批准。
- 未批准前不创建 attempt 3、不编码、不移动 formal、不启动 S1.4。

## 第二轮复审更新

- 复审结论：`REVISE / 75`，CR-005 仍未批准，generation 3 attempt 3 继续不授权。
- 新执行入口：获批后推进 plan_generation 4，先完成 S1.2 新版本完整正式提升，再以新 formal baseline 生成 S1.3 generation 4 attempt 1。
- Product Definition 升级为 2.0：`non_goals={status,items,source}`，显式 none 使用完整 Requirement Set item digest；旧 1.0 产品候选 fail closed，不自动迁移。
- CLI、Machine Receipt product data、Skill、三份正例 fixture 和 legacy 拒绝 fixture均纳入迁移；Machine Receipt 信封版本保持 1.0，product data schema_version 为 2.0。
- 关闭顺序固定为 S1.2 新链 formal promotion -> S1.3 2.0 新链 formal promotion -> M1.1 attempt 2 -> 用户会签。
- control `9230a79d621da0f9fb5301afec50f671bc51d169` 仅记录第二轮 revise；checkpoint plan_generation 仍为 3，formal 未移动。
