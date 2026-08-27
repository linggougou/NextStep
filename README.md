# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `S5 / P5`。V1 已正式完成；CR-006 三个 package gate 与 cumulative gate 均已通过，但 `change_request_closed=false`。V2 S2.1 已通过独立 package acceptance 并进入 main；下一唯一入口是准备 S2.2 Execution Packet。S2.1 通过不等于 PC-09、M2.1、V2、formal 或 P5 完成。

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
- S2.1 固定候选=`67dae282065926c2a583643cfc348385f1282554`、独立评审=`3424a8a5e65d7737401cf602d7227bf637194817`、integration checkpoint=`24ef30a3399c8add07b691d288afc50c07160ee5`。live main 必须在使用时通过 `git rev-parse refs/heads/main` 解析；control=`bf7aab75881bf3b8b876cff510ec69fccb55b1a5`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`。
- 累计验收历史测量为 `503/503`、coverage Lines/Branches/Functions=`93.50/88.62/99.22`；首次 V2 入口复评 snapshot 为 `503/503`、`93.48/88.59/99.22`，随后主线复跑 snapshot 为 `503/503`、`93.53/88.69/99.22`。末两位存在运行波动，current gate 只固定 tests=`503/503`、fail/skip/cancel/todo=`0/0/0/0`、各 coverage 维度 `>=80%`；live 百分比必须 fresh 运行生成，不作为提交身份字段。累计 Result digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，三个固定负例均通过。
- SG-1 两项 P2、SG-2 一项 P2 与 SG-3 两条边界继续保留；精确状态仍是“真实项目价值验证框架可用，真实运行 0/3”。
- S2.1 package acceptance Result digest=`sha256:938c6779cf5028629f93d2382713de1d7af444ca4b0fa1ad40dec274ae416fb6`，结论 `PASS / 100`、P0/P1/P2=`0/0/0`；验收 fresh `514/514`、coverage `93.61/88.74/99.27`，主线 fresh `514/514`、coverage `93.63/88.80/99.27`。S2.1 自身 gate passed 且已在 main；下一唯一入口为准备 `S2.2 generation 5 attempt 1` Execution Packet。CR-006、M2.1、V2、V4、P5、formal 与真实运行 3/3 均未完成，也不声明 PC-09 已完成。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
