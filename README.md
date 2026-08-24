# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / V1` 持续落地。S1.2/F12 至 S1.6/F16 已完成正式提升；当前 formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`。M1.1、M1.2 均已正式完成；V1 累计验收入口与 Generation 1 计划已分别通过独立 `PASS / 100` 评审，用户已授权生成首次 packet 并执行对应 control CAS，但尚未授权派发或执行正式验收。V1、P5 尚未完成，V2 未授权。

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
- 当前 formal 为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；main 额外承载 M1.2 入口/验收评审与会签报告材料，不等同于 formal。
- M1.1 与 S1.4-S1.6 已正式完成；M1.2 attempt 1 在精确 F16 隔离副本中完成 `pnpm check` 474/474，I/X/P/Profile=`25/25/25/25`，累计验收本体 `PASS / 100`，用户会签与 expected-old control CAS 已固化，M1.2 正式完成。
- packet CAS 前 control=`a99593f940c6f38fba2147fc9b2c5bb5594c93a7`，formal=F16，M1.2 Result digest=`sha256:73daa2141583898a82c64541e9fb96faf4ea5375fcc1cd0a79e4b0c9fa20366a`，`plan_generation=4`，pending dispatch=0；本轮只允许首次 V1 packet/control CAS，不允许 claim/fence/dispatch。V1/P5 未完成，V2 未授权。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
