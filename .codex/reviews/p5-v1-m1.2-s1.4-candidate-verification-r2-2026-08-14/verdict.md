# S1.4 Candidate Verification attempt 2 裁决（L2）

评审对象：`git:c2894cd25cf8b466d41df68ff99cdbf4193ba0d3`（tree `e9c22fb61e80c877cbda9b284317a740bd56537a`）
subject digest（独立复算一致）：`sha256:3e93a4ad0cbc796bcc92b6a427a20e24ca21a9d8daf2c3252179807b9818d5aa`
gate packet：`refs/nextstep/control:gate-requests/gate-candidate-verification-s1.4-g4-a2-20260814.json`（packet digest 复算 `37e24c60…` 一致，未过期）
评审时间：2026-08-14T09:26Z，隔离 clone：`/tmp/ns-cv-r2-a2-20260814`（`--no-hardlinks`，detached 于 subject）。

## 结论

**PASS**。attempt 2 候选通过全部六条硬门禁。attempt 1 独立 I/X/P 指出的唯一必修项（`self-profile-headless.json` 占位绑定）已以回放派生的真实身份闭环，端到端输出 `ACCEPTANCE_PROFILE_ACCEPTED`；修复区间仅含评审证据与单 fixture，零业务代码漂移；全量回归与三类 Profile / fail-closed 行为不回归；formal 与 subject tree 验证前后不变。

## 为什么

1. **身份链精确匹配**：commit/tree/parent 与 attempt 2 execution Result 一致；subject digest、gate packet digest（排除 packet_digest/dedup_key）、Result digest（排除 result_digest）、execution packet digest（`75edb261…`）四份摘要全部独立重算相等；d60e625 为 subject 祖先，修复区间恰 4 提交。
2. **范围零漂移**：`d60e625..c2894cd` 恰 13 条路径 = 12 条治理/评审 + 1 条 fixture；`src/**`、`schemas/**` 命中 0；治理文档逐行核查仅状态行更新（无规则/门禁/路线变更）；与 Result `changed_paths` 集合恒等。
3. **self-profile 三重身份闭环（核心修复项）**：
   - `product_definition_id=pd-7913f81f…` 与 `tests/fixtures/product-definition/project-delivery-tool.json` 已签 PD 2.0 记录一致，记录 RFC8785 摘要复算 `sha256:096428a4…` 与绑定相等；
   - `carrier_decision_digest` 复算真实 W2 fixture `tests/fixtures/carrier-decision/project-delivery-tool.json` 候选 = `sha256:2a582889…` 与绑定相等，fixture 内嵌副本与真实记录规范化字节恒等；
   - `profile_id` 以域层 `deriveAcceptanceProfileId` 对修复后候选重派 = `ap-66c5db77…` 与声明相等。
   占位 `pd-nextstep-self` / `sha256:5e5e…` / `sha256:57b5e8b5…` 全部移除。
4. **全量门禁复算**：frozen install + `pnpm check` exit 0；206/206 测试；覆盖率 91.07 / 83.80 / 98.36（≥80% 且不低于基线）；`tsc --noEmit` 干净。
5. **三类 Profile 与 fail-closed 不回归（独立回放 253/253）**：headless 三类目标项目 I/X/P 启用、UI 还原禁用；`ui-with-evidence` 追加 `ui_restoration`；`ui-missing-evidence` 阻塞；三份冲突 fixture 全部 `PROFILE_CONFLICT_REJECTED` 且 data 键恰为 `{dry_run:false}`（零降级输出）；`self-profile-headless` 端到端 ACCEPTED 且二次回放 decision digest 恒定；敏感探针 stdout/stderr 零泄漏；ACCEPTED 回执 `data.digest` 独立复算一致、canonical_json 往返恒等。
6. **不变性与纪律**：验证前后 formal=F13、subject tree、main 顶点均不变，工作区 0 脏文件；窗口内 control 唯一迁移 `f032f98→331662b` 为控制面对本 CV 与并行 I/X-P 的 dispatch-ack CAS（单父、仅认领消息），非验证者写入；F13..subject 全树审计确认 S1.1–S1.3 真源 blob 级未改写；CLI 空目录运行零落盘；本评审仅写入本目录两个文件。

## 非阻塞观察

1. `IDENTITY_CONFLICT` 与路线冲突共用 `PROFILE_CONFLICT_REJECTED` 回执码（fail-closed 方向正确）。
2. 评估层与信封重验层对 `bindings.product_definition_id` 的格式校验时机不对称（方向安全）。
3. self-profile 绑定 fixture 链内已签 project-delivery-tool PD 2.0（NextStep 自身已签 PD 摘要不在 fixture 链内）；fixture note 已声明证据范围。M1.2 集成验收如需 kernel 自身 PD 链，应按 S1.3 回放模式另行派生。
4. `acceptance-profile.ts` 中 kernel 仓库身份常量硬编码，仓库身份治理变更时需同步。

## 边界声明

本裁决仅证明 manual-isolated / headless consumer contract 下的候选正确性；不批准 I/X/P、L3、Final Verification 或 formal promotion；不构成 S1.4/M1.2/V1/P5 完成。后续门禁须各自独立执行，Result 信封由控制面按 fence 固化。
