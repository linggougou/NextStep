# V2 / M2.1 里程碑验收 Generation 1 执行计划

## 1. 冻结身份与阶段出口

- 生命周期/路线：`S5 / P5 / V2 / M2.1 / acceptance`。
- `stage_id=P5/V2/M2.1/acceptance`，`task_id=M2.1-I-X-P`，`task_attempt=1`，`plan_generation=5`。
- Acceptance Profile：`headless-primary-with-profile-fixture-matrix`；验收维度固定为 `I / X / P / Profile`。
- 唯一验收 subject：S2.2 状态 checkpoint `6ec262fbac45de3d0f84c05a4a5582049139f219`，tree=`596a2948196f01454192ebe3e2090b8280b4a897`，唯一父=`960d16ded99104ee7409ec6938e501db204ea8fa`，subject digest=`sha256:8ca135a89e6b586e810b04f83d62bde9da02b6ca7852c8786a3de13301534c61`。
- live main `b68dd8974482517089ab558eb347856f4af6bde9` 只用于解释当前项目上下文，不是本次历史验收 subject，不得进入 subject digest、review parent 或结果主体。
- formal 固定为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；本计划入口 control=`100bc6ae2937caf14e6f1e5abc4a88d143583640`。
- 阶段出口：在固定 subject 上完成独立 I/X/P/Profile 验收，Judge Harness 结论为 `PASS`，P0/P1/P2=`0/0/0`，`required_fixes=[]`；主控复算全部身份和证据后只能登记 `passed-awaiting-user-signoff`。用户精确会签及独立 completion CAS 完成前，M2.1 不得标记完成。

## 2. 权威依赖与无效历史

| 对象 | 权威绑定 | 用途与边界 |
|---|---|---|
| S2.1 candidate | `67dae282065926c2a583643cfc348385f1282554` | PC-01..PC-20 唯一主版本矩阵与冲突拒绝实现 |
| S2.1 independent review | `3424a8a5e65d7737401cf602d7227bf637194817` | 有效独立 package acceptance 证据 |
| S2.1 integration checkpoint | `24ef30a3399c8add07b691d288afc50c07160ee5` | candidate/review 已进入 main 的集成证据 |
| S2.1 acceptance Result | `sha256:938c6779cf5028629f93d2382713de1d7af444ca4b0fa1ad40dec274ae416fb6` | S2.1 有效验收 authority |
| S2.2 candidate | `d35e63d4ca7a6cca3ac3ac662b77a0ca482ad51e` | 九个大里程碑互斥边界与 Profile 绑定实现 |
| S2.2 valid independent review | `6c48b6c47215f45781734572902e1012e3ddef5d` | attempt 3 有效独立 package acceptance 证据 |
| S2.2 integration checkpoint | `6ec262fbac45de3d0f84c05a4a5582049139f219` | 本次唯一历史验收 subject |
| S2.2 acceptance Result | `sha256:332323df803af638aac65a6044d0cf17a171dc8ff5744e213385f18fda089c0e` | S2.2 有效验收 authority |

- attempt 1 temporal-invalid audit `sha256:f6c7681083f5fdb810f1375cf0ce75aeb759c1d4e554617fc027d15dc55a5041` 与 attempt 2 role-authority-invalid audit `sha256:08cf20a2c70e02833444c5ae7893ab007bc5c830441f3119ee2f60c115a6c9be` 只作不可变无效历史，不得计入 PASS、依赖满足或角色分离证据。
- checkpoint `6ec262f...` 中程序性 candidate/review `88eaa581a466dc7777825b41079b490ccb5efb8d` / `91ed44a192685bfcba04b032b9fdba4aa9c506cb` 只可用于 tree/集成等价核对；二者不得冒充独立验收、Result 或用户会签 authority。
- S2.1 与 S2.2 的 candidate、有效 review、integration checkpoint 和 acceptance Result 必须全部可寻址且相互一致；任一缺失、摘要不匹配、角色越权或 ancestry 不成立即 fail closed。

## 3. 独立验收硬门

