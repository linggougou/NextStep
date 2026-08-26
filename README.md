# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / CR-006 SG-2 packet preparation gate`。S1.2/F12 至 S1.6/F16、M1.1、M1.2 与 V1 均已正式完成；V2 入口独立评估=`PASS / 100`，但产品 packet 继续暂停。CR-006 SG-1 复杂度预算内核已通过正式独立验收 `PASS / 98`；下一步仅为单独准备 SG-2 packet。P5 未完成，formal 不因 CR-006 子包验收而移动。

## 环境

- Node.js `24.14.0`
- pnpm `10.33.2`

Node 版本记录在 `.nvmrc`，包管理器版本记录在 `package.json`。

## 本地验证

```bash
corepack pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

完整门禁：

```bash
pnpm check
```

测试使用 Node 内置测试运行器。覆盖率门禁要求行、函数和分支均不低于 80%。

## 当前边界

- S1.4、S1.5、S1.6 已分别通过完整正式证据链并提升到 F14、F15、F16。
- 当前 formal 为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；main 额外承载 V1 验收评审与会签报告材料，不等同于 formal。
- M1.1 与 S1.4-S1.6 已正式完成；M1.2 attempt 1 在精确 F16 隔离副本中完成 `pnpm check` 474/474，I/X/P/Profile=`25/25/25/25`，累计验收本体 `PASS / 100`，用户会签与 expected-old control CAS 已固化，M1.2 正式完成。
- 当前 main=`b0aa9b9`，control=`830d831808a92f53dfca4dea87bb98c71e448fb1`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`。SG-1 Result=`sha256:e04bd4b0c8efea41eb6015628205752624d58e92400d02565e01c61b244592e4`；其代码曾在正式验收前提前 cherry-pick，异常历史已保留，事后 PASS 不改写原时序。V2 入口评估通过不等于 packet 授权；P5 未完成。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
