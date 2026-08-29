# P5 / V2 累计验收 Generation 1 计划候选

## 1. 计划性质与冻结身份

- 本文件是 `P5 / V2 / cumulative-acceptance` 的 Generation 1 **计划候选**，不是 Execution Packet、control 对象、Result、用户会签或完成结论。
- `stage_id=P5/V2/cumulative-acceptance`，未来任务身份拟固定为 `task_id=V2-I-X-P-Profile`、`task_attempt=1`、`plan_generation=5`；本候选须先经未参与制定的独立 entry reviewer 评审，评审通过也只允许后续另行创建受控 packet。
- formal 固定为 F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，本计划及其 entry review 均不得移动 formal。
- 计划入口 control 固定为 M2.2 分离 completion CAS `ef0ba6525fd2be8ac13c6d07ed4e4a9f991795d2`，唯一父=`d57abec8c8ad71f192142d07b65dc9bc8eef2b7f`；入口 checkpoint 的 `plan_generation=5`、pending dispatch=`0`、formal=F16。
- 唯一 historical acceptance subject 固定为 `43df63566b4edd8496f3ad1e62533b980767abd8`，tree=`09057e7fce389b946bccef8b745875df46f1a984`，唯一父=`a8ba3dae236f3978fd4e97c4ce0062cf81a25b9d`，subject digest=`sha256:5f6e3b0bbcee3fa7cd1b291b754cffaeb17e22fc09d506758701151464b59d0b`。
- `43df635...` 是 M2.2 attempt 2 Result 冻结并经用户会签的精确历史 subject。live main、formal F16、任一 review commit 或未来计划提交均不得替代该 subject。
- P3 冻结的 V2 版本验收维度为 `I / X / P`，并要求 `Profile fixture`；因此本轮累计验收使用 `I / X / P / Profile`。这不改变 M2.2 自身只有 `I / X / P` 的历史结论，也不得把其描述性 fixture 字面量升级为第四维度或 Acceptance Profile 真源。

## 2. 已完成里程碑的精确 authority

### 2.1 M2.1 authority

| 对象 | 精确绑定 | 使用边界 |
|---|---|---|
| Result | ref=`results/result-milestone-acceptance-m2.1-g5-a1-f147-20260827.json`；digest=`sha256:e7aea6578a0e74847a8573397883348f2de41f33b406bb8f7b29a1bfebffb34b`；Result control=`36e1745359cefb3158aa4c4f10bd068468ec606f` | 仅为 `entry_evidence_only`；不得拼接为 V2 PASS |
| historical subject | commit=`6ec262fbac45de3d0f84c05a4a5582049139f219`；tree=`596a2948196f01454192ebe3e2090b8280b4a897`；parent=`960d16ded99104ee7409ec6938e501db204ea8fa`；digest=`sha256:8ca135a89e6b586e810b04f83d62bde9da02b6ca7852c8786a3de13301534c61` | 不得用后续 subject 或 live main 重写 |
| acceptance review | commit=`3c0853b56b7a09b3299e49893f64a721ab3597ea`；tree=`f840cb0e1aa2b1030fece5d7426f945997a955bd`；唯一父=`6ec262fbac45de3d0f84c05a4a5582049139f219` | 独立验收 exact-three authority |
| signoff package | subject=`3b0ce5435a259247b1849788664d39a4406038df`；independent review=`a823f63b35475aeb03d853559af187354cdc6883`；identity review=`5e95f22dae75253ff8f35e022676aa02ad697ad8` | 证明精确会签包与身份核验，不替代用户 ACK |
| user signoff | request control=`cd9cf45d403eb2e91dae9f5c3318bf1ac440b64f`；ACK message=`messages/msg-user-signoff-ack-m2.1-g5-a1-f147-20260827.json`；ACK control=`604ee22a665b83b108f5b0b632da72e368ec6896`；source=`conversation:user-approved-m2.1-attempt-1-2026-08-27` | 用户只批准该精确 M2.1 Result |
| completion | message=`messages/msg-milestone-completion-m2.1-g5-a1-f147-20260827.json`；completion control=`179006320df60365357417c1f20fd774ee3ad632`，唯一父=`604ee22a665b83b108f5b0b632da72e368ec6896` | M2.1=`formally-completed`；formal 未移动 |