1. **HG1 身份门**：独立复算 subject commit/tree/唯一父/三元组 digest，精确匹配第 1 节；拒绝 live main、其他 checkpoint、merge commit、重写提交或自洽重哈希替换。
2. **HG2 control 门**：从入口 control 运行时核对 formal F16、`plan_generation=5`、stage/task/attempt、packet/dedup、claim/fence、ready/outbox、ACK、registry 和 expected-old 单父 CAS；不得消费 stale fence、重复宿主或未确认 tombstone。
3. **HG3 依赖 authority 门**：逐项验证第 2 节 S2.1/S2.2 权威链；两份 invalid audit 必须继续无效，`88eaa581...` / `91ed44a1...` 不得升级为 acceptance authority。
4. **HG4 集成等价门**：证明 S2.1 有效 candidate/review 经 `24ef30a...` 集成，S2.2 有效 candidate 的产品 tree 与 checkpoint 中程序性等价 tree 一致，同时有效独立 review=`6c48b6c...` 和 Result 单独成立；代码等价不得替代验收等价。
5. **HG5 隔离门**：以 `git clone --no-local` 创建一次性副本，移除 origin，detached checkout `6ec262f...`；依赖安装必须 `--offline --frozen-lockfile`，且 clone 内 `.git`、`node_modules` 均为普通本地目录。formal/control 只允许在 ACK 前由主控按冻结值注入 clone 内只读 ref。
6. **HG6 ACK 后时序门**：独立 reviewer 先只做 readiness；主控完成独立 packet、claim/fence、ready/outbox 和 dispatch ACK CAS 后，才可发送不可变验收边界并开始评审。评审产物时间、首个写入和 commit 必须晚于 ACK；时钟、有效期或顺序不可信即 fail closed。
7. **HG7 可重复测试门**：在 detached `6ec262f...` 上运行 M2.1 targeted 测试，必须 `23/23`；fresh full `pnpm check` 至少 `526/526` 且 fail/skip/cancel/todo=`0/0/0/0`；coverage floors Lines/Branches/Functions=`93.99/89.20/99.49`；`git diff --check` 通过。
8. **HG8 I 维度**：复核 PC-01..PC-20 唯一主版本矩阵为 `20/20`、重复 0、遗漏 0、Backlog 中 PC=0；九个大里程碑 `M1.1..M4.2` 精确齐备、范围互斥、依赖与集成入口可追溯，且只消费冻结的 S2.1/S2.2 authority。
9. **HG9 X/Profile 维度**：对 PC 重复、遗漏、Backlog 偷渡、未知版本/里程碑/字段、非 canonical 输入、大里程碑缺失/重复/范围交叉、验收类型缺失、Profile 缺失/冲突/冒领、依赖 ref 或 digest 漂移逐项证明稳定拒绝；`headless-primary` 正例与 Profile fixture 冲突矩阵必须同时覆盖，不得以默认值放行。
10. **HG10 P 维度**：产品声明只允许覆盖 PC-09、PC-10 与 M2.1“版本与大里程碑生成运行链”；不得宣称 PC-11..PC-13、M2.2、V2、alpha、formal promotion、CR-006、P5 或真实项目 qualified runs 已完成。
11. **HG11 零副作用门**：验收只能读冻结 Git 对象、运行本地构建/测试和写专属 review 目录；不得修改产品 subject、main/formal/control、宿主项目、网络、外部凭证、用户文件或依赖清单。验证前后固定 refs、subject tree 与 tracked 状态必须一致。
12. **HG12 Judge Harness 门**：采用 I/X/P/Profile 四维 scorecard；只有总分满足门槛、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才可 `PASS`。身份、时序、角色隔离、测试或副作用任一硬门失败必须为 `REVISE` 或 `REJECT`，不得由总分抵消。

## 4. 评审输出与角色隔离

- reviewer 必须是未参与 S2.1/S2.2 实现、其无效尝试、M2.1 计划创作和控制面写入的唯一新独立 subagent。
- reviewer 未来写集固定为专属目录 exact-three：`milestone-acceptance.json`、`scorecard.json`、`verdict.md`；三者须以固定 subject 为唯一父提交，不得修改产品、计划、Result、control 或 refs。
- `milestone-acceptance.json` 固定机器可读的 I/X/P/Profile 结论、目标测试、全量测试、覆盖率、失败面、零副作用和 authority 绑定；`scorecard.json` 与 `verdict.md` 遵循 Judge Harness。
- reviewer 不得创建 Result、signoff request、用户 ACK 或 completion；主控不得把 readiness、历史 PASS、程序性 review 或本计划本身包装为独立验收。

## 5. 控制面执行顺序

1. 对本计划做独立 entry review；若需修订，先形成新计划候选再复评。本计划与 entry review 均不授权创建 acceptance packet。
2. 在运行时重新核对 live refs、入口 control、formal、plan generation 和无 pending 冲突后，以独立单父 expected-old CAS 创建唯一 acceptance packet。
3. 以另一独立 CAS 创建唯一 claim/fence；再以另一 CAS 创建 dispatch-ready/outbox。
4. 在一次性隔离 clone readiness 通过后派发唯一 reviewer；以另一独立 CAS 固化 dispatch ACK，随后才允许评审。
5. reviewer 提交 exact-three；主控复算 commit/tree/parent、三份 artifact 摘要、全部硬门和前后 refs。
6. 只有独立 `PASS` 才能以单独 control CAS 创建 M2.1 Result，状态固定为 `passed-awaiting-user-signoff`；不得写 `completed`。
7. 以独立 CAS 创建精确 signoff request；请求必须列明 Result digest、control、subject、review commit、formal 与 `plan_generation=5`。
8. 用户对精确 Result/control 明确会签后，主控实时重读全部身份，以独立 expected-old CAS 固化 user-signoff ACK。
9. user-signoff ACK 成功后，再以另一独立 expected-old CAS 将 M2.1 标记为 completed。ACK CAS 与 completion CAS 不得合并。

## 6. 非目标与停止条件

- 本计划不创建 packet、claim/fence、ready/outbox、ACK、review、Result 或 signoff，不移动任何 ref，也不授权这些动作。
- M2.1 完成仅表示 PC-09..PC-10 的里程碑验收闭环通过；不等于 M2.2、V2、`v0.2.0-alpha`、formal、CR-006 或 P5 完成。
- 不修改或重新生成 S2.1/S2.2 产品实现，不重写无效历史，不把后续 S2.3/S2.4 或 live main 功能纳入历史 M2.1 subject。
- 任一身份、control、authority、隔离、时序、测试、覆盖率、失败面、零副作用或角色分离门不成立时立即停止并保留证据，不得降级门禁或口头豁免。
