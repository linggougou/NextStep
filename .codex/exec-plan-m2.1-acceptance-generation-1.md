# V2 / M2.1 里程碑验收 Generation 1 执行计划

## 1. 冻结身份与阶段出口

- 生命周期/路线：`S5 / P5 / V2 / M2.1 / acceptance`。
- `stage_id=P5/V2/M2.1/acceptance`，`task_id=M2.1-I-X-P`，`task_attempt=1`，`plan_generation=5`。
- Acceptance Profile：`headless-primary-with-profile-fixture-matrix`；验收维度固定为 `I / X / P / Profile`。
- 唯一验收 subject：S2.2 状态 checkpoint `6ec262fbac45de3d0f84c05a4a5582049139f219`，tree=`596a2948196f01454192ebe3e2090b8280b4a897`，唯一父=`960d16ded99104ee7409ec6938e501db204ea8fa`，subject digest=`sha256:8ca135a89e6b586e810b04f83d62bde9da02b6ca7852c8786a3de13301534c61`。
- live main `b68dd8974482517089ab558eb347856f4af6bde9` 只用于解释当前项目上下文，不是本次历史验收 subject，不得进入 subject digest、review parent 或结果主体。
- formal 固定为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；本计划入口 control=`100bc6ae2937caf14e6f1e5abc4a88d143583640`。
- 计划修订历史：attempt 1 candidate=`8e2dce7ecdc8cba9c85564cffa408fd0f6f3f3e5`、唯一父=`b68dd8974482517089ab558eb347856f4af6bde9`、tree=`ef958c0940863709f10a6a609b7119105b72bd3c`；独立 entry review=`250d58ba1a24e36354d3607bd4729977443acb51`、唯一父=attempt 1 candidate、tree=`d2cf5f56f2621bc27be80e18dd39c1d3d3226fb1`，结论=`REVISE / 70`、P0/P1/P2=`0/2/0`。二者作为不可变单父历史保留；本文件为 plan revision attempt 2，不改写验收任务自身的 `task_attempt=1`。
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
2. **HG2 control 门**：从入口 control 运行时核对 formal F16、`plan_generation=5`、stage/task/attempt、packet/dedup、claim/fence、ready/outbox、ACK、registry 和 expected-old 单父 CAS；正式审查必须同时消费 clone 内冻结的 pre-ACK ready control 与唯一 ACK evidence ref，证明 ACK 的唯一父精确等于该 ready control。不得消费 stale fence、重复宿主或未确认 tombstone。
3. **HG3 依赖 authority 门**：逐项验证第 2 节 S2.1/S2.2 权威链；两份 invalid audit 必须继续无效，`88eaa581...` / `91ed44a1...` 不得升级为 acceptance authority。
4. **HG4 集成等价门**：证明 S2.1 有效 candidate/review 经 `24ef30a...` 集成，S2.2 有效 candidate 的产品 tree 与 checkpoint 中程序性等价 tree 一致，同时有效独立 review=`6c48b6c...` 和 Result 单独成立；代码等价不得替代验收等价。
5. **HG5 隔离与 readiness 门**：主控先以 `git clone --no-local` provision 一次性副本，移除 origin，确认无 alternates，detached checkout `6ec262f...`；依赖安装必须 `--offline --frozen-lockfile`，且 clone 内 `.git`、`node_modules` 均为普通本地目录。主控在 ACK 前注入 formal F16 与精确 pre-ACK ready control 到 clone 的 `refs/nextstep/formal` / `refs/nextstep/control`，随后派发未来唯一正式 reviewer 执行 readiness-only。该 reviewer 只能只读核对环境并回复 `READY`，不得运行产品测试、不得写文件或提交；主控收到 `READY` 后以 ACK CAS 绑定同一 reviewer host。
6. **HG6 ACK evidence 与正式审查时序门**：ACK CAS 成功后，主控不得更新 clone 中冻结的 `refs/nextstep/control`。主控以 controller-only provisioning 从原仓库按精确 ACK OID 把对象导入 clone，并且只允许通过 expected-old=全零 OID 的 create-once CAS 新增单一 namespaced immutable evidence ref `refs/nextstep/evidence/m2.1-acceptance-ack-f<N>`；该 ref 后续禁止更新或删除。开始正式审查前必须断言：ACK 唯一父=pre-ACK ready control；evidence ref 指向精确 ACK OID；clone 无 remote、无 alternates；formal/control refs 未变；HEAD/tree/worktree 未变；ACK 前后 ref 集合差异精确只有该 evidence ref。随后主控把 `accepted_at`、ACK OID、evidence ref、packet digest、claim/fence 作为不可变边界发给同一 reviewer，该 reviewer 才开始测试、写 exact-three 和验证完整 packet→claim→ready→ACK 单父链。若对象导入、ref 注入或任一断言失败，不得开始评审，必须登记 blocked/recovery，且不得更换 reviewer 冒充同一 attempt。
7. **HG7 可重复测试门**：在 detached `6ec262f...` 上运行 M2.1 targeted 测试，必须 `23/23`；fresh full `pnpm check` 至少 `526/526` 且 fail/skip/cancel/todo=`0/0/0/0`；coverage floors Lines/Branches/Functions=`93.99/89.20/99.49`；`git diff --check` 通过。
8. **HG8 I 维度**：复核 PC-01..PC-20 唯一主版本矩阵为 `20/20`、重复 0、遗漏 0、Backlog 中 PC=0；九个大里程碑 `M1.1..M4.2` 精确齐备、范围互斥、依赖与集成入口可追溯，且只消费冻结的 S2.1/S2.2 authority。
9. **HG9 X/Profile 维度**：对 PC 重复、遗漏、Backlog 偷渡、未知版本/里程碑/字段、非 canonical 输入、大里程碑缺失/重复/范围交叉、验收类型缺失、Profile 缺失/冲突/冒领、依赖 ref 或 digest 漂移逐项证明稳定拒绝；`headless-primary` 正例与 Profile fixture 冲突矩阵必须同时覆盖，不得以默认值放行。
10. **HG10 P 维度**：产品声明只允许覆盖 PC-09、PC-10 与 M2.1“版本与大里程碑生成运行链”；不得宣称 PC-11..PC-13、M2.2、V2、alpha、formal promotion、CR-006、P5 或真实项目 qualified runs 已完成。
11. **HG11 零副作用门**：除 HG6 明确允许的 controller-only 单一 ACK evidence ref 注入外，验收只能读冻结 Git 对象、运行本地构建/测试和写专属 review 目录；reviewer 不得修改任何 ref，也不得访问原仓库或获得原仓库读写能力。不得修改产品 subject、main/formal/control、宿主项目、网络、外部凭证、用户文件或依赖清单；验证前后冻结的 formal/control refs、HEAD/tree 与 tracked 状态必须一致。
12. **HG12 Judge Harness 门**：采用 I/X/P/Profile 四维 scorecard；只有总分满足门槛、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才可 `PASS`。身份、时序、角色隔离、测试或副作用任一硬门失败必须为 `REVISE` 或 `REJECT`，不得由总分抵消。

