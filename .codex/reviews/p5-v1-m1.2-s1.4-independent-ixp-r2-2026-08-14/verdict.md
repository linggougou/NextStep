# S1.4 独立 I/X/P（attempt 2）裁决

## 结论

**`PASS / 99`**。subject `c2894cd25cf8b466d41df68ff99cdbf4193ba0d3`（tree `e9c22fb61e80c877cbda9b284317a740bd56537a`）通过全部六项硬门禁，attempt 1 唯一必修项（self-profile 占位绑定）已闭环，可进入独立 L3。本裁决不构成 L3 批准、formal promotion，也不宣称 M1.2/V1/P5 完成。

## 为什么

- **身份链独立复算一致**：gate packet digest（fc29b1b2…）、subject digest=sha256(JCS({commit_oid,parent_oid,tree_oid}))（3e93a4ad…）、execution Result digest（c10272b0…，排除 result_digest）、execution packet digest（75edb261…）四项全部以自有 RFC8785 实现重算并精确匹配。
- **I**：隔离 clone（--no-hardlinks）`pnpm check` exit 0，206/206 测试，覆盖率 91.07/83.80/98.36；自有 JCS spawn 级回放 52/52 fixture，正例 canonical_json/digest 独立复算相等；信封双真源 21/21 恒等，三个 ACCEPTED 主题经独立进程 parseMachineReceipt 重验；CLI/domain/adapters 零写入调用。
- **X**：阶段守卫、原型会签/载体裁决/Profile 配置三类显式确认、四态门禁记录（通过/退回/需讨论/阻塞）、阻塞与恢复入口全部在 SKILL.md 与 skill 回放（15/15）中可验证；评审全程主对话零读写，formal=F13、control=331662b1 前后不变。
- **P**：interaction-prototype 16/16、carrier-decision 19/19；Web/UI 主线夹带、Codex 对话脚本窄化、候选分支冒充主线、无 CR 覆盖等负例全部 fail closed；r1→subject 代码零改动，产品语义无回归。
- **Profile（本轮焦点）**：完整矩阵 **17/17**，Q6=100%。`self-profile-headless` 端到端输出 **ACCEPTANCE_PROFILE_ACCEPTED**（绑定真实 pd-01e7fcb1… 与 W2 载体裁决摘要 cd10e72a…，enabled_acceptances=[integration,interaction,product]、ui_requirements=disabled、conclusion=通过）；三个冲突 fixture 均 **PROFILE_CONFLICT_REJECTED** 且失败 data 恰为 `{dry_run:false}`，stdout/stderr 零 profile 输出、零降级暗示。
- **证据职责与范围**：52 份 fixture 全部 manual-isolated consumer contract；fail-closed 活体探针 13/13（非 JCS、参数注入、stdin 会签注入、敏感字段零回显、空输入、尾随垃圾）；S1.1–S1.3 源码/schema/fixture 相对 F13 blob 级未改写；全部 M1.2/V1/P5 表述均为否定式。

## 必须修改

无。attempt 1 的必修项（self-profile 占位绑定替换为真实身份并重派 profile_id）已在本 subject 中闭环并通过端到端回放验证。

非阻塞改进项（不影响本裁决）：
1. 身份冲突与路线冲突共用 `PROFILE_CONFLICT_REJECTED` 回执码，建议后续增设独立身份冲突码（同步双真源）。
2. CLI 主入口守卫在符号链接路径且 cwd 不一致时静默 no-op exit 0（继承自 S1.1–S1.3 全部既有 CLI，非 S1.4 回归；SKILL 规定自仓库根调用时不触发）。

## 证据

- 隔离环境：`git clone --no-hardlinks file:///Volumes/2T/CODE/A_Mine/NextStep /tmp/ixp-s14-r2-a/repo`，detached `c2894cd`，工作区干净。
- 构建/测试：`corepack pnpm install --frozen-lockfile`、`pnpm check`（typecheck + 206/206 + 覆盖率 ≥80%）、`pnpm build`。
- 独立 harness（自有 JCS，未复用既有脚本）：`/tmp/ixp-s14-r2-a/verify-digests.mjs`（四摘要 MATCH）、`/tmp/ixp-s14-r2-a/replay.mjs`（PROFILE_MATRIX 17/17、TOTAL 52 FAILS 0、CONFLICT 三例 zero-downgrade-ok、SELF_PROFILE pass）、`/tmp/ixp-s14-r2-a/probes.mjs`（PROBES 13/13）、`/tmp/ixp-s14-r2-a/envelope.mjs`（dual-source YES、三份 REVALIDATED）。
- Skill 回放：`node --test dist/tests/skill/{s1.4-skill,requirement-freeze-skill,product-definition-skill}.test.js` → 15/15。
- 静态核验：`grep -rnE 'writeFile|createWriteStream|mkdir|…' src/cli src/domain src/adapters` → NO WRITE CALLS；52 份 fixture evidence_scope 扫描 → 0 例外；`git diff F13..c2894cd` S1.1–S1.3 域为空。
- 不变量：评审前后 `refs/nextstep/formal=84c051f7…`（F13）、`refs/nextstep/control=331662b1…`、main 工作区干净；本评审仅写入本目录两个文件。