### 2.2 M2.2 authority

| 对象 | 精确绑定 | 使用边界 |
|---|---|---|
| Result | ref=`results/result-milestone-acceptance-m2.2-g5-a2-f156-20260828.json`；digest=`sha256:0f706d9e4724c392b19c61216eb0a0d7760543794169642c1575b10bcd1ccb5e`；Result control=`7e4327e599331d2334ec6b1580b92448c4d8fa5f` | 仅为 `entry_evidence_only`；不得拼接为 V2 PASS |
| historical subject | commit=`43df63566b4edd8496f3ad1e62533b980767abd8`；tree=`09057e7fce389b946bccef8b745875df46f1a984`；parent=`a8ba3dae236f3978fd4e97c4ce0062cf81a25b9d`；digest=`sha256:5f6e3b0bbcee3fa7cd1b291b754cffaeb17e22fc09d506758701151464b59d0b` | 本 V2 累计验收唯一 subject |
| acceptance review | commit=`381224e6301c4a2d58841a99c233439c9b2e1e56`；tree=`0cb097f038e8b3f5518e809c43d496ed0e007a13`；唯一父=`43df63566b4edd8496f3ad1e62533b980767abd8` | 独立验收 exact-three authority |
| user signoff | request control=`c5022b60980ccf56f5753f4c5bf8a7e42b93618d`；ACK message=`messages/msg-user-signoff-ack-m2.2-g5-a2-f156-20260829.json`；ACK control=`d57abec8c8ad71f192142d07b65dc9bc8eef2b7f`；source=`conversation:user-approved-m2.2-attempt-2-2026-08-29` | 用户只批准该精确 M2.2 Result |
| completion | message=`messages/msg-milestone-completion-m2.2-g5-a2-f156-20260829.json`；completion control=`ef0ba6525fd2be8ac13c6d07ed4e4a9f991795d2`，唯一父=`d57abec8c8ad71f192142d07b65dc9bc8eef2b7f` | M2.2=`formally-completed`；是本计划唯一 control 入口 |

- 上述 Result、subject、review、用户 ACK 和 completion 必须全部可寻址、摘要匹配、角色分离且保持单父因果链；任一缺失或错绑即 fail closed。
- 分段 PASS 只作为入口证据。V2 必须在同一个 exact subject 上 fresh 重放累计范围，不能把两个历史 Result 拼接成 V2 PASS。
- M2.2 attempt 1 REVISE、错误 S2.3 M2.1/fence140、S2.4 attempt 1 REVISE、superseded candidate 和 coverage remediation 历史 REVISE 均保持无效，不得升级。

## 3. V2 阶段出口与冻结验收并集

V2 只有在 exact `43df635...` 的一次性隔离上下文中重新证明完整并集，才可产生 `passed-awaiting-user-signoff` 的新 V2 Result：

1. milestones=`M2.1,M2.2`；small milestones=`S2.1,S2.2,S2.3,S2.4`；PC=`PC-09..PC-13`；
2. TG union 精确覆盖 `TG-02,TG-03,TG-04,TG-06,TG-07,TG-13,TG-16,TG-19`，不得遗漏 PC-12 的 TG-04；
3. I/X/P/Profile 全部通过，P0/P1/P2=`0/0/0`、`required_fixes=[]`；
4. `community-workshop`、`expense-reminder`、`project-delivery-tool` 三类 fixture 在同一 subject、runner、attempt 中重放；
5. PC 主版本矩阵=`20/20`、重复=`0`、遗漏=`0`、Backlog PC=`0`；九个大里程碑=`9/9` 且互斥；十八个小里程碑=`18/18` 且依赖无环；
6. 缺依赖/DoD/验收标准、Profile 冲突、非 canonical、摘要/attempt/fence 漂移与 allowlist 越界均稳定拒绝；
7. fresh targeted/full/coverage、`git diff --check`、零副作用和角色门全部通过；
8. 用户对未来精确 V2 Result/control 另行会签，并由主控执行分离的 user-signoff ACK CAS 与 completion CAS 后，V2 才可标记 `formally-completed`。

