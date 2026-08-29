# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `S5 / P5`。V1、M2.1、M2.2 与 V2 已 formally-completed；V2 attempt 1 累计验收=`PASS / 100`，I/X/P/Profile=`25/25/25/25`，targeted=`52/52`、full=`555/555`、coverage=`94.45/89.76/99.57`，Result digest=`sha256:f82ce4edd94b587f7f076eb6b52cfffbb2acb0b9b6dd2690a3d1aa4940543ad2`。当前 formal 仍为 F16；下一唯一入口是独立冻结 `v0.2.0-alpha` 计划并完成 fresh entry review，不得直接创建 alpha packet、package、installation 或 tag。CR-006 仍 open、qualified real runs=`0/3`；alpha、V3、V4、Final Acceptance 与 P5 均未完成。

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
- 当前状态同步固定父/基线=`5d389712431c52352df4b5b50d1fa16e97ea3fc0`，不能把本提交自身未来 OID 写成 live current；live main 必须在使用时通过 `git rev-parse refs/heads/main` 解析。control=`4f466224a442dd9650905722398bfad743e327fa`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`。
- 累计验收历史测量为 `503/503`、coverage Lines/Branches/Functions=`93.50/88.62/99.22`；首次 V2 入口复评 snapshot 为 `503/503`、`93.48/88.59/99.22`，随后主线复跑 snapshot 为 `503/503`、`93.53/88.69/99.22`。末两位存在运行波动，current gate 只固定 tests=`503/503`、fail/skip/cancel/todo=`0/0/0/0`、各 coverage 维度 `>=80%`；live 百分比必须 fresh 运行生成，不作为提交身份字段。累计 Result digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，三个固定负例均通过。
- SG-1 两项 P2、SG-2 一项 P2 与 SG-3 两条边界继续保留；精确状态仍是“真实项目价值验证框架可用，真实运行 0/3”。
- S2.2 acceptance attempt 1 因时间语义无效，audit Result digest=`sha256:f6c7681083f5fdb810f1375cf0ce75aeb759c1d4e554617fc027d15dc55a5041`；attempt 2 因 reviewer 越权写 Result/control/main 且与 HG10 声明矛盾而无效，audit Result digest=`sha256:08cf20a2c70e02833444c5ae7893ab007bc5c830441f3119ee2f60c115a6c9be`。两次无效历史均保留，不作为放行证据。
- S2.1..S2.4、M2.1/M2.2 与 PC-09..PC-13 已由 V2 累计验收统一闭合；historical subject=`43df63566b4edd8496f3ad1e62533b980767abd8`，独立 review=`68888402063b36c75c73e8fe937984781b307d71`，用户会签 ACK control=`44993d1789177cbc1e177c422a0adff4fb8f74b1`，分离 completion control=`4f466224a442dd9650905722398bfad743e327fa`。这只证明 fixture/headless/manual-isolated V2 契约，不证明 trusted full host、普通用户端到端使用或真实项目 3/3。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
