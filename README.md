# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / V1 / M1.1` 缺口修复。S1.2 generation 4 已正式提升到 F12，formal 为 `8540763a9719cda5c5632b68bb770c95f0ceaecf`；main 已 ff-only 同步并包含 F12。S1.3 generation 4 仅处于规划，packet 未创建。

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

- S1.3 generation 4 仅处于规划，packet 未创建；不修改生产 Schema/领域规则。
- 当前 formal 保持 F12 `8540763a9719cda5c5632b68bb770c95f0ceaecf`；`refs/nextstep/control` 只允许记录当前门禁和恢复状态。
- 不启动 S1.4；M1.1、V1 和 P5 均未完成。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
