# M2.1 里程碑验收入口独立评审

## 结论

`REVISE / 70`。P0/P1/P2=`0/2/0`，`required_fixes` 非空，因此不得 `PASS`。

当前计划已经把 subject、authority、coverage floor、I/X/P/Profile 边界和非目标写得很清楚，但控制链存在不可执行的硬冲突：隔离 clone 在移除 origin 且只允许 ACK 前注入 formal/control refs 的前提下，无法在 ACK 后由独立 reviewer 继续验证 ACK/control 单父链。修复前不得放行后续 packet。

## 发现

1. P1: ACK/control 证据无法在现有规则下进入隔离 clone，导致 HG2/HG5/HG6 无法同时成立。
   证据：
   - `.codex/exec-plan-m2.1-acceptance-generation-1.md:33` 要求 reviewer 在验收时核对 packet/dedup/claim/fence/ready/outbox/ACK/registry 和 expected-old 单父 CAS。
   - `.codex/exec-plan-m2.1-acceptance-generation-1.md:36` 同时规定 `git clone --no-local`、移除 origin、detached checkout historical subject，且 formal/control “只允许在 ACK 前由主控按冻结值注入 clone 内只读 ref”。
   - `.codex/exec-plan-m2.1-acceptance-generation-1.md:37` 和 `:57` 又要求 dispatch ACK CAS 完成后才允许开始正式评审。
   影响：
   - ACK 发生在唯一允许注入 refs 的时间窗之后，而 clone 已移除 origin，没有留下任何只读、隔离、可复验的 ACK/control 取证路径。
   - 这会直接破坏“reviewer 在 ACK 后独立获得并验证 ACK/control 单父链、但不获得原仓库写权限”的核心门禁。

2. P1: readiness 的执行者和时序定义前后冲突，导致步骤 5.4 没有唯一可执行解释。
   证据：
   - `.codex/exec-plan-m2.1-acceptance-generation-1.md:37` 写的是“独立 reviewer 先只做 readiness”，说明 readiness 属于 reviewer 的 ACK 前动作。
   - `.codex/exec-plan-m2.1-acceptance-generation-1.md:57` 写的是“在一次性隔离 clone readiness 通过后派发唯一 reviewer”，则 readiness 又发生在派发 reviewer 之前。
   影响：
   - 计划没有定义到底是谁完成 readiness、谁持有 readiness 结果、ACK 前后由谁接续同一个隔离副本。
   - 这会让 packet/claim/ready/outbox/ACK/review 的控制面顺序失去唯一解释，后续很难机械复核。

## 通过项

- 送审提交身份正确：`8e2dce7ecdc8cba9c85564cffa408fd0f6f3f3e5`，唯一父 `b68dd8974482517089ab558eb347856f4af6bde9`，tree `ef958c0940863709f10a6a609b7119105b72bd3c`；相对父提交 exact-three，仅新增计划与两份 `.codex` 留痕。
- historical subject 冻结正确：`6ec262fbac45de3d0f84c05a4a5582049139f219` / `596a2948196f01454192ebe3e2090b8280b4a897` / `960d16ded99104ee7409ec6938e501db204ea8fa` 的 JCS 摘要独立复算为 `sha256:8ca135a89e6b586e810b04f83d62bde9da02b6ca7852c8786a3de13301534c61`，与计划一致。
- live formal/control 与入口状态一致：formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`，control=`100bc6ae2937caf14e6f1e5abc4a88d143583640`；`plan_generation=5`，`pending_dispatch_messages=[]`，下一唯一入口仍是 M2.1 acceptance plan + 独立 entry assessment。
- S2.1/S2.2 authority 边界写对了：有效 candidate/review/integration/Result 可寻址，`88eaa581...` / `91ed44a1...` 与两份 invalid audit 都被正确限制为非 authority。
- 测试和产品边界写得足够严：targeted `23/23`、full `>=526/526`、coverage floor `93.99/89.20/99.49`、I/X/P/Profile、零副作用，以及不得宣称 PC-11..13、M2.2、V2、alpha、formal、CR-006、P5 或真实项目 `qualified runs` 已完成。

## 必须修改

- 定义一个真正可执行的 ACK/control 证据交付路径。修订后必须能同时满足：
  - reviewer 在 ACK 后独立读取并验证 dispatch ACK control 提交与完整单父链；
  - reviewer 不获得原仓库写权限；
  - 隔离 clone 仍保持 `no-local`、origin removed、historical subject detached 的隔离要求。
- 统一 readiness 的执行者与时序，只保留一条单义流程，并在文本中明确 readiness 结果如何与后续 ACK/review 绑定。

## 机械证据

- review subject：`8e2dce7ecdc8cba9c85564cffa408fd0f6f3f3e5`
- review parent：`b68dd8974482517089ab558eb347856f4af6bde9`
- review tree：`ef958c0940863709f10a6a609b7119105b72bd3c`
- live formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`
- entry control：`100bc6ae2937caf14e6f1e5abc4a88d143583640`
- historical subject：`6ec262fbac45de3d0f84c05a4a5582049139f219`
- historical parent：`960d16ded99104ee7409ec6938e501db204ea8fa`
- historical tree：`596a2948196f01454192ebe3e2090b8280b4a897`
- historical subject digest：`sha256:8ca135a89e6b586e810b04f83d62bde9da02b6ca7852c8786a3de13301534c61`
- `git diff --name-only HEAD^ HEAD`：exact-three，通过
- `git diff --check`：通过

## 放行边界

本次 `REVISE` 只允许修订 `.codex/exec-plan-m2.1-acceptance-generation-1.md` 并重新做独立入口评审。

不得创建或放行：

- M2.1 acceptance packet
- claim/fence
- dispatch-ready/outbox
- dispatch ACK
- 独立验收派发
- M2.1 Result
- user-signoff request / ACK
- completion CAS
