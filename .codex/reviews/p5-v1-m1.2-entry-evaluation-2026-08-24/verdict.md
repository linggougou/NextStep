# M1.2 累计验收入口独立评审

## 结论

`PASS / 100`。P0/P1/P2=`0/0/0`，九项硬门全部通过，`required_fixes=[]`。

本结论仅允许从精确 entry subject `88fd311e79d187a05816e7f723c57ba25de22d7f` 继续冻结 `M1.2-I-X-P / attempt 1` 的 source refs、packet、dedup、ready/outbox、claim/fence 与 ACK。它不构成 M1.2 累计验收通过，不代替用户会签，不完成 V1/P5，也不移动 formal F16。

## 为什么

- F16 commit/tree/parent 与三元组 subject digest 已独立复算匹配；formal/control 实时身份与入口计划一致。
- 路线锁、README、PLANS、P5 活动计划和 QA 状态已同步为 S1.4-S1.6 正式完成、M1.2/V1/P5 未完成，不再保留 F15/S1.6 待启动旧状态。
- PC-04..08 的 TG 完整并集已冻结为 `TG-01/02/03/04/05/06/11/12/15/16/17/19`，Q3/Q6/Q11 和 Profile 三类 fixture 均进入硬门。
- 三类项目必须按 `S1.3 Product Definition → S1.4 carrier/profile → S1.5 write record → S1.6 architecture assessment` 累计回放；静态抽查三条 fixture 链的 profile/product/carrier/scenario/record digest 均逐项闭合。
- packet 前持久化、实时 expected-old control CAS、claim/fence、独立验收、Result、会签包终审、用户明确批准和最终 CAS 的顺序完整；Agent 不代签。
- 用户 Multica 未跟踪文档被明确排除，且不在 subject tree 或变更集中；验收结论严格限定为 `manual-isolated/headless consumer contract`。

## 必须修改

无。

生成 claim 时必须按实时 control 分配 fence；历史最大值虽然是 `111`，但 `112` 只能在 claim CAS 成功后成为正式事实。失败验收也应保留不可变 Result envelope，只是不得进入 `awaiting-user-signoff`。

## 证据

- Entry subject：`88fd311e79d187a05816e7f723c57ba25de22d7f`
- Entry parent / F16：`ea04b57de83d6c548dcb1629b1f61832db8375ad`
- F16 tree：`5b97a4432fbedb3dda189e05052c2e7665a1bea8`
- F16 subject digest：`sha256:3e75ad6dffe9a2f5479f0e2c48bea6e45f04593b4e75ac14d48e1e4cbb891672`
- Entry control：`d87aa015002be21c68135defe769e3339546c382`
- 计划：`.codex/exec-plan-m1.2-acceptance-generation-1.md`
- 真源：`PROJECT_ROUTE_LOCK.md`、`docs/exec-plans/active/p5-product-implementation-milestones.md`、P3 PC/TG 表
- 跨阶段 fixture：`tests/fixtures/acceptance-profile/`、`tests/fixtures/write-consistency/`、`tests/fixtures/architecture-risk/`
- 机械检查：`git diff --check HEAD^ HEAD` 通过；本轮按入口评审约束未重跑全量测试。