V2 通过不表示 `v0.2.0-alpha` 已打包或发布，不移动 formal，不关闭 CR-006，不满足 qualified real runs `3/3`，也不表示 V3、V4、Final Acceptance 或 P5 完成。

## 4. Fresh 验证硬门

### 4.1 exact targeted 52

在 detached historical subject 上构建后，必须以单次 fresh targeted run 精确执行以下八个文件，合计 `52/52`：

- M2.1 `23/23`：`tests/domain/version-chain.test.ts`、`tests/cli/version-chain.test.ts`、`tests/domain/major-milestone.test.ts`、`tests/cli/major-milestone.test.ts`；
- M2.2 `29/29`：`tests/domain/small-milestone.test.ts`、`tests/cli/small-milestone.test.ts`、`tests/domain/execution-packet.test.ts`、`tests/cli/execution-packet.test.ts`。

精确要求 passed/failed/skipped/cancelled/todo=`52/0/0/0/0`。不得拼接两个历史 run，也不得把源码声明计数冒充运行结果。

### 4.2 fresh full 与 coverage

- 在同一个 no-local、origin-removed、无 alternates clone 中运行 `corepack pnpm install --offline --frozen-lockfile`，记录 downloaded=`0`，随后 fresh 执行 `corepack pnpm check`。
- full 至少 `555/555`，failed/skipped/cancelled/todo=`0/0/0/0`；若 subject 枚举高于 555，必须解释新增测试且全部通过，不得降低分母。
- 同次 full run 的 Node native displayed 与同一 range raw coverage 均不得低于 Lines/Branches/Functions=`94.36/89.65/99.57`；记录 raw covered/total 与精确比例。LCOV 只能旁证，不得跨 run 拼接或替代。
- `git diff --check` 必须通过；测试前后 HEAD/tree、tracked 状态、冻结 refs 与依赖清单必须不变。

## 5. 独立累计验收硬门

1. **HG1 identity**：复算 `43df635...` commit/tree/唯一父/digest，拒绝 live main、formal、review commit、计划提交或 merge commit 替换。
2. **HG2 control**：从入口 `ef0ba652...` 沿单父链核对 M2.1/M2.2 Result→request→用户 ACK→分离 completion，formal=F16、`plan_generation=5`、pending=0；不得复用旧 fence/ACK/host/Result。
3. **HG3 authority**：验证第 2 节 exact authority；无效历史保持无效，tree 等价不得替代 Result、review、会签或 completion。
4. **HG4 union**：覆盖 S2.1..S2.4、M2.1/M2.2、PC-09..13 与冻结 TG；Q4=`20/20, duplicates=0, missing=0, backlog=0`、Q5=`18/18`、Q6 Profile 三类 fixture=`100%`。
5. **HG5 isolation/readiness**：主控 provision 一次性 no-local clone，移除 origin、确认无 alternates，detached `43df635...`，offline frozen 安装后注入 formal 与 pre-ACK ready control；唯一 reviewer 只能回复 `READY`，ACK 前不得测试、写文件或提交。
6. **HG6 ACK evidence**：ACK 绑定同一 reviewer。ACK 后不更新 clone 的 frozen control，只由 controller 导入 ACK 对象并用 expected-old=全零 create-once 新增 `refs/nextstep/evidence/v2-acceptance-ack-f<N>`；证明 ACK 唯一父=ready control，ref 差异精确只有该 evidence ref。
7. **HG7 fresh verification**：第 4 节全部通过；历史数字、计划数字或自报不得替代 fresh 原始摘要。
8. **HG8 I**：三类 fixture 的版本链、大/小里程碑、依赖图和任务包边界连续；PC 唯一归属、九大里程碑互斥、十八个小里程碑七字段、17 条依赖边和任务包 authority 可追溯。
9. **HG9 X/Profile**：重复/遗漏/Backlog 偷渡、未知字段/版本/里程碑、非 canonical、依赖缺失/未知/自依赖/有环、字段或验收缺失、digest/ref/attempt/fence 漂移、敏感信息与 allowlist 越界均 fail closed。headless、ui-with-evidence、route-conflict 三类 Profile fixture 精确裁决；reviewer 不能声明或改变 UI 适用性。
10. **HG10 P**：产品结论只覆盖 V2、PC-09..13 与计划/任务包边界运行闭环；不得宣称 alpha、formal promotion、CR-006 closure、qualified real runs、V3/V4/FA 或 P5 完成。
11. **HG11 zero side effects**：除 controller-only 单一 ACK evidence ref 外，reviewer 只能读冻结对象、运行本地验证并写专属 exact-three；不得访问原仓库、修改 refs、产品 subject、依赖、外部项目、用户文件或网络状态。
12. **HG12 Judge Harness**：scorecard 固定 I/X/P/Profile；只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才可创建 V2 Result。任一硬门失败必须 `REVISE` 或 `REJECT`。

