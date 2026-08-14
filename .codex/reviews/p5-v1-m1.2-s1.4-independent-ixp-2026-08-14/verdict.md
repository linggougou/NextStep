# S1.4 独立 I/X/P 验收裁决（L3）

评审对象：`git:d60e625c2ce490388d7c7bc8f4beb3d23d501fea`（tree `b40546c49296e34719c5d9b0ee189d00a5a30e7e`）
subject digest（独立复算一致）：`sha256:fc86923851afa390b29b19c26a911c8c43eb5098f9ab80486abe9a6bb175e2d4`
gate packet：`refs/nextstep/control:gate-requests/gate-product-interaction-s1.4-g4-a1-20260814.json`
评审时间：2026-08-14（UTC+8 下午），隔离回放 worktree：`/tmp/ixp-s14-wt/repo`（detached 于 subject）。

## 结论

**REVISE**（91/100）。S1.4 候选在集成、交互、产品三个维度整体达到门禁：构建测试全绿、三类目标项目 fixture 端到端闭环、冲突全部 fail closed 且零降级、主对话零读写、证据职责边界清晰。唯一硬门禁失败项为 Profile 门禁（HG4）：kernel 自身 headless 正例 `self-profile-headless.json` 声明 `expected=accepted`，独立 CLI 回放实际输出 `ACCEPTANCE_PROFILE_REJECTED`，fixture 矩阵端到端 16/17，Q6=100% 暂未在整个矩阵上成立。缺陷小、定位精确、可恢复，故裁决 REVISE 而非 REJECT。本结论只覆盖 S1.4，不构成 PC-04..08、M1.2、V1 或 P5 完成。

## 为什么

1. **身份链完整可信**：subject commit/tree/parent 与 execution Result 一致；subject digest 按 `sha256(JCS({commit_oid,parent_oid,tree_oid}))` 独立复算相等；F13→subject、实现范围起点→subject、subject→main HEAD 祖先链成立；Execution Packet digest 独立复算 `sha256:5c41dd07…` 与 dispatch 声明一致；实现范围 101 文件 +19955/−39，零禁入路径改动。
2. **I 通过（24/25）**：隔离环境 `corepack pnpm install --frozen-lockfile && pnpm check` 通过，206/206 测试、覆盖率 91.07/83.80/98.36；独立 spawn 回放 52 份 fixture + 9 项探针共 61 项检查，60 项通过；ACCEPTED 回执的 `data.digest`/`canonical_json` 独立复算相等、主题级跨次回放确定；回执码双真源（TS 联合与 JSON Schema 枚举）各 21 码完全一致；`src/cli`、`src/domain`、`src/adapters` 零文件写入调用。扣 1 分：`evaluateAcceptanceProfile` 与 `parseAcceptanceProfileDecision` 对 `bindings.product_definition_id` 格式校验宽严不一致（方向安全，属契约不对称）。
3. **X 通过（25/25）**：SKILL.md S1.4 节具备完整阶段守卫（`V1 / M1.2 / S1.4` + S1.3 已提升 + PD 2.0 可回放）、kernel 只校验/不回写/不签认/不声明 full、原型会签/载体裁决/Profile 配置三类显式确认节点、通过/退回/需讨论/阻塞四态记录、冲突阻塞与 stderr 诊断、失败恢复入口；回放全程 `refs/nextstep/formal`=F13、`refs/nextstep/control`=20e774c 未移动。
4. **P 通过（25/25）**：载体无关原型覆盖输入/回应/确认节点/阶段转换/异常/恢复/不可偏离项并绑定上游摘要；载体裁决正式值唯一（`skill-chat` + `project-documents-git`），Web/UI 只能作为候选分支且恢复条件强制 CR + 重新裁决；`web-cockpit-as-mainline`、`web-ui-policy-claims-mainline`、`candidate-branch-claims-mainline`、`web-mainline-claim` 等负例全部拒绝，候选材料无一进入主线。
5. **Profile 未通过（21/25，HG4 fail）**：冲突子集 100% 正确且零降级——三份冲突 fixture 均 `PROFILE_CONFLICT_REJECTED`，拒绝回执 `data` 仅 `{dry_run:false}`，无任何降级 Profile 输出；headless 三类目标项目启用 I/X/P 且 UI 还原禁用；`ui-with-evidence` 追加 `ui_restoration`、`ui-missing-evidence` 阻塞。但 `self-profile-headless.json` 的 `candidate.bindings` 仍是占位（`product_definition_id="pd-nextstep-self"` 不符合 `pd-<64hex>` 模式、`product_definition_digest=sha256:5e5e…`、`carrier_decision_digest=sha256:57b5e8b5…` 占位记录摘要），域层评估放行而机器回执信封重验拒绝，端到端输出拒绝回执，与 fixture 声明的 `accepted` 矛盾。W3 交付报告已预告该占位须由集成期替换，集成未闭环。
6. **证据职责通过**：52 份 fixture 全部声明 `manual-isolated consumer contract`，无 `full` 声明；独立任务只产证据、不改变适用性；无越权声明。

