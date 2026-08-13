# M1.1 Attempt 2 独立累积验收结论

## 结论

`PASS / 97`，I/X/P 全部通过，P0=0、P1=0、P2=3，`required_fixes=[]`。

本结论表示 M1.1 已具备提交用户会签的资格；当前会签前状态为“等待用户会签”，本结论本身不自行完成 M1.1。用户明确批准后，主控必须重新读取 formal/control，确认 formal=`84c051f7426ec5d2a9bed70aa02a1f321bd81e11`、control=`380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`、Result digest=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`、`plan_generation=4` 未变化，再以实时 expected-old control 执行 CAS 固化 user sign-off。CAS 成功后 M1.1 标记正式完成并关闭 CR-004/CR-005 的 M1.1 会签缺口；V1、P5 仍未完成。本次会签不授权启动 S1.4，固化后只允许单独评估 S1.4 入口，生成 packet、编码、派发仍需后续明确动作。

## 会签状态效果

- **批准前**：状态为“等待用户会签”，M1.1 尚未正式完成；V1、P5 尚未完成，S1.4 未启动。
- **批准后的固化动作**：主控重新读取 formal/control，确认 formal=`84c051f7426ec5d2a9bed70aa02a1f321bd81e11`、control=`380e4ba63ecbfa69e21bb12301f71d01e8f2d5ad`、Result digest=`sha256:341d36aae080320d546b10b939f0dfd23356f69fdfdce4e17a6570434e2466ea`、`plan_generation=4` 未变化，并以实时 expected-old control 执行 CAS 固化 user sign-off。
- **CAS 成功后**：M1.1 标记正式完成，CR-004/CR-005 的 M1.1 会签缺口关闭；V1、P5 仍未完成。
- **授权隔离**：本次会签不授权启动 S1.4。固化后只允许单独评估 S1.4 入口，生成 packet、编码、派发仍需后续明确动作；若读取值不一致或 CAS 失败，则不固化、不标记完成，继续保持“等待用户会签”。

## 为什么

- 三类目标项目真实回放 `S1.1 -> S1.2 -> JCS 恢复 -> S1.3 -> 签署 -> 签署恢复`，39/39 断言通过。
- Frozen Requirement 身份、完整 canonical 内容、digest、仓库身份、formal baseline 与产品语义连续率均为 `3/3`。
- attempt 1 的 `0/3` 跨阶段断链已经关闭，S1.3 消费的就是各自 S1.2 实际冻结的同一份需求。
- 20 项换料、篡改、非法状态、终态复活与 capability 复制负例全部 fail closed。
- formal `F0 -> F12 -> F13`、三份 promotion、Credential、Anchor、Proof 和 CAS 可追溯。
- formal F13 的唯一隔离副本 `pnpm check` 为 `148/148`，覆盖率三维均超过 80%。

## 必须修改

无阻塞修改项。

以下三个 P2 风险均不阻塞 M1.1 会签，后续由宿主相关里程碑承接：

1. 本验收只证明 manual-isolated/headless consumer contract，不证明 trusted-host、真实用户动作或 full 支持。
2. dispatch-ack 在验证窗口内发生，但 control Git 父链连续；因果顺序以 control Git 父链为准。
3. 长驻 trusted-host session registry 的容量与生命周期上界尚未证明。

## 证据

- Formal F13：`84c051f7426ec5d2a9bed70aa02a1f321bd81e11`。
- Packet：`sha256:97fec135aab2c1c2894f4af6edd1e3fa430238b092d6259cc3359e01f7032bde`。
- Dedup：`sha256:a8ccbc555cb37b95349bd3f6d15523546b4fee2819b32e6f60e61e2a8b6be3b9`。
- Claim/fence：`claim-m1.1-g4-a2-ixp-f72-20260813 / 72`。
- Qwen Agent：`019ffaa6-9af8-7ad1-8aa5-f3f9e9a2277d`。
- 当前 HEAD `9aef41a78842cfd045ed0a2e2dbb98844e021bf9` 独立复跑 `pnpm check`：`148/148`；Lines `90.90%`、Branches `82.94%`、Functions `98.40%`。
- 日期：`2026-08-13T10:43:44Z`。

验收只读，未修改项目或 refs，S1.4 未启动。
