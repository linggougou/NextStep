# NextStep

NextStep 是以 Skill 为主交互入口、以项目文档和 Git 为正式真源的 AI 项目闭环落地系统。

当前处于 `S5 / P5`。S1.2/F12 至 S1.6/F16、M1.1、M1.2 与 V1 均已正式完成；CR-006 三个 package gate 与 cumulative gate 均已通过，累计结论=`PASS / 97`、P0/P1/P2=`0/0/3`。这只表示累计门禁通过：`change_request_closed=false`，CR-006 未自动关闭，V2 packet 未创建，formal 未移动，P5 未完成。

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
- 状态身份拆分为：`accepted_subject_main=37c13f34f50a634eb3b1b5c89c1ef5ddcce786aa`、`cumulative_review_commit=813e9fd5240b1af6413a274daa7e307757bbb246`、`cumulative_state_sync_commit=7274c03fbb6e7ee11dc7f24690a2af50ed76169a`、`first_reassessment_review_commit=7a579dd1f08ec65e916e509863846d99f143c9d5`。这些都是历史固定身份；live main 必须在使用时通过 `git rev-parse refs/heads/main` 解析，不把某个历史提交或本文所在提交写成永久 current main。control=`1ac071b0087514390238381fa71cc4b4182983bc`，formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，`plan_generation=5`。
- 累计验收历史测量为 `503/503`、coverage Lines/Branches/Functions=`93.50/88.62/99.22`；首次 V2 入口复评 snapshot 为 `503/503`、`93.48/88.59/99.22`，随后主线复跑 snapshot 为 `503/503`、`93.53/88.69/99.22`。末两位存在运行波动，current gate 只固定 tests=`503/503`、fail/skip/cancel/todo=`0/0/0/0`、各 coverage 维度 `>=80%`；live 百分比必须 fresh 运行生成，不作为提交身份字段。累计 Result digest=`sha256:5512bf9db2b51cef94f87ad90d193b723415007d6501ac4272f24a40affe32a8`，三个固定负例均通过。
- SG-1 两项 P2、SG-2 一项 P2 与 SG-3 两条边界继续保留；精确状态仍是“真实项目价值验证框架可用，真实运行 0/3”。
- 首次 V2 入口复评 `7a579dd...` 因上述状态身份与测量口径两项 P1 得出 `REVISE / 88`；修复合入后，下一唯一允许动作仍是再次独立 V2 entry reassessment。该复评本身不创建 V2 packet，也不表示 CR-006 已关闭或 PC-12、PC-19、V2、V4、P5、真实运行 3/3 完成。
- 不接入 Codex SDK/App Server，不声明宿主 `full` 支持。
- 不恢复 Web/UI 分支，不引入常驻服务或数据库。

当前正式状态与下一入口以 `PROJECT_ROUTE_LOCK.md` 和 `docs/PLANS.md` 为准。