## 4. 评审输出与角色隔离

- reviewer 必须是未参与 S2.1/S2.2 实现、其无效尝试、M2.1 计划创作和控制面写入的唯一新独立 subagent。
- readiness-only 与 ACK 后正式验收必须由同一唯一 reviewer host 连续承担；readiness 阶段只允许只读回复 `READY`，不运行测试、不写文件、不创建提交。主控不得在同一 attempt 中用替补 reviewer 冒充该身份。
- reviewer 未来写集固定为专属目录 exact-three：`milestone-acceptance.json`、`scorecard.json`、`verdict.md`；三者须以固定 subject 为唯一父提交，不得修改产品、计划、Result、control 或 refs。
- `milestone-acceptance.json` 固定机器可读的 I/X/P/Profile 结论、目标测试、全量测试、覆盖率、失败面、零副作用和 authority 绑定；`scorecard.json` 与 `verdict.md` 遵循 Judge Harness。
- reviewer 不得创建 Result、signoff request、用户 ACK 或 completion；主控不得把 readiness、历史 PASS、程序性 review 或本计划本身包装为独立验收。

## 5. 控制面执行顺序

1. 对本计划做独立 entry review；若需修订，先形成新计划候选再复评。本计划与 entry review 均不授权创建 acceptance packet。
2. 在运行时重新核对 live refs、入口 control、formal、plan generation 和无 pending 冲突后，以独立单父 expected-old CAS 创建唯一 acceptance packet。
3. 以另一独立 CAS 创建唯一 claim/fence；再以另一 CAS 创建 dispatch-ready/outbox。
4. 主控 provision no-local、origin-removed、无 alternates 的一次性 clone，detached checkout 固定 subject，完成 offline frozen 依赖安装，并注入 formal F16 与精确 pre-ACK ready control；此时不得存在 ACK evidence ref。
5. 主控派发未来唯一 reviewer host 执行 readiness-only；reviewer 只读核对后只能回复 `READY`，不得测试、写文件或提交。只有收到该 host 的 `READY`，主控才以另一独立 CAS 固化 dispatch ACK，并把 ACK 绑定同一 host。
6. ACK 后由主控以 controller-only provisioning 导入精确 ACK 对象，以 expected-old=全零 OID 的 create-once CAS 只新增 `refs/nextstep/evidence/m2.1-acceptance-ack-f<N>`，后续禁止更新或删除；不得更新 clone 的 `refs/nextstep/control`。主控完成 HG6 全部断言后，把 ACK `accepted_at`/OID/evidence-ref/packet/fence 不可变边界发送给同一 reviewer，才允许开始正式评审；失败则记录 blocked/recovery，不换 reviewer、不开始评审。
7. 同一 reviewer 验证完整 control 单父链、运行验收并提交 exact-three；主控复算 commit/tree/parent、三份 artifact 摘要、全部硬门和前后 refs。
8. 只有独立 `PASS` 才能以单独 control CAS 创建 M2.1 Result，状态固定为 `passed-awaiting-user-signoff`；不得写 `completed`。
9. 以独立 CAS 创建精确 signoff request；请求必须列明 Result digest、control、subject、review commit、formal 与 `plan_generation=5`。
10. 用户对精确 Result/control 明确会签后，主控实时重读全部身份，以独立 expected-old CAS 固化 user-signoff ACK。
11. user-signoff ACK 成功后，再以另一独立 expected-old CAS 将 M2.1 标记为 completed。ACK CAS 与 completion CAS 不得合并。

## 6. 非目标与停止条件

- 本计划不创建 packet、claim/fence、ready/outbox、ACK、review、Result 或 signoff，不移动任何 ref，也不授权这些动作。
- attempt 1 candidate=`8e2dce7...` 与 REVISE review=`250d58b...` 保持可达且不被改写；本修订与其后 entry review 仍不授权 packet。
- M2.1 完成仅表示 PC-09..PC-10 的里程碑验收闭环通过；不等于 M2.2、V2、`v0.2.0-alpha`、formal、CR-006 或 P5 完成。
- 不修改或重新生成 S2.1/S2.2 产品实现，不重写无效历史，不把后续 S2.3/S2.4 或 live main 功能纳入历史 M2.1 subject。
- 任一身份、control、authority、隔离、时序、测试、覆盖率、失败面、零副作用或角色分离门不成立时立即停止并保留证据，不得降级门禁或口头豁免。
