# S1.5 Candidate Verification attempt 3 裁决（L2）

评审对象：`git:f226e0fce689284b5f02747784d82c09c47b3ec5`（tree `c5d2e7c2a22023970d4a73feba856afdd44cd891`）

固定 packet：`git:c57c5b5d5536c28dac929e556d1d674ad7057989:gate-requests/gate-candidate-verification-s1.5-g4-a3-20260823.json`

claim / fence：`claim-s1.5-cv-g4-a3-f87-20260823` / `87`

权威验证窗口 control 起点：`0da2005200fb4f64795d584f2ff5fcf26d25d6b2`

## 结论

**PASS / 100**，P0/P1/P2 = **0/0/0**。8 项 hard gates 全部通过，`required_fixes=[]`。

该结论只覆盖 S1.5 attempt 3 Candidate Verification。它不批准或冒领 attempt 3 I/X/P、L3、Final Verification、F15、S1.5/M1.2/V1/P5 完成、S1.6 启动或 `full` host support。

## 为什么

固定 subject 的 commit/parent/tree/JCS 摘要、attempt 3 gate packet、Execution Packet、Execution Result、两份七字段 dedup、execution fence 86 与 CV fence 87 均独立复算匹配。`a028bb7..subject` 恰为 38 路径，与 attempt 2 Result 的原始候选集合恒等；38/38 命中原 allowlist、forbidden 命中 0，`git diff --check` 通过。

全新 `git clone --no-local` 的 detached subject 在 Node `v24.14.0`、pnpm `10.33.2` 下完成 `pnpm install --offline --frozen-lockfile`（downloaded 0）与 `pnpm check`：36 个 source/compiled 测试文件，TAP `337 top-level + 16 nested = 353`，最终 `353/353`、0 fail；覆盖率 Lines `92.82%`、Branches `87.62%`、Functions `99.00%`，精确复现 attempt 3 Result 并高于 F14 `91.07/83.80/98.36`。

S1.5 专项 5 文件 `86/86` 通过：三类 PC-06/PC-07 fixture 均完成项目/阶段解析→preview→独立显式确认→dry-run 零写→commit→read-back→fixture Git commit，并绑定 candidate/project/formal/HEAD/dirty/targets/digests/plan/envelope。3 正例、6 故障、4 布局的 13 份记录全部通过 RFC8785 摘要重算；Git 保护路径、各类漂移、确认伪造/过期、部分写入和不安全归属回退均 fail closed。独立敏感标记探针为 exit 1、stdout 单 JCS、stderr 仅 diagnostics 且零泄漏；`WRITE_*` 与 `PROFILE_CONFLICT_REJECTED` 不降级；S1.2 freeze digest 恒定为 `sha256:21a0f7ce08ed8cbd5a4d7a8dbc1d21629c6c77b6927e66bd27c128d22532f58a`。

依赖方向专项测试通过。验证窗口内 main/subject/tree/formal/control 与源工作区五条 dirty 指纹不变；本 review 分支只新增本目录两文件。attempt 2 的 `REJECT / 78`、P0、gate/result blob、Result digest `sha256:3e2d5377dc1d9d362a7f103fb88d6402b576582c0b4136b46a8c0c1c2f6b0323` 与 scorecard digest `sha256:6d0add4e5da7abaaf51b1b846f9acc51c7afaa30f1834f6c983ab5deee42a400` 原样保留；attempt 3 使用独立 registry 条目，没有覆盖历史裁决。

## 必须修改

无。

## 证据

- 身份摘要：subject `sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30`；gate packet `sha256:908a560202dec634421954f215b1258e45aebd905befd1d91013d84fbf5f5b5c`；Execution Packet `sha256:35f2a9595b108f2fe10aaaf02981c4c60d07e1080e24082128e418e6f2caa139`；Execution Result `sha256:1b17265a0917159aeb0808aa120a220984a436290cc6059124e52ab7c7a6155b`。
- 测试证据：offline frozen install exit 0；`pnpm check` exit 0；36/36 测试文件；`337 + 16 = 353/353`；0 fail；覆盖率 `92.82 / 87.62 / 99.00`；S1.5 专项 `86/86`。
- fixture 与安全证据：3 positive + 6 fault + 4 layout，13/13 JCS digest；敏感探针 exit 1、stdout 一行 JCS、stdout/stderr 零泄漏；失败不提升。
- 不变性证据：main/subject=`f226e0f…`、tree=`c5d2e7…`、formal=`024c1db…`、control=`0da2005…`；源工作区指纹不变；attempt 2 REJECT blob OID 保持 `cb836136…` / `d7e9c808…`。
