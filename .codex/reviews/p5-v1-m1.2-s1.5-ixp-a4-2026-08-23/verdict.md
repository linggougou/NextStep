# S1.5 attempt12 独立 I/X/P + Acceptance Profile 裁决

## 结论

**`PASS / 100`**。精确 subject `128e86bc8ecc23dd3f0ce2150bc2744edb3751d9`（tree `814361368dde1233b788f30545f292a6a3ca0f2e`）通过固定 packet 的 6/6 hard gates；I/X/P/Profile=`25/25/25/25`，penalty=`0`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。本结论只允许进入后续独立 L3，不构成 L3、F15、S1.5 formal、M1.2、V1、P5 完成或 S1.6 启动。

## 为什么

- **I 通过**：专用隔离 Git worktree 使用 Node `v24.14.0`、pnpm `10.33.2` 执行 offline frozen install（downloaded=`0`）与 `pnpm check`，结果 `444/444`、0 fail，覆盖率 Lines/Branches/Functions=`93.07/88.62/99.09`；定向 I/X/P/Profile 与 fixture 故障/物化合计 `170/170`。三类目标项目逐一跑通 `preview → independent confirmation → dry-run → commit → read-back → fixture Git commit`，stdout 始终为单一 RFC8785/JCS 回执。
- **X 通过**：challenge/view/display/独立用户动作/envelope/result 全链绑定；主对话没有项目读写能力，execution 只能 dry-run，commit 只接受持有可信同进程 project/candidate/baseline probes、绑定根 file-system port、clock 与 confirmation envelope 的 integration；职责伪造、跳过预览、篡改 plan/candidate 影响说明、过期或替换 view、formal/HEAD/dirty 漂移均在触盘前 fail closed。
- **P 通过**：write-consistency 为 **13/13**，其中三正例 `3/3`、六故障 `6/6`、四布局 `4/4`，index digest 与 `manual-isolated consumer contract` 均 `13/13`。PC-06 覆盖同名、嵌套、symlink、缺 route lock、越界和权限阻塞；PC-07 覆盖完整 candidate digest、plan、confirmation、atomic no-replace write、fsync、read-back、formal/HEAD/dirty/目标基线漂移、部分写入、归属证明和安全回退，成功与失败均 promotion=`none`。
- **Profile 通过**：独立逐 fixture 调用裁决器，**17/17、Q6=100%**；5 accepted、6 rejected、6 contract/identity error。三类 headless、self-profile 与带证据 UI 路线按预期通过；冲突、缺 UI 证据、证据职责违规和 kernel UI 冒领全部阻塞，6/6 rejected 均不降级。
- **职责与范围通过**：13/13 write-consistency 与 17/17 Profile fixture 均只证明 `manual-isolated consumer contract`；没有冒领真实用户事件、真实宿主适配器、`full` 支持或 V3 PC-14/Q7。验证窗口前后 main=`8c5e5aefb7820854a28cbdba8cc7ceb7647c484f`、formal=`024c1db6d941b6f771746c8d6249fb8a09b816f3`、control=`e387bacaa4e97d2215233110ffd23fcc105efbd9` 不变。

## 必须修改

无。P0/P1/P2=`0/0/0`，`required_fixes=[]`。

非阻塞边界：进入真实宿主或 `full` 支持时必须另建门禁，不得复用本次 `manual-isolated` 证据。

## 证据

- 固定输入：`gate-product-interaction-s1.5-g4-a4-20260823.json`；fence=`100`，ACK CAS control=`e387bacaa4e97d2215233110ffd23fcc105efbd9`。
- 身份复算：subject=`sha256:95e670a8caf0f9c6f36bb1d60a5ad4530b0ea475e4ca204338549cb57c2c3447`；gate packet=`sha256:c47f944f4eb1791771ad6704279b7faf2bea18496aaef0a0bb3fcbb66933b12a`；gate dedup=`sha256:48b6867195a9d11721f1cf7c78c1651fd5c65455cf94460482f2ba9ab68186b0`；execution packet=`sha256:dff3b88d07914f922e6f81933d803b7808b62d0147a67c007f5a95a94db15894`；execution dedup=`sha256:c93001774b832d3535345a5292deae666a9034ddd3c44af41cb7bf1c6bccf02c`；execution Result=`sha256:b724253ef695ae9461f21d1f665a23358c84f4c52065087afaa5a118a5c327a9`，全部 MATCH。
- 隔离门禁：`pnpm install --offline --frozen-lockfile`；`pnpm check` → `444/444`、0 fail、覆盖率 `93.07/88.62/99.09`。
- 定向门禁：write-consistency CLI、project-context、candidate-change、confirmation-node、write-transaction、Acceptance Profile 与 S1.5 Skill=`144/144`；fixture 物化/故障/布局=`26/26`；合计 `170/170`。
- 独立矩阵：write-consistency=`13/13`（`3/3 + 6/6 + 4/4`，index/evidence_scope 均 `13/13`）；Acceptance Profile=`17/17`、Q6=`100%`、rejected 无降级=`6/6`、evidence_scope=`17/17`。
- 范围与不变量：候选相对 working parent `d9632c5…` 恰为 packet allowlist 的 4 个路径；attempt12 相对 repair parent `79be6a8…` 只改 W16 两路径；review 分支相对 subject 只新增本目录 `scorecard.json` 与 `verdict.md`；main/formal/control 未移动，registry/snapshot/anchor/promotion 未写。
