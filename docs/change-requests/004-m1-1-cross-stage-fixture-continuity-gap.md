# M1.1 跨阶段 Fixture 连续性缺口

- 状态：closed（2026-08-14 M1.1 用户会签后；generation 3 历史修复与证据保留）
- 记录日期：2026-08-12
- 来源：`P5 / V1 / M1.1` 独立累积验收 attempt 1 退回
- 所属阶段：P5 / V1 / M1.1

## 1. 变更描述

M1.1 独立累积验收发现，三类目标项目的 S1.3 product-definition fixture 均未消费同名 S1.2 回放实际生成的 Frozen Requirement。S1.1、S1.2、S1.3 各阶段内部测试和正式证据链均通过，但跨阶段累计身份连续率为 `0/3`，不能证明 PC-03 真实承接 PC-02 的冻结产物。

## 2. 分流结论

- 类型：当前阶段缺口。
- 原因：不修复就无法满足 M1.1 的同项目累积 DoD；这不是后续增强项。
- 受影响真源：P5 活动计划、M1.1 验收报告、S1.3 三类 fixture、永久累积回归、路线锁和运行时控制代际。
- 受影响能力：PC-03 的累计输入身份，以及 M1.1 I/P 结论；PC-01、PC-02 阶段内结论保持有效。
- 当前正式基线：`f3fdd26542e5e562f0b01a9a716d3eb8b46cae36`，在修复链通过前保持不变。
- 验收结果：`退回 / 73`，`I=REVISE`、`X=PASS`、`P=REVISE`，P0/P1/P2 为 `1/1/2`。

## 3. 建议修复范围

- 三类 S1.3 输入必须精确复用同一回放中 S1.2 产生的 `frozen_requirement_id`、完整内容和 JCS SHA-256 digest，不得重新内嵌语义近似对象。
- 增加永久 M1.1 累积回归，逐类执行 S1.1 intake -> S1.2 completion/confirmation/freeze -> serialization recovery -> S1.3 product definition/signoff，并断言身份、内容和摘要连续。
- 保留现有阶段内正负例；累计测试不能以固定常量相等或复制同一对象绕过真实消费者边界。
- 受影响的 S1.3 fixture、测试、候选验证、I/X/P、L3、最终复验、Credential、Audit Anchor、Anchor Proof 和 formal promotion 必须重新执行。
- 修复后重新发起 M1.1 独立累积验收 attempt 2；通过前 S1.4 继续关闭。

## 4. 风险与验证成本

- 正确性风险：只替换 digest、不复用完整对象会留下 ID/内容断链；只补临时验收脚本会让回归再次发生。
- 证据风险：直接修改现有 formal 或复用旧 S1.3 结论会使旧证据与新内容身份错配。
- 路线风险：无。产品定位、技术栈、PC 定义、版本归属和验收门禁均不改变。
- 验证成本：新增三类累积回放与负例；重跑 `pnpm check`、覆盖率、Skill、audit、JSON、范围和污染检查；随后完整重走 S1.3 正式证据链与 M1.1 验收。

## 5. 代际与回滚

- 建议用户批准后把 `plan_generation` 从 2 推进到 3，墓碑失效 generation 2 中受影响的未闭合 M1.1 验收任务；旧 S1.1、S1.2 正式结果只作为不变前置证据保留。
- 在 generation 3 生成新的 S1.3 修复任务包，范围只覆盖三类连续 fixture、永久累积测试及完成该闭环所必需的最小消费者调整。
- 不原地改写旧 packet、Result Envelope、promotion 或 formal commit；新证据链未通过时，formal 保持 `f3fdd265...`。
- 若修复失败，保留当前 formal 和 `退回 / 73` 结论，继续阻塞 S1.4；不得降级验收标准换取通过。

## 6. 用户决定

- 历史决定：用户于 2026-08-12 曾明确批准按“当前阶段缺口 + plan generation 3”实施修复，并重走 S1.3 正式证据链与 M1.1 attempt 2；该决定仅解释本 CR 已发生的 generation 3 attempt 1/2，不再授权任何后续 attempt。
- 历史授权范围：generation 3 的不可变修复任务包、三类连续 fixture、永久累计回归及既有门禁链。attempt 2 阻塞后，该授权面已关闭；generation 3 attempt 3 永久不再作为入口。
- 继续禁止：降低 M1.1 验收标准、原地改写旧证据、在新链通过前移动 formal，或在 M1.1 会签前启动 S1.4。

## 7. 关闭条件

- generation 3 的历史批准与执行记录已留存；它不满足 CR-005 generation 4 新链的授权或依赖。
- 三类累计身份连续率达到 `3/3`，永久回归可重复且负例 fail closed。
- 受影响 S1.3 正式证据链重新闭环，M1.1 attempt 2 的 I/X/P 与总门禁通过。
- 用户完成 M1.1 阶段会签后，才允许关闭本变更并评估 S1.4 入口。

## 8. Generation 3 执行更新

- attempt 1 已把三类跨阶段 Frozen Requirement 身份、完整 JCS 内容和 digest 连续性修复为 `3/3`，但独立 P 门禁退回两个产品语义映射。
- attempt 2 的测试与 fixture 修订通过本地 `125/125`，但主管和独立评审确认：现有生产契约强制 `non_goals` 非空并允许 constraint 充当 non-goal，且永久语义回归未独立绑定 S1.2 真源。
- attempt 2 已以 `blocked` Result Envelope 固化并墓碑失效，未创建候选；formal 未移动，S1.4 继续关闭。
- 唯一后续入口为 [CR-005](./005-product-definition-semantic-contract-gap.md) 用户决定；CR-005 获批后也只能推进 plan_generation 4，先闭合 S1.2 新正式链。不得创建 generation 3 attempt 3，也不得在获批前修改生产 Schema/领域规则。

## 9. 2026-08-14 关闭结论

- M1.1 attempt 2 `PASS / 97` 用户会签已于 2026-08-14 通过 control CAS 固化；expected-old=`380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`，当前 control=`04677ae041443ba9bca740bb70b814b5347d6b26`。
- CR-004 的 M1.1 会签缺口已关闭；本 CR 的历史修复过程、退回结论、generation 3 证据和后续 CR-005 入口均保留，不回写历史内容。
- formal=F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`、Result digest=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`、`plan_generation=4` 不变，pending=0。
- V1、P5 仍未完成；S1.4 未启动且本次会签未授权启动，下一步仅允许独立评估 S1.4 入口。
