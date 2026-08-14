# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `P5 / V1` 持续落地。S1.2/F12、S1.3/F13 与 S1.4/F14 已完成正式提升；当前 formal=F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3`。M1.1 已正式完成，CR-004/CR-005 已关闭；M1.2、V1、P5 尚未完成。

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

- S1.3 generation 4 已提升到 F13；S1.4 attempt 2 已通过完整正式证据链并提升到 F14。
- 当前 formal 为 F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3`；main 包含 F14。
- M1.1 与 S1.4 已正式完成；S1.4 Final Verification/Anchor Verification 均为 `PASS / 98`，`pnpm check` 206/206。M1.2、V1、P5 仍未完成；下一步仅为 S1.5 入口评估。
- 当前 control=`f3581247189e719370f339b0e061e47d8df5556c`，formal=F14，promotion digest=`sha256:c313ba63a171124d5e2448499b747684a9e9a3b0e0b345d1a90af162bcd89937`，`plan_generation=4`，pending dispatch=0。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
