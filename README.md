# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / V1` 持续落地。S1.2/F12 至 S1.6/F16 已完成正式提升；当前 formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`。M1.1 已正式完成，CR-004/CR-005 已关闭；M1.2、V1、P5 尚未完成。

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
- 当前 formal 为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；main 与 formal 一致。
- M1.1 与 S1.4-S1.6 已正式完成；S1.6 Final Verification/Anchor Verification 均为 `PASS / 100`，`pnpm check` 474/474。M1.2、V1、P5 仍未完成；下一步为 M1.2 累计验收。
- 当前 control=`d87aa015002be21c68135defe769e3339546c382`，formal=F16，promotion digest=`sha256:659d2455929a69ce92dcb05c1abd8980ed8f2913303bf5f28eb035431749c5c6`，`plan_generation=4`，pending dispatch=0。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
