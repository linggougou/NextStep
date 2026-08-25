# NextStep 可承受性护栏实施上下文

- 记录时间：2026-08-25T23:53:04+08:00
- 用户授权：同意实施“控制复杂度预算、自动状态投影、真实项目价值验证框架”三项改进。
- 当前生命周期：S5 / P5 产品落地。
- 当前正式边界：main=`14f8930f119a0ac3502f3eba00e09558b1f0237d`，formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`，control=`6d5120078a137ecf74b4a4b58cbcba37a61b7148`。
- 当前门禁：V1 已 formally-completed；V2 入口独立评估已通过，但 V2 packet、claim/fence、dispatch 与编码尚未获得精确 control 授权。

## 变更判断

三项改进不是既有 V2 packet，可承接为 P5 的跨版本可承受性护栏，但必须先完成 Change Intake：

1. 控制复杂度预算：高风险基础增强，用于限制每个里程碑的人工批准、CAS、评审包和证据增量；不改变现有审计与 fail-closed 边界。
2. 自动状态投影：与 PC-12 的“进度摘要、阻塞和下一步准确”相邻；当前只允许建立只读投影基础，不据此宣告 PC-12 或 V2 完成。
3. 真实项目价值验证框架：与 PC-19 的量化指标相邻；当前只允许建立研究协议、数据契约和可重复计算入口，不能用 fixture 或回填数据冒充三次真实项目运行。

## 最小可验收闭环

- 一份被路线锁引用的 Change Request 和活动执行计划。
- 三个互斥任务包，每个任务包具有目标、允许路径、非目标、TDD 证据和验收命令。
- 实施前建立精确 control 身份；未获得对应授权时停在规划门禁。
- 实施后由独立审查 Agent 使用 Judge Harness 输出 PASS/REVISE/REJECT。

## 明确非目标

- 不提前实现 V2 的版本链、里程碑生成或真实任务派发。
- 不宣告 PC-12、PC-19、V2、V4 或 P5 完成。
- 不引入数据库、常驻服务、远程控制面或新 UI。
- 不删除、压缩或重写历史 control 证据。
- 不读取或修改用户未跟踪文件 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md`。

## 工具与替代路径

- TDD：使用本地 `tdd-workflow` skill，测试先行，完整检查保持覆盖率高于 80%。
- 独立验收：使用 `judge-harness` skill。
- CodeGraph：当前没有可调用 CodeGraph 工具，且项目未初始化 `.codegraph/`；路线锁规定自动初始化需询问，因此使用 `rg`、项目真源、源码与架构测试完成影响分析，不创建索引。
- 并行：按用户要求使用互斥 Git worktree 和 subagent；主代理只负责计划集成、control 边界与最终回归。
