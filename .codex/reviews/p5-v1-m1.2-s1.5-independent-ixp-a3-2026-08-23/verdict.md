# S1.5 attempt 3 独立 I/X/P + Acceptance Profile 裁决

## 结论

**`PASS / 100`**。精确 subject `f226e0fce689284b5f02747784d82c09c47b3ec5`（tree `c5d2e7c2a22023970d4a73feba856afdd44cd891`）通过固定 packet 的 6/6 hard gates；I/X/P/Profile=`25/25/25/25`，penalty=`0`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。本结论只允许进入后续独立 L3，不构成 L3、F15、S1.5 formal、M1.2、V1、P5 完成或 S1.6 启动。

## 为什么

- **I 通过**：专用隔离 Git worktree 使用 Node `v24.14.0`、pnpm `10.33.2` 执行 offline frozen install 与 `pnpm check`，结果 `353/353`、0 fail，覆盖率 Lines/Branches/Functions=`92.82/87.62/99.00`；定向 I/X/P/Profile 为 `166/166`。三类目标项目逐一跑通 `preview → independent confirmation → dry-run → commit → read-back → fixture Git commit`，stdout 始终为单一 RFC8785/JCS 回执。
- **X 通过**：challenge/view/display/独立用户动作/envelope/result 全链绑定；主对话没有项目读写能力，execution 只能 dry-run，commit 只接受持有可信同进程 project/candidate/baseline probes、绑定根 file-system port、clock 与 confirmation envelope 的 integration；职责伪造、跳过预览、篡改 plan/candidate 影响说明、过期或替换 view、formal/HEAD/dirty 漂移均在触盘前 fail closed。
- **P 通过**：write-consistency 为 **13/13**，其中三正例 `3/3`、六故障 `6/6`、四布局 `4/4`，index digest 与 `manual-isolated consumer contract` 均 `13/13`。PC-06 覆盖同名、嵌套、symlink、缺 route lock、越界和权限阻塞；PC-07 覆盖完整 candidate digest、plan、confirmation、atomic write、fsync、read-back、formal/HEAD/dirty/目标基线漂移、部分写入和归属回退，成功与失败均 promotion=`none`。
- **Profile 通过**：独立逐 fixture 调用裁决器，**17/17、Q6=100%**；5 accepted、6 rejected、6 contract/identity error。三类 headless、self-profile 与带证据 UI 路线按预期通过；冲突、缺 UI 证据、证据职责违规和 kernel UI 冒领全部阻塞，6/6 rejected 均不降级。
- **职责与范围通过**：13/13 write-consistency 与 17/17 Profile fixture 均只证明 `manual-isolated consumer contract`；没有冒领真实用户事件、真实宿主适配器、`full` 支持或 V3 PC-14/Q7。验证窗口前后 main=`f226e0fce689284b5f02747784d82c09c47b3ec5`、formal=`024c1db6d941b6f771746c8d6249fb8a09b816f3`、control=`0da2005200fb4f64795d584f2ff5fcf26d25d6b2` 不变。
- **attempt 3 纠偏成立**：固定 Execution Result 的 JCS 摘要独立复算匹配，并明确冻结 Node/pnpm、36 个源测试文件、36 个编译测试文件与 `353/353`。因此 attempt 2 的不可复现 `374/374` 不再是本轮证据债，也不产生扣分。

## 必须修改

无。P0/P1/P2=`0/0/0`，`required_fixes=[]`。

非阻塞边界：进入真实宿主或 `full` 支持时必须另建门禁，不得复用本次 `manual-isolated` 证据。

## 证据

- 固定输入：`git show c57c5b5d5536c28dac929e556d1d674ad7057989:gate-requests/gate-product-interaction-s1.5-g4-a3-20260823.json`；fence=`88`，ack-complete control=`0da2005200fb4f64795d584f2ff5fcf26d25d6b2`。
- 身份复算：subject=`sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30`；gate packet=`sha256:225a3462294e8bf2936179c8938b18f4fd6eb42c00ca7e9266820b96c4f0e8a0`；gate dedup=`sha256:86863712ff42fb287f2663e65be30d172b103f91f598cf06d888f6f4c4b808dc`；execution packet=`sha256:35f2a9595b108f2fe10aaaf02981c4c60d07e1080e24082128e418e6f2caa139`；execution dedup=`sha256:e5bf8635d654d7fc53c21a8c8cd699a8f1f0bccf2aad770812ed4b7d7cc388df`；execution Result=`sha256:1b17265a0917159aeb0808aa120a220984a436290cc6059124e52ab7c7a6155b`，全部 MATCH。
- 隔离门禁：`pnpm install --offline --frozen-lockfile`；`pnpm check` → `353/353`、0 fail、覆盖率 `92.82/87.62/99.00`。
- 定向门禁：write-consistency CLI、project-context、candidate-change、confirmation-node、write-transaction、Acceptance Profile 与 S1.5 Skill 共 `166/166`、0 fail。
- 独立矩阵：write-consistency=`13/13`（`3/3 + 6/6 + 4/4`，index/evidence_scope 均 `13/13`）；Acceptance Profile=`17/17`、Q6=`100%`、rejected 无降级=`6/6`、evidence_scope=`17/17`。
- 范围与不变量：`git diff --check a028bb7…f226e0f` 通过，候选相对 origin working parent 恰 38 个既定 S1.5 路径；review 分支相对 subject 只新增本目录 `scorecard.json` 与 `verdict.md`；main/formal/control 未移动，registry/snapshot/anchor/promotion 未写。
