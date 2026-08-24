# V1 用户会签判断上下文摘要

## 任务定位

- 项目阶段：`S5 / P5`，当前任务属于版本验收与用户会签判断。
- 当前阶段出口：V1 attempt 5 用户针对精确 Result 完成语义会签，随后由主控分别执行 user-signoff ACK CAS 与 V1 completion CAS。
- 本轮最小可验收闭环：只读核对 formal、实时 control、Result digest、plan generation、会签包与三项 P2 风险，给出是否建议用户同意的判断。
- 里程碑真源：`PROJECT_ROUTE_LOCK.md`、`docs/exec-plans/active/p5-product-implementation-milestones.md`。
- 会签真源：`docs/qa/p5-v1-cumulative-acceptance-attempt-5-2026-08-24.md` 与 control `48cff32bbb03b4814813cd97086a3f789cd17b72` 中的 signoff request。

## 执行边界

- 允许：读取 Git 对象、复算 RFC8785/JCS 和文件摘要、检查 refs/父链、审阅既有 L3 与会签包终审证据、写入 `.codex` 审查留痕。
- 禁止：代替用户会签、执行 ACK/completion CAS、移动 formal/control、重建 Result、重跑 attempt 5 的唯一 install/check/runner、进入或授权 V2、读取或处理受保护的未跟踪 Multica 文件。
- 变更判断：没有新需求、路线变更或阶段切换；本轮只判断既有 V1 会签门禁。
- 高危动作：无。本轮不执行控制面或产品变更。

## 实时身份

- main/HEAD：`6be44f3e622dbfa909c730ecc97e57258b4eb052`
- formal：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- current control：`48cff32bbb03b4814813cd97086a3f789cd17b72`
- Result control：`07fb99f61202972a0d04ec30afab2bc883a8c42d`
- Result digest：`sha256:fd5e6c09a20ad35c25261bf0b0ace81da14767576ebb84361701cb01594c881b`
- plan generation：`4`

## 关键判断

- `07fb...` 与 `48cff...` 不是冲突：前者是不可变 Result control，后者是以 `07fb...` 为唯一父的 signoff-request current control。
- Result 在移除顶层 `result_digest` 后按项目 RFC8785 canonicalizer 复算，与声明 digest 精确一致。
- candidate、独立 L3、会签包 replacement 终审的对象身份、父链、写集和 JCS 摘要匹配；当前 registry 为 `awaiting-user-signoff`、signoff 为 `pending`、V1 为 `not-completed`。
- 三项 P2 是明确 carry-forward，而非静默关闭：trusted-host/full 与长生命周期 registry 属于后续宿主相关里程碑，V3 仍要求至少一个主宿主为 `full`。
- 建议结论：可以同意精确会签文本；该结论不替代用户本人发送语义授权。
