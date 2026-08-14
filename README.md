# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / V1` 持续落地。S1.2 与 S1.3 generation 4 已完成两段式正式提升，formal=F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`。M1.1 attempt 2 `PASS / 97` 用户会签已于 2026-08-14 通过 control CAS 固化并正式完成；CR-004/CR-005 已关闭。

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

- S1.3 generation 4 已通过完整正式证据链并提升到 F13。
- 当前 formal 为 F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`；main 包含 F13。
- M1.1 已正式完成；S1.4 attempt 2 候选 `c2894cd...` 已通过独立 CV `PASS`、I/X/P `PASS / 99` 与 L3 `PASS / 98`；`pnpm check` 206/206，下一步仅为 Final Content Snapshot 与后续正式提升链。S1.4、M1.2、V1、P5 仍未完成。
- 当前 control=`b006667d8c81bad3ff3ba5d022063e420c7097e2`，formal=F13，S1.4 L3 Result digest=`sha256:e67c155b22a917fa2d89887c4b370a50eea15c63aa85c10308050b6cfa567eb7`，`plan_generation=4`，pending dispatch=0。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
