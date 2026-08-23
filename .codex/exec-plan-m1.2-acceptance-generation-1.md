# M1.2 累计验收 Generation 1 执行计划

## 1. 当前身份与阶段出口

- 生命周期/路线：`S5 / P5 / V1 / M1.2 / acceptance`。
- 精确 subject：formal F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`，tree `5b97a4432fbedb3dda189e05052c2e7665a1bea8`，三元组 subject digest `sha256:3e75ad6dffe9a2f5479f0e2c48bea6e45f04593b4e75ac14d48e1e4cbb891672`。
- 入口 control：`d87aa015002be21c68135defe769e3339546c382`，`plan_generation=4`，pending dispatch=0。
- 正式前驱：F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11` → F14 `024c1db6d941b6f771746c8d6249fb8a09b816f3` → F15 `7169e9b019fe2213ca76babb4122a84760bdf112` → F16。
- 阶段出口：独立 I/X/P 均通过，P0/P1=0，required fixes 为空，三类目标项目累计连续性、PC/TG/Q 指标和 F14-F16 正式证据链全部可复核；随后只形成待用户会签状态，不由 Agent 代签。

## 2. 验收范围

| 切片 | 累计能力 | 必须复核 |
|---|---|---|
| S1.4 / PC-04..05 | 载体无关原型、载体裁决、Profile | headless/UI/冲突三类裁决；Q6=100%；Web/UI 不误入主线 |
| S1.5 / PC-06..07 | 项目/阶段解析、确认与写入一致性 | 三类正例；13/13 write-consistency；主对话拒写、部分写入、权限、符号链接、基线/并发漂移 fail closed |
| S1.6 / PC-08 | 技术架构、风险与回滚 | 十类必填字段；Q3=100%；20 项风险；Q11=20/20；五类回滚入口；错误阶段/非 F15/摘要漂移/敏感输入阻断 |
| M1.2 累计链 | PC-04..08 | community-workshop、expense-reminder、project-delivery-tool 按 S1.3 Product Definition→S1.4 carrier/profile→S1.5 write record→S1.6 architecture assessment 连续回放，项目身份、完整 canonical 内容、digest 与产品语义连续率均为 3/3 |

适用 TG 按 PC-04..08 完整并集固定为 `TG-01/02/03/04/05/06/11/12/15/16/17/19`。验收结论只允许声明 `manual-isolated/headless consumer contract`；不得声明真实宿主、trusted-host 或 `full`。

## 3. 独立验证矩阵

1. 以 `git clone --no-local` 创建唯一隔离副本并 detached checkout F16；安装必须 frozen/offline，运行 `pnpm check`，不得用 main 或历史 Result 代替正式 subject。
2. 为三类目标项目建立临时累计 runner，直接调用已提交的领域/CLI 能力并逐阶段复算 JCS/digest；runner 只存在于隔离验证目录，不写回 formal subject。
3. I：复核 S1.4-S1.6 依赖、F13→F16 ancestry、三份 promotion、Credential、Anchor、Proof、CV/I-X-P/L3/FV/AV Result 与 control 记录。
4. X：复核 Profile 冲突、缺确认、主对话写入、写入失败、摘要漂移、风险缺失/重复/未知、错误阶段、非 F15、敏感内容和冒领 full 全部 fail closed。
5. P：复核 PC-04..08 的目标、范围、非目标、用户路径、Q3/Q6/Q11 与适用 TG 满足 M1.2 DoD。
6. 验证前后 formal/control/main、subject tree 和用户 Multica 未跟踪文档不得变化；评审提交只允许新增专属 review 目录和 `docs/qa/` 验收报告候选。

## 4. 控制面与职责隔离

- 首次正式任务固定为 `M1.2-I-X-P / attempt 1`；packet/dedup、ready、outbox、claim、fence、ack 和 registry 必须在派发前持久化并以 expected-old control CAS 串行推进。
- 独立验收 subagent 不参与 S1.4-S1.6 实现、CV、I/X/P、L3、FV 或 AV，不得修改产品代码、formal、control 或外部 Credential/Proof。
- Result 仅在三维全部通过后登记为 `awaiting-user-signoff`；若任一硬门失败，状态为退回/需讨论/阻塞，并回到对应 S1.4/S1.5/S1.6 或真源入口。
- 用户会签前不得标记 M1.2 完成，不得启动 V1 累计验收或 V2。

## 5. 非目标与停止条件

- 不新增产品功能、Schema、依赖、宿主适配或正式提升实现。
- 不重新生成 F14-F16 Snapshot/Credential/Anchor/Proof，不移动 formal。
- 不触碰、纳入或清理 `.codex/context-summary-multica-migration-feasibility-2026-08-22.md`。
- packet 摘要、subject、formal/control、证据内容寻址、测试结果或累计连续性任一不一致即 fail closed；不得用历史 PASS 口头豁免。

## 6. 执行顺序

1. 同步 F16 状态真源并对本计划做独立 entry review。
2. 吸收 entry review 的必修项，冻结 source refs、packet 和七字段 dedup。
3. 以新 fence 派发独立 M1.2 I/X/P 验收。
4. 主控复算 Result/review 摘要并登记 `awaiting-user-signoff`。
5. 对用户会签包做独立终审；用户明确批准后再实时重读 formal/control/Result/plan_generation，以 expected-old control CAS 固化 M1.2 完成。
6. M1.2 完成后只允许单独评估 V1 累计验收入口。
