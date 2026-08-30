# CR-008：生产级可信宿主（Production Trusted Host）

- 状态：独立 Change Intake/架构/安全评审已通过，等待用户最终批准；尚未进入计划、尚未实施
- 记录日期：2026-08-30
- 来源：A3.0 cumulative acceptance attempt 2 的 live blocker
- 所属阶段：P5 / V3
- 影响级别：高风险基础变更
- 建议首个目标：macOS 用户会话内的可选 `full` host adapter
- 计划影响：仅当本 CR 通过独立评审并获用户最终批准后，才可另行形成并评审 V3 generation 3 plan；plan entry PASS 后仍需分离执行 generation-advance/ack CAS

## 1. Live blocker 与问题定义

A3.0 cumulative acceptance attempt 2 已固化 blocker Result：

- Result digest：`sha256:49eef940a268e6b791a349ac053aa8d1d51340a434f4de8060dd57fd85c0f0bf`
- Result control：`1b244c822ee5aa2a246fce0341a788f2c90f1897`
- 已通过：源码、dispatch ACK 与 donor preflight
- 未通过：生产级 trusted host 不存在，无法取得可机械验证的 fresh user action

当前 TypeScript kernel 已能表达 challenge、confirmation、activation、rollback 与 fail-closed 规则，但它只有受信端口，没有能够证明“特定用户在看过 exact view 后于本次用户会话中执行了 exact action”的生产 adapter。当前 Codex 会话、CLI、stdin、argv、env、项目文件、JSON、聊天文本或模型自述都不能机械提供该 trusted action。把其中任一输入包装成确认 envelope，会伪造安全边界。

因此，A3.0 attempt 2 **不可伪造继续**。该缺口使 V3 当前阶段无法完成 A3.0 cumulative acceptance，也就不能合法进入 S3.2、M3.1 与 V3 后续门禁，构成当前路线死锁。按生命周期协议，它必须先进入 Change Intake，不能暗中塞入 A3.0 acceptance 或 S3.2 编码。

## 2. Change Intake 分流结论

- 类型：**V3 当前阶段缺口**。
- 必要性：P5 DoD 要求至少一个正式支持主宿主达到 `full`；没有 production trusted host，fresh activation/rollback action、可信时钟、principal/session binding 和可恢复 replay 都无法获得生产证据。
- 路线影响：不改变 `P5-M0 -> V1 -> V2 -> V3 -> V4 -> Final Acceptance`，不改变 TypeScript kernel 和 CLI 的 read-only/fail-closed 主边界；新增的是一个可选 macOS adapter。
- 支持边界：支持该 adapter 且能力预检通过的 macOS 用户会话可以成为首个 `full` host；其他环境、无 Secure Enclave、无交互用户会话或 CI 必须保持 `blocked / safe-readonly`，不得自动降级为伪 full。
- 当前结论：本文件只形成候选，不代表已批准、已实施、已通过独立评审或已解除 blocker。

## 2.1 受影响真源、PC/里程碑、正式基线与验证成本

冻结的 Git 位置与语义 authority 必须分开解释：

