# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `S5 / P5`。V1 已正式完成；CR-006 三个 package gate 与 cumulative gate 均已通过，但 `change_request_closed=false`、qualified real runs 仍为 `0/3`。V2 S2.1..S2.4 均已通过有效独立 package acceptance 并进入 main；S2.4 attempt 2 implementation/review=`45a3eb0` / `411f2ef`，验收=`PASS / 100`、P0/P1/P2=`0/0/0`，Result digest=`sha256:08901d9dea24d90e81a5d7535cdde3402c32bd15b7046a3b1082baeffc9f434f`，root fresh `555/555`、coverage=`94.36/89.65/99.57`。下一唯一入口不是直接创建 packet，而是先冻结 `P5/V2/M2.1/acceptance` 验收计划并执行独立入口评估；历史 subject 必须固定为 `6ec262fbac45de3d0f84c05a4a5582049139f219`。M2.1、M2.2、V2、`v0.2.0-alpha`、formal 或 P5 均未完成。

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
- 当前状态同步固定父/基线=`411f2ef955ff8498b2fb2b1afa3a3ce97550ea36`，不能把本提交自身未来 OID 写成 live current；live main 必须在使用时通过 `git rev-parse refs/heads/main` 解析。control=`b7900ae27af69cf175b11ab551e73e420e9a01ed`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`。
- 累计验收历史测量为 `503/503`、coverage Lines/Branches/Functions=`93.50/88.62/99.22`；首次 V2 入口复评 snapshot 为 `503/503`、`93.48/88.59/99.22`，随后主线复跑 snapshot 为 `503/503`、`93.53/88.69/99.22`。末两位存在运行波动，current gate 只固定 tests=`503/503`、fail/skip/cancel/todo=`0/0/0/0`、各 coverage 维度 `>=80%`；live 百分比必须 fresh 运行生成，不作为提交身份字段。累计 Result digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，三个固定负例均通过。
- SG-1 两项 P2、SG-2 一项 P2 与 SG-3 两条边界继续保留；精确状态仍是“真实项目价值验证框架可用，真实运行 0/3”。
- S2.2 acceptance attempt 1 因时间语义无效，audit Result digest=`sha256:f6c7681083f5fdb810f1375cf0ce75aeb759c1d4e554617fc027d15dc55a5041`；attempt 2 因 reviewer 越权写 Result/control/main 且与 HG10 声明矛盾而无效，audit Result digest=`sha256:08cf20a2c70e02833444c5ae7893ab007bc5c830441f3119ee2f60c115a6c9be`。两次无效历史均保留，不作为放行证据。
- S2.2 attempt 3 在 `git clone --no-local`、移除 origin 的一次性隔离副本中，由独立 review=`6c48b6c` 得到 `PASS / 100`；corrected S2.3 已有效通过。S2.4 attempt 2 implementation=`45a3eb0a1d924b8f2b4c2b5ab6aa9e975526dc21`、independent review=`411f2ef955ff8498b2fb2b1afa3a3ce97550ea36`，独立 package acceptance=`PASS / 100`、P0/P1/P2=`0/0/0`，Result digest=`sha256:08901d9dea24d90e81a5d7535cdde3402c32bd15b7046a3b1082baeffc9f434f`，root fresh `555/555`、coverage Lines/Branches/Functions=`94.36/89.65/99.57`；精确状态为 `gate-passed/present-in-main`。S2.4 attempt 1 candidate/review/REVISE 与错误 `P5/V2/M2.1/S2.3` attempt 1/fence140 均只作历史保留。下一唯一入口为 M2.1 验收计划冻结与独立入口评估；历史 subject 必须是 `6ec262fbac45de3d0f84c05a4a5582049139f219`，不得使用 live main 或程序性 S2.2 review 替代。M2.1、M2.2、V2、`v0.2.0-alpha`、formal、P5 与 qualified real runs 3/3 均未完成。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