## 必须修改

1. 替换 `tests/fixtures/acceptance-profile/self-profile-headless.json` 的占位绑定为真实已签身份：`product_definition_id` 用 kernel 自身已签 Product Definition 2.0 的派生 ID（`pd-<64hex>`），`product_definition_digest` 用该记录 RFC8785 回放摘要，`carrier_decision_digest` 用真实 W2 载体裁决记录摘要（与三份 headless 目标项目 fixture 同一回放派生方式，禁止手抄）；重新派生 `profile_id` 后复跑 domain 与 CLI 回放，使该 fixture 端到端 `ACCEPTANCE_PROFILE_ACCEPTED`。
2. 若 kernel 自身已签 PD 2.0 身份尚不在 fixture 链内，先按 S1.3 回放模式从已会签记录派生，再替换占位；不得以新占位顶替。
3. 修复完成前，Q6 证据口径记为 fixture 矩阵 16/17 + 1 项阻塞待修复，不得按 17/17 申报；复验仅需针对该 fixture 与累计回归。

建议（不阻塞）：统一评估层与信封重验层对绑定格式的校验时机；为 `IDENTITY_CONFLICT` 设独立回执码或显式映射表（当前与路线冲突共用 `PROFILE_CONFLICT_REJECTED`，fail-closed 方向正确）。

## 证据

- 独立回放 harness：`/tmp/ixp-s14-wt/harness/replay.mjs`（spawn 真实 dist CLI，不复用仓库测试代码）；结果 60/61，唯一失败项 `acceptance-profile/self-profile-headless.json`。
- 复现命令（隔离 worktree，detached 于 subject）：
  - `corepack pnpm install --frozen-lockfile && pnpm check` → 206/206，覆盖率 91.07/83.80/98.36
  - `node --test 'dist/tests/**/*.test.js'` → tests 206 / pass 206 / fail 0
  - `node /tmp/ixp-s14-wt/harness/replay.mjs` → failures=1（self-profile-headless）
  - 域层/信封对照：`evaluateAcceptanceProfile(fixture.candidate)` 返回 `accepted`；`parseAcceptanceProfileDecision(decision)` 抛 `INVALID_ACCEPTANCE_PROFILE: bindings.product_definition_id is invalid`。
- 身份与摘要复算：subject digest `fc869238…`、packet digest `5c41dd07…` 均由本评审独立重算一致；祖先链与实现范围禁入路径核查通过（`git merge-base --is-ancestor` 与 `git diff --name-only 7020b19..d60e625`）。
- 双真源核对：machine-receipt TS 联合 21 码 == `schemas/v1/machine-receipt.schema.json` 枚举 21 码。
- 不变量：验证前后 `refs/nextstep/formal`=F13 `84c051f7…`、`refs/nextstep/control`=`20e774c0…` 未变；本评审仅写入本目录 scorecard.json 与 verdict.md。
- 范围外观察（不影响本裁决，移交 CV/FV）：execution Result 记录朴素 JCS 全字段摘要复算（`sha256:76364d18…`）与 gate packet 声明（`sha256:68c3003f…`）不一致，result 信封摘要契约的字段排除规则不在本评审可见范围；S1.4-CV 结果信封在本评审读取时尚未固化至 control checkpoint。