- candidate parent / checked-out branch governance tip：`bd5c902f3410a244b9c6a949f659552d7a4c4812`。它承载 A3.0 cumulative plan candidate 与 entry review 的治理/评审证据，也是本 CR candidate 的唯一父；它不是 product baseline，也不是 source/runtime baseline；
- runtime/source authority：`71085626b518ce5f8ebf5bfa546f96ea2f834730`。它以 `7cd3dd1fe3aae23a1759d604783b182558fb4c15` 为唯一父，是 exact-eleven 文档/状态同步提交，未修改产品代码、Schema、测试、依赖或构建配置；它用于累计验收 source/state 执行与当时状态投影，不替代 accepted product baseline；
- accepted product baseline：`7cd3dd1fe3aae23a1759d604783b182558fb4c15`，用于产品代码与测试身份；
- formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`；
- blocker 固化时的 control ref：`1b244c822ee5aa2a246fce0341a788f2c90f1897`，其中持久化 blocker Result digest 为 `sha256:49eef940a268e6b791a349ac053aa8d1d51340a434f4de8060dd57fd85c0f0bf`；当前 live control=`e1a41fbc04a006d8812d51e2a00bdcf3c95c87c0`，只新增 entry-review PASS 后的 `awaiting-user-final-approval` 状态，不代表 CR 已批准；
- 代际：全局 `plan_generation=5`，当前 `v3_plan_generation=2`。

Git refs/branch tip 的当前位置与每个 baseline 的语义角色是两件事：即使检出分支 tip 指向 `bd5c902f3410a244b9c6a949f659552d7a4c4812`，也不得用该治理/评审 tip 替代 runtime/source authority 或 accepted product baseline。

`55e942b0bdc1318372f6c6226f8a469f7fa894e8` 只是 bd5 内 checked-in `PROJECT_ROUTE_LOCK.md` 与历史状态文字仍记录的旧 control，不是当前 live ref。bd5 中的 `PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md` 与 CR-007 存在时间漂移，其旧 control 或旧入口文字不能覆盖 fresh refs/control。若本 CR 后续获批，首个状态同步/plan 修订必须更新这些真源；本 Change Intake candidate 不顺手修改它们。

若本 CR 后续获批并进入实施，至少会影响 `PROJECT_ROUTE_LOCK.md`、`docs/PLANS.md`、P5 产品实现里程碑、V3 adoption amendment/CR-007、Change Request index、Skill 交互真源、技术架构、package/release 边界与 QA/验收真源。本候选只列明影响，不修改这些文件，也不把未来计划或实现状态写成已生效事实。

PC 主版本归属保持不变。PTH 是 `V3 / M3.1 / A3.0` cumulative acceptance 之前的前置缺口，不是新的 PC，也不得冒充 PC-14、替代 PC-14 证据或把 A3.0 单包结果升级为 M3.1/V3 完成。

完整验证成本至少包括：TypeScript contract、负向和故障注入测试；Swift helper、Node bridge 与 append-only ledger；受支持 macOS 上的真人 UI action E2E；Developer ID、Hardened Runtime 与 notarization 证明；实际 `.tgz` 的 direct-import/物理归档审计；A3.0-A/B fresh compatibility audit；以及 source baseline 改变后的新 A3.0 cumulative acceptance。当前本机仅有 Command Line Tools 且不能取得本 CR 所需 biometry policy 证明，无法完成最终发布验证。

## 3. 最小产品闭环与信任边界

Production Trusted Host 的最小闭环是：

```text
只读 capability profile
-> kernel 生成结构化 challenge/view
-> macOS helper 自己 canonicalize 并展示 exact view
-> 展示完成后才调用系统 userPresence / biometry policy
-> Secure Enclave P-256 key 对完整 action statement 签名
-> Node bridge 校验 helper 身份、签名、时钟、nonce 和 ledger
-> module-private opaque capability 进入 kernel
-> activation 或 rollback 执行
-> durable receipt 与 replay 结论
```

核心不变量：

1. helper 必须接收结构化字段，自行执行 RFC 8785/JCS canonicalization、自行显示 exact view；不得接收外部已经计算好的 raw digest 并充当通用签名器。
2. 系统 `userPresence` 或明确选择的 `biometryCurrentSet` 只能在 exact view 已完成显示后触发；认证成功不能倒推用户看过另一个 view。
3. kernel 只接受由受信 bridge 在同一受控执行边界内铸造的 module-private opaque capability。plain object、JSON clone、序列化后重放或另一进程构造的“同形对象”均必须拒绝。
4. activation 与 rollback 是两个独立 fresh action。activation 的 capability、nonce、view、签名或 receipt 不能用于 rollback。
5. Node/TypeScript 层不能导出 verifier mint、私钥操作、raw signer、write kernel 或绕过 helper 的构造器。
6. macOS adapter 不受支持或预检失败时，公开 CLI 仍只允许 inspect/status 等 safe-readonly 行为；不能出现公开 `adopt --commit`、`rollback` 或等价写入口。

## 4. Action statement、receipt 与签名绑定

helper 签署的 canonical action statement 必须完整绑定以下字段；缺失、未知、重复、顺序歧义或任一漂移都拒绝：

- host adapter id、helper bundle id、helper protocol version、helper code-signing identity、immutable helper build identity；
- principal identity、macOS user-session identity、登录会话/GUI audit session；
- NextStep session id 与一次性 effect id；
- repository identity、canonical project root identity、worktree identity；
- candidate digest、confirmation/rollback view digest、display receipt digest；
- challenge id、challenge digest、action kind；
- nonce、issued time、displayed time、authenticated time、signed time、expiry；
- activation 时的 expected namespace/effect；rollback 时的 activation receipt 与 current namespace digest；
- exact public-key identity、Keychain item identity、application tag / key tag、密钥创建策略；
- 用户看到的 side effects、unknown gates、non-goals 与 rollback restrictions 摘要。

签名验证、signed receipt、ledger replay key 与 effect recovery 必须同时绑定 helper build identity、public-key identity 与 exact key tag。任何字段变化都必须产生新 challenge 和新系统认证，不能重新使用旧签名；旧 receipt 最多只能作为历史审计对象，不能在 build identity 或 key identity 漂移后继续消费为新的 effect、恢复或 exact-retry 授权。

## 5. 五个独立实施包候选

以下五包必须分别拥有冻结 allowlist、正负测试、独立 package acceptance 和 Result；本 CR 不执行这些包。

### PTH-A：领域契约与 opaque capability

- 定义结构化 challenge、exact view、display receipt、action statement、verified action、effect receipt 和错误合同。
- canonical digest 只由 kernel/helper 各自从结构化字段重建并交叉验证；禁止“调用方提供 digest 即信任”。
- verified action 只生成不可序列化、module-private、单 effect、单 session 的 opaque capability。
- plain object、prototype 模仿、JSON clone、structured clone、跨进程反序列化、旧进程 capability、重复 consume 全部 fail closed。
- 将 activation 与 rollback 分成不同 action kind、challenge schema、capability brand 和消费端口。

### PTH-B：macOS 用户会话 Swift helper

- 采用 Swift，使用 Security、LocalAuthentication、Keychain 与 Secure Enclave P-256 signing key。
- Secure Enclave 私钥必须在受支持硬件中创建并以稳定、显式的 application tag / key tag 绑定；不得导入预制私钥，也不得让外部调用方替 helper 选择“任意 key”。
- 密钥访问策略必须显式冻结为 `userPresence + privateKeyUsage` 或更严格的 `biometryCurrentSet + privateKeyUsage`；两种策略不可在运行时静默互换，能力 profile、receipt 与 release evidence 必须声明实际策略。
- helper 自己验证 schema、canonicalize、渲染并展示完整 action view；只有 display receipt 固化后才请求系统认证。
- helper 不提供 raw digest、任意字节或任意 JSON 签名 API，不允许 headless `--sign`，不接受外部 `LAContext` 成功声明。
- helper 校验自身 code identity/protocol version/build identity，并将其纳入 action statement；replacement、downgrade、调试 entitlement、未签名或 identity 漂移必须阻塞。
- 正式分发必须 code sign、启用 Hardened Runtime、使用 Developer ID，并完成 notarization；开发期 ad-hoc/local 签名不能充当正式分发证明。

### PTH-C：Node bridge、Keychain identity 与 durable replay

- bridge 通过固定 framing/protocol 与 helper 通信，验证 helper 可执行文件、code signature、bundle/protocol version、build identity、响应 schema、签名、public-key identity 与 exact key tag。
- Keychain 保存或引用 key identity；私钥材料不得进入 Node、日志、环境变量或 ledger。
- 建立 append-only JCS ledger，至少记录 challenge、display receipt、signed action、effect identity、effect result 与 recovery receipt 的内容摘要和前序链。
- replay 必须具有三态：`new`、`exact-retry`、`conflict`。只有 canonical identity、nonce、action、helper build identity、public-key identity、key tag、effect、receipt 和当前状态全部一致时才允许 exact-retry 返回同一结果；其他重用一律 conflict。
- ledger 要求 crash-safe append、锁/并发冲突检测、损坏检测和可恢复读取；不得用可覆盖的“最新状态 JSON”代替审计链。

### PTH-D：能力 profile 与 activation/rollback 集成

- 在 adoption 前执行只读 capability profile，证明 OS/架构、Secure Enclave、Keychain、user session、LocalAuthentication policy、helper identity、clock、ledger 和 bridge 均满足本次 action 要求。
- profile 只证明“本次可尝试”；不得缓存成永久 `full`，每次 fresh action 前必须重检相关能力与漂移。
- activation action 绑定 exact candidate/view/session/principal/repository/worktree/clock/nonce/replay/effect。
- rollback 必须生成另一份 fresh view/challenge/action，绑定 activation receipt、当前 namespace digest、helper build identity 与 key identity；不得复用 activation capability。
- action 验证与 Git effect 之间若发生 session、principal、clock、helper、repository、worktree、namespace、build identity、key identity 或 plan authority 漂移，必须零写入或进入既定恢复，不误报成功。
- 无 Secure Enclave、无登录用户会话、LocalAuthentication policy 不可用、CI/headless、远程非交互会话或不可裁决状态均 fail closed 为 `blocked / safe-readonly`。

### PTH-E：稳定包物理边界与发布证明

稳定交付物必须拆成两个物理边界：

1. `nextstep` npm/tgz：保留 CLI read-only/fail-closed 主入口。新增 Node import `exports` 精确允许且仅允许：
   - `nextstep/host/action-contracts`：只读类型、parsers、public-key verification；
   - `nextstep/host/capability-profile`：只读 capability-profile request/result；
   - `nextstep/host/action-receipt`：只读 receipt parse/verify。
2. `nextstep-host-macos` 签名并 notarized 的可选 adapter：包含 helper、私有 bridge 与运行时写集成；它不是 npm direct-import surface。

`nextstep` tgz 必须移除 broad `dist/src/adapters/**/*.js`、`dist/src/domain/**/*.js` 文件通配，改为 bundle 或精确 runtime closure。归档中不得出现 write kernel、verifier mint、module-private capability mint、Keychain private-key operation、helper IPC private modules 或任意 raw signer。package root import、未列明 subpath 和深路径 import 必须由 `exports` 拒绝。

发布门禁必须对实际 `.tgz` 解包并逐文件审计，并执行 direct-import deny tests：已知敏感路径、随机深路径、绝对归档路径、CommonJS/ESM 条件导出和符号链接逃逸均不得导入。签名 host artifact 必须另行验证 Developer ID、Hardened Runtime、entitlements、notarization ticket、stapling、helper hash 与安装后 identity。仅有源码测试或本机 build 不能替代这两个物理交付物的验证。

## 6. 安全、恢复与威胁模型

### 6.1 必须拒绝的伪造与漂移

- plain object、JSON/structured clone、跨进程重建、stdin/argv/env/chat 文本、自述 verifier result；
- helper 接收 raw digest、调用方预先 canonicalize 的 opaque bytes 或未展示内容；
- display 前认证、display 后内容变化、窗口被替换/遮挡后仍沿用旧 receipt；
- host/helper/protocol/principal/session/repository/worktree/candidate/view/challenge/action/nonce/time/effect 任一漂移；
- helper build identity、public-key identity、key tag、Keychain item identity 或 release identity 漂移；
- trusted clock 回拨、expiry 边界、旧 nonce、重复 action、并发双消费和不同请求复用同一 effect id；
- activation capability 用于 rollback，或 rollback 未绑定 current namespace；
- helper 被替换、降级、重签、注入、调试附加或以未认可 entitlement 运行；
- 无 Secure Enclave、无 user session、CI/headless 或系统 policy 不可用时自称 `full`。

### 6.2 Helper replacement、key rotation 与重装风险

Node bridge 不能只按路径启动 helper。它必须验证静态 code signature、designated requirement、Team ID/Developer ID、bundle id、protocol version、immutable build identity、文件 identity，并在启动后绑定实际 peer process identity。安装更新、重装或公钥轮换必须是显式迁移：新 helper build identity、新 public key、新 key tag 或新 Keychain item 一旦生效，所有未消费 challenge、session capability、ledger lease、future exact-retry 授权与可继续 effect 都必须失效。

历史 receipt 可以保留为只读审计证据，但在 helper build identity 或 key identity 漂移后，不能继续被当作新的 trusted action、继续消费或新的恢复授权。release acceptance 还需覆盖 helper 文件在检查与 exec 间被替换、进程启动后 executable 被替换、旧版本回放、同名恶意 helper、同 signer 同版本替换，以及“重装后同 bundle 生成新 key tag”场景。

### 6.3 Clock、replay 与并发

- 时间窗口使用 trusted wall clock 并辅以同进程 monotonic interval；检测到 wall-clock rollback 或跨启动不可裁决时拒绝并要求新 challenge。
- exact expiry 视为过期；不得在 `now == expires_at` 消费。
- ledger 对 `(host, principal, session, repository, action, nonce, effect, helper_build_identity, public_key_identity, key_tag)` 建立唯一性与原子占用；并发只允许一个 `new` 胜出。
- effect 已提交但回执丢失时，只有 exact-retry 可以查询并返回原 receipt；conflict 不能创建第二个 effect，也不能“修复”单个 ref。
- ledger 损坏、缺页、链断、锁状态不可裁决时保持业务/ref 状态不变并进入恢复。

## 7. 验收矩阵

每个 package 的单元、集成、故障注入和独立验收之外，累计验收至少覆盖：

1. PTH-A 的 plain object、JSON clone、cross-process、旧 capability 与双 consume 拒绝。
2. PTH-B 证明 helper 只签自己 canonicalize 且已展示的 action statement；raw digest signer 探针失败。
3. `userPresence` 与 `biometryCurrentSet` 策略分别有明确能力/拒绝证据，不允许测试替身冒充正式策略。
4. PTH-C 覆盖 `new / exact-retry / conflict`、崩溃点、clock rollback、expiry、并发和 ledger 损坏。
5. PTH-D 覆盖 activation/rollback 两次独立 fresh action、effect 前漂移、回执丢失恢复和 safe-readonly 降级。
6. PTH-E 对实际 `.tgz` 和签名 host artifact 做物理审计与 direct-import deny tests。
7. 至少一次在受支持的 macOS 宿主中完成真实 UI action E2E：真人看到 exact view，系统 userPresence/冻结 biometry policy 成功，签名 action 被 bridge 验证，effect/receipt/recovery 可追溯。模拟 UI、fixture verifier、聊天确认、命令行按键或本机无 policy 的测试均不能替代。
8. 覆盖 helper binary replacement、同 signer 同版本替换、公钥轮换、同 bundle 重装后新 key tag，以及旧 receipt 只读可验证但不可继续消费的场景。
9. 在无 Secure Enclave、无用户会话、CI、helper identity 不匹配与 policy 不可用环境中验证 fail closed。

## 8. 当前本机证据与发布限制

2026-08-30 的本机只激活 Command Line Tools：`xcode-select -p` 为 `/Library/Developer/CommandLineTools`，`xcodebuild` 明确拒绝并提示当前不是完整 Xcode。当前环境也不能取得本 CR 所要求的生产 biometry policy 证明。

因此，本机可用于领域合同、Swift 编译可行性和 fail-closed 测试，但不能证明最终 helper 已满足 UI、Secure Enclave policy、Developer ID、codesign、Hardened Runtime 或 notarization 门禁。正式分发必须在具备有效 Developer ID、受支持硬件和真实交互用户会话的环境中独立复验；若当时所选构建/签名/打包流程需要完整 Xcode，则必须在完整 Xcode 环境中完成对应验证。不得把 CLT 构建、ad-hoc 签名或 fixture 结果写成正式发布 PASS。

## 9. Apple 官方依据

- Secure Enclave P-256 signing private key：<https://developer.apple.com/documentation/cryptokit/secureenclave/p256/signing/privatekey>
- 使用 Secure Enclave 保护密钥及其硬件/P-256限制：<https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave>
- Secure Enclave token identity：<https://developer.apple.com/documentation/security/ksecattrtokenidsecureenclave>
- `SecAccessControlCreateFlags`：<https://developer.apple.com/documentation/security/secaccesscontrolcreateflags>
- `userPresence`：<https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/userpresence>
- `biometryCurrentSet`：<https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/biometrycurrentset>
- LocalAuthentication policy：<https://developer.apple.com/documentation/localauthentication/lapolicy>
- Keychain Services：<https://developer.apple.com/documentation/security/keychain-services>
- Code Signing Services：<https://developer.apple.com/documentation/security/code-signing-services>
- macOS notarization：<https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>

这些依据只证明 Apple 平台提供相关 primitive 和分发机制，不自动证明 NextStep 的协议、helper、签名绑定或用户动作已经安全实现。

## 10. 计划与代际影响

- 全局 `plan_generation=5` 可暂保持，不在本 Change Intake candidate 中执行全局 generation CAS。
- 仅当本 CR 通过 fresh 独立评审并获用户最终批准后，才可另行形成 V3 generation 3 修订计划，并对该计划执行 fresh 独立 entry review；CR 评审或批准本身均不创建计划、不推进代际。
- generation 3 plan entry PASS 后，仍必须以分离的 generation-advance CAS 与 generation-ack CAS 才能使 `v3_plan_generation=3` 生效；plan candidate、entry PASS 或用户批准均不能替代这两个控制转换。
- 获得上述 CR 评审、用户批准、plan entry PASS 与两个分离 CAS 之前，不得创建 A3.1 packet、claim/fence、dispatch 或编码。
- 获批后的 plan 应把 `A3.1 Production Trusted Host`（或语义等价的独立 amendment）插在 A3.0 cumulative acceptance 之前。
- 不得把 PTH-A..E 塞进 A3.0 acceptance，也不得扩大 S3.2 exact-14。S3.2 的既定职责和写集保持冻结。
- A3.0-B product surface 是历史已接受成果，不重写其历史。PTH 实施后必须对 A3.0-A/B 做 fresh compatibility audit，并明确哪些结论可 carry forward。
- PTH 实施必然改变 A3.0 cumulative 的 source baseline；现有 blocked attempt 2 必须保留 Result，随后 tombstone/supersede，并基于新 source、plan、host artifact 和 authority 创建新的 cumulative acceptance attempt。不得原地修改 attempt 2 或复用其 user-action challenge。
- 后续 packet、claim/fence、dispatch、编码、验收与集成继续各自分离。

## 11. 明确非目标

- 不建设 daemon、数据库、远端 attestation、通用宿主平台或常驻远程控制面。
- 不把 CI、fixture verifier、manual-isolated 或命令行交互等价为 `full`。
- 不公开 `nextstep adopt --commit`、`nextstep rollback`、`--force` 或等价写 CLI。
- 不创建或修改 genealogy-hub/任何真实项目 refs，不执行真实项目 adoption。
- 不修改 S3.2 exact-14，不提前实现 S3.2。
- 不重写 A3.0-A/B，不篡改其既有 acceptance 与 Result。
- 不让 npm 包导出 write kernel、verifier mint、private host modules、Keychain 私钥端口或 raw signer。
- 不把 macOS 首个 adapter 扩张成跨平台通用框架；其他 OS/宿主另行 Change Intake。

## 12. 迁移、降级与回滚

- 新 adapter 是可选新增能力；不支持环境继续使用现有 TypeScript kernel/CLI 的 read-only 与 fail-closed 路径。
- adapter 安装、密钥创建、Keychain item 或 ledger 初始化都必须由后续独立 packet 明确授权；本 CR 不写 Keychain、不生成签名、不创建文件外部副作用。
- helper/bridge 无法通过预检时，回退到 `blocked / safe-readonly`，不能回退到弱 action verifier。
- 未执行 Git effect 时可丢弃未消费 challenge；已执行 effect 后只按既有 receipt/recovery 契约恢复，不能删除 ledger 或重签来“重来”。
- helper build identity、公钥、key tag 或 Keychain item 发生迁移后，旧 receipt 只能按历史审计读取；若要继续 effect 或 recovery，必须由新 build/key 身份重新展示 exact view 并获得新的 trusted action。
- adapter 整体不可验证时，稳定版不得宣称 `full` host，A3.0 cumulative 与后续 V3 门禁保持阻塞。

## 13. 当前权限边界与下一入口

本 Change Intake candidate **不授权**：

- V3 generation 3 CAS、generation-advance/ack；
- A3.1 或任何 execution packet、claim/fence、dispatch、编码、独立验收或 main 集成；
- Keychain 写入、Secure Enclave 密钥生成、系统认证、签名或真实用户动作；
- genealogy-hub/任何真实项目 refs；
- A3.0 attempt 2 继续、S3.2、formal 移动、V3/P5 完成或稳定发布。

fresh 独立 Change Intake/架构/安全评审已以 review=`df765a6bdbfd6542685a90dce3aae4a435dcf784` 得出 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]`。下一合法入口仅为：由用户决定是否最终批准 candidate=`cb85025e4978ad07a9d5021b572952c08164ab3e` 与该独立评审。用户最终批准后也只允许另行准备并独立评审 V3 generation 3 修订计划，不直接授权 generation CAS、packet、编码、Keychain/Secure Enclave 动作、真实用户动作或真实项目 refs。