## 6. 评审输出与角色隔离

- 正式 reviewer 必须是未参与 S2.1..S2.4 实现、M2.1/M2.2 验收、coverage remediation、本计划、entry review 和 control 写入的唯一新独立 subagent。
- readiness-only 与 ACK 后正式验收由同一 reviewer host 连续承担；同一 attempt 不得更换 reviewer。
- reviewer 写集固定为专属目录 exact-three：`version-acceptance.json`、`scorecard.json`、`verdict.md`；三者以 `43df635...` 为唯一父，不得修改产品、计划、Result、control 或 refs。
- `version-acceptance.json` 必须包含 subject/control/packet/claim/fence/ACK、authority、I/X/P/Profile、PC/TG/Q4/Q5/Q6、52 targeted、full、coverage raw/displayed、三 fixture 连续性、失败面、零副作用与未完成边界。
- reviewer 不得创建 Result、signoff request、用户 ACK 或 completion；主控不得把 entry review、readiness、分段 PASS 或历史 Result 包装为 V2 PASS。

## 7. 后续控制面顺序（当前不执行）

1. 对本计划候选做唯一独立 entry review；REVISE/REJECT 时只修订计划并重新评审。
2. entry review PASS 后，主控重新读取 live formal/control/generation/pending/subject，才可用后续独立 expected-old 单父 CAS 创建唯一 V2 packet。
3. 分离 CAS 创建 claim/fence、ready/outbox；完成 clone provisioning 与 readiness-only 后，另一 CAS 固化 ACK。
4. 按 HG6 create-once 注入 ACK evidence；全部断言通过后，同一 reviewer 才运行累计验收并提交 exact-three。
5. 主控复算全部 identity/evidence；只有 PASS / 100 才以单独 CAS 创建 immutable V2 Result，状态=`passed-awaiting-user-signoff`。
6. 生成精确 V2 用户会签报告并独立终审；再以单独 CAS 创建 signoff request，列明 Result digest/control、subject、review、formal 与 generation。
7. 用户对精确 Result/control 明确会签后，主控重新核对身份并以独立 CAS 固化 user-signoff ACK。
8. ACK 后以另一独立 CAS 标记 V2 `formally-completed`。completion 不移动 formal，也不自动创建 alpha 包、V3 packet、关闭 CR-006 或完成 P5。

## 8. 当前边界、风险与停止条件

- 本候选及 entry review 只允许修改 `.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`、`.codex/operations-log.md`、`.codex/verification-report.md`；不得创建 packet/control/ref、派发正式 reviewer 或运行正式 V2 验收。
- 不修改生产代码、Schema、fixture、依赖、Skill、路线锁、产品真源、main/formal/control 或历史 evidence。
- CR-006 继续 `change_request_closed=false`，qualified real runs 继续 `0/3`。
- carry-forward：当前只证明 fixture/headless/manual-isolated 合同，不证明真实项目 qualified run、公开发行、可信 full 宿主或普通用户端到端可用；不得在 V2 产品结论中静默清零。
- 任一 identity、authority、Profile、测试枚举、coverage range、角色隔离或时序存在歧义即停止，不得自行放宽。
- 本候选不声明 V2、`v0.2.0-alpha`、CR-006、formal、V3、V4、Final Acceptance 或 P5 完成，也不自行批准本计划。
