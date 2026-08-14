# S1.4 候选验证结论（Candidate Verification，attempt 1）

## 结论

`PASS / 100`。S1.4 实施候选 `d60e625c2ce490388d7c7bc8f4beb3d23d501fea`（tree `b40546c49296e34719c5d9b0ee189d00a5a30e7e`，subject digest `sha256:fc86923851afa390b29b19c26a911c8c43eb5098f9ab80486abe9a6bb175e2d4`）通过全部九项硬门禁，可离开候选验证门禁，进入独立 I/X/P 验收。本裁决仅为 S1.4-CV 结论，不批准 I/X/P、L3、Final Verification、Anchor Verification 或 formal promotion，也不构成 M1.2/V1/P5 完成。

## 为什么

1. **身份精确一致**：commit/tree/parent 与 gate packet、Execution Result 完全匹配；按 `sha256(JCS({commit_oid,parent_oid,tree_oid}))` 契约独立重算 subject digest、gate packet digest（排除 packet_digest/dedup_key）、Execution Result digest（排除 result_digest），三者全部精确相等（fc869238 / 43d23b00 / 68c3003f）。候选是实施区间起点 `7020b19` 的可达后代，区间恰为 W2→W3→W1→W4→集成修复 5 个提交，worker 原始提交全部可达。
2. **范围纪律零偏差**：实施区间 72 条变更路径与 Result 声称集合恒等，全部落在 packet allowlist 内，禁止路径命中 0；F13 至 subject 全树差异中非治理文档类变更恰为这 72 条，S1.1–S1.3 的 schema/domain/fixture/cli/skill 真源 blob 级未改写（schemas/v1 仅 allowlist 内 machine-receipt.schema.json 变化）。
3. **隔离构建一次通过**：全新 `--no-hardlinks` clone detached 至 subject，clone 内复验 tree 一致；`corepack pnpm install --frozen-lockfile && corepack pnpm check` exit 0，typecheck 干净，206/206 测试通过、0 失败，覆盖率 Lines 91.07% / Branches 83.80% / Functions 98.36% 均 ≥80%，`git diff --check` CLEAN。
4. **三类 Profile fixture 与身份连续性独立复核**：三个目标项目（community-workshop / expense-reminder / project-delivery-tool）24/24 独立重算通过——product_definition_id/digest 与 S1.3 fixture 解析身份一致、project 逐字节一致、carrier_decision_digest 与 W2 真实裁决记录一致（无占位残留）、profile_id 派生自洽；headless 启用三类核心验收且 UI 禁用，含 UI 正例追加 ui_restoration=required，含 UI 缺证据阻塞（UI_EVIDENCE_MISSING），三个冲突 fixture 一律 PROFILE_CONFLICT 拒绝且绝不降级；kernel 自身误启 UI（KERNEL_ROUTE_UI_FORBIDDEN）与证据职责违反（EVIDENCE_DUTY_VIOLATION）同样拒绝。
5. **fail closed 活体证据**：14 条 CLI 探针全部符合语义——正例 exit 0 单条 JCS 回执；未知字段、非 JCS 字节、`--signed` 参数注入、敏感字段（SENSITIVE_FIELD_DETECTED 且敏感原值零泄漏）、Web/UI 主线夹带、Codex 对话脚本窄化、Web 驾驶舱冒充主线、无 CR 覆盖已会签裁决全部 exit 1 拒绝；冲突回执 data 不携带任何降级 Profile 输出；机器信封 TS 联合与 JSON Schema 双真源 21 码精确同步（then 7 成功码均带 additionalProperties=false 严格契约，else 14 失败码含 PROFILE_CONFLICT_REJECTED），`parseMachineReceipt` 对三个 ACCEPTED 回执独立重验全部通过。
6. **不变性与验证者纪律**：验证前后 formal=84c051f7...（F13）、control=20e774c...、main=482e95b... 均不变，验证期间 control 零新增提交，subject tree 不变；验证者只写入 /tmp 隔离 clone 与本评审包，未修改候选、测试、文档或 control/formal refs，未自批任何后续门禁。

## 必须修改

无。所有硬门禁通过，无 P0/P1/P2 缺陷，无阻塞项。以下仅为非阻塞观察，不构成返工条件：

1. 分支 ref `codex/s1.4-g1-w2-carrier-decision` 因共享 worktree 叠加现指向 W1 提交 c23bcfa（W2 原始提交 daae08e 仍可达），属外观问题，可在后续治理中清理 worker 分支。
2. `acceptance-profile.ts` 中 NextStep 仓库身份常量 sha256:d11253... 为硬编码，与当前 checkpoint/dispatch repository_id 一致；未来仓库身份治理变更时需同步。
3. 三个新 CLI 少量诊断分支未覆盖（覆盖率仍充分高于门禁），可在后续切片顺手补齐。

## 证据

- 评审包：`.codex/reviews/p5-v1-m1.2-s1.4-candidate-verification-2026-08-14/scorecard.json`（九项硬门禁、五维打分、评审角色记录）。
- 身份与摘要：subject/gate/Result 三份 digest 独立重算精确匹配；`git merge-base --is-ancestor` 祖先链验证；实施区间 5 提交清单。
- 范围：`git diff --name-only 7020b19..d60e625` 72 路径 == Result 声称集合；allowlist 比对界外 0 / 禁止 0；F13..subject 全树差异复核；8 项历史真源 blob 抽样 IDENTICAL，schemas/v1 全量 blob 对比仅 allowlist 内 machine-receipt 变化。
- 构建：`/tmp/nextstep-s14-cv-a1-20260814` 隔离 clone 的 frozen install + `pnpm check`（206/206，覆盖率 91.07/83.80/98.36）+ `git diff --check` CLEAN。
- 连续性：独立脚本复算 24/24 通过（S1.3↔W3、W2↔W3 绑定、profile_id 自洽、headless/UI/冲突三类语义）。
- fail closed：14 条活体 CLI 探针记录（exit code、回执 code、敏感零泄漏、冲突无降级）。
- 双真源与重验：TS 联合 vs schema 枚举 21 码恒等；then/else 分支结构核验；三个 ACCEPTED 回执 parseMachineReceipt 独立重验通过。
- 不变性：验证前（07:39:17Z）与验证后（07:54:12Z）formal/control/main/subject tree 状态记录；验证期间 control 零提交。
- 边界声明：本验证仅证明 manual-isolated / headless consumer contract；不证明 trusted-host、真实用户动作或 full 宿主支持。
