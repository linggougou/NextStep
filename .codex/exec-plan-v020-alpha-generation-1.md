# P5 / v0.2.0-alpha Generation 1 最小执行计划候选

## 1. 计划性质与冻结身份

- 本文件是 `P5 / v0.2.0-alpha` 的 Generation 1 **执行计划候选**，不是 Execution Packet、claim/fence、dispatch、实现候选、验收 Result、安装授权、tag 或发布结论。
- 生命周期保持 `S5 / P5 产品落地`；本计划服务于 V2 formally-completed 后的本地内部开发者预览检查点，不改变 P5 的 V3、V4、Final Acceptance 与最终阶段出口。
- 冻结基线：main parent=`f17a7bf57aff4647d75672266dbccda15d172ccb`，tree=`2d855ca14bee9cec6edcd807b183eb418bbc35af`；formal=F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`；control=`4f466224a442dd9650905722398bfad743e327fa`；`plan_generation=5`。
- 计划身份：`stage_id=P5/v0.2.0-alpha`、`task_id=V020-ALPHA`、`route_generation=1`、`alpha_plan_generation=1`、未来首个实现 `task_attempt=1`。`alpha_plan_generation` 只表示本 alpha 计划自身的修订代次，不得替代控制面的 `plan_generation=5`。
- V2 已 formally-completed；V2 attempt 1 Result=`sha256:f82ce4edd94b587f7f076eb6b52cfffbb2acb0b9b6dd2690a3d1aa4940543ad2`、Result control=`82e20134381a8a21891babaca6484f54de236974`、completion control=`4f466224a442dd9650905722398bfad743e327fa`。这些对象只证明入口成立，不自动批准 alpha。
- 本候选必须交给未参与制定的 fresh 独立 entry reviewer。只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才允许主控另行准备唯一 Execution Packet；REVISE/REJECT 时不得创建 packet。

## 2. 目标、阶段出口与可用性定义

### 2.1 单一目标

把已通过 V1/V2 的开发者内核固定为一个可在本机打包、临时安装并从统一命令发现/调用的 `v0.2.0-alpha`，让开发者无需记忆多个 `dist/src/cli/*.js` 路径即可进行受控试用。

### 2.2 定位

- `v0.2.0-alpha` 仅为**本地、内部、开发者预览**。
- `package.json` 必须继续保持 `private: true` 与 `license: "UNLICENSED"`。
- 本检查点不声明 npm/公开发行、普通用户完整产品、稳定 API、`full` 可信宿主、CR-006 关闭、qualified real runs 完成、formal promotion、V3、V4、Final Acceptance 或 P5 完成。
- CLI 安装与 Skill 安装是两个独立动作。tarball 中可以携带仓库 Skill 源，但本计划及后续实现不得自动复制、覆盖、重置或升级用户级 Skill。

### 2.3 可验收交付物

1. 统一可执行入口 `nextstep`，仅暴露冻结子命令白名单。
2. 版本号为 `0.2.0-alpha` 的本地 tarball，内容严格受 `files` 白名单约束。
3. 可随包读取的 canonical `version-chain` quickstart 输入。
4. README、Skill 与 release 文档中的开发者预览边界、安装步骤、已知限制和回滚方式。
5. RED→GREEN→refactor 测试、fresh full coverage、tarball 内容、临时安装、CLI smoke 与 SHA-256 证据。

### 2.4 阶段出口

只有在未来实现候选经独立 package acceptance 通过、线性集成后从最终 subject fresh 重建 tarball，并在一次性临时目录完成安装与 smoke，且 tarball SHA-256 被记录和独立复算一致时，才可称为“`v0.2.0-alpha` 本地候选可用”。这仍不授权 tag、push、upload、publish、用户级安装或正式发布。

## 3. 未来实现写集与禁止范围

### 3.1 唯一允许路径（exact-twelve）

未来 `V020-ALPHA` attempt 1 只允许修改：

1. `package.json`
2. `src/cli/nextstep.ts`
3. `tests/cli/nextstep.test.ts`
4. `tests/release/v020-alpha-package.test.ts`
5. `examples/quickstart/version-chain.json`
6. `skills/nextstep/SKILL.md`
7. `skills/nextstep/agents/openai.yaml`
8. `README.md`
9. `docs/releases/index.md`
10. `docs/releases/v0.2.0-alpha.md`
11. `.codex/operations-log.md`
12. `.codex/verification-report.md`

`skills/nextstep/agents/openai.yaml` 当前用户可见 short description 仍停在 P5-M0；alpha 包携带 Skill 时必须与 SKILL/README 的 V1/V2 formally-completed、alpha internal-preview 边界同步。若实现需要第 13 个路径，必须 fail closed，返回计划修订或 Change Intake，不得“顺手”扩容。

### 3.2 明确禁止

- 不修改 `pnpm-lock.yaml`、`tsconfig.json`、任一 `schemas/**`、`src/domain/**`、`src/adapters/**`、既有 `src/cli/*.ts`、既有测试/fixture、路线锁、产品/架构/里程碑真源或 Git refs。
- 不新增运行时或开发依赖，不改变 Node/pnpm 版本，不新增 `prepack`/`prepare`/`postinstall` 等生命周期脚本；避免 `pnpm check -> package test -> pack -> prepack -> pnpm check` 递归。
- 不暴露内部探针，不把已设计为进程内可信 capability 的动作降级为 shell 可伪造入口。
- 不生成或提交仓库内 tarball、`node_modules`、缓存、临时安装目录、日志转储或用户级 Skill 副本。
- 不创建 tag，不 push、upload、publish，不写 npm registry，不改远端，不改 formal/control。

## 4. 统一 CLI 冻结契约

### 4.1 入口与调度方式

- `package.json.version` 精确改为 `0.2.0-alpha`。
- `package.json.bin` 精确新增 `{ "nextstep": "dist/src/cli/nextstep.js" }`。
- 不新增 `main` 或 `exports`；alpha 只承诺 `bin`，不把内部模块提升为稳定可导入 API。
- `src/cli/nextstep.ts` 使用 `#!/usr/bin/env node`，只依赖 Node 标准库；通过 `process.execPath` 启动同包 `dist/src/cli/` 下的既有编译入口，`shell` 必须为 false/缺省，不拼接命令字符串。
- 子进程继承 stdin/stdout/stderr，剩余参数逐项原样传递；聚合器不得解析、缓存、打印或重写 stdin 内容，不得吞掉子命令的退出码。spawn error、异常 signal 或不存在的编译入口必须非零退出并输出无敏感值的通用诊断。
- 无参数与 `--help` 输出 help 并 exit 0；`--version` 只输出 `0.2.0-alpha` 并 exit 0。help 不展示内部/被拒绝命令、绝对路径、Git refs 或能力声明。

### 4.2 唯一子命令白名单

| 用户子命令 | 编译入口 |
|---|---|
| `status` | `project-status.js` |
| `requirement-intake` | `requirement-intake.js` |
| `requirement-freeze` | `requirement-freeze.js` |
| `product-definition` | `product-definition.js` |
| `interaction-prototype` | `interaction-prototype.js` |
| `carrier-decision` | `carrier-decision.js` |
| `acceptance-profile` | `acceptance-profile.js` |
| `write-consistency` | `write-consistency.js` |
| `source-validate` | `source-validate.js` |
| `version-chain` | `version-chain.js` |
| `major-milestone` | `major-milestone.js` |
| `small-milestone` | `small-milestone.js` |
| `execution-packet` | `execution-packet.js` |

- `contract-probe` 与 `project-value-validation` 必须显式拒绝，且不得出现在 help、候选建议或 quickstart 中。
- 任何未知命令、大小写变体、路径形态命令、`../`、绝对路径、以内部文件名绕过的尝试均不得 spawn，必须使用非零退出和通用诊断 fail closed。
- `requirement-freeze`、`write-consistency --commit`、正式确认/写入等仍必须依赖既有进程内可信 verifier/session/clock/filesystem capability。聚合 CLI 只做进程调度，不能注入 capability；直接 shell 调用必须继续按既有设计 fail closed。

## 5. package/tarball 冻结契约

### 5.1 `package.json.files`

`files` 只允许以下精确运行/说明内容：

- `dist/src/**/*.js`
- `dist/schemas/v1/**/*.json`
- `skills/nextstep/SKILL.md`
- `skills/nextstep/agents/openai.yaml`
- `README.md`
- `examples/quickstart/version-chain.json`
- `docs/releases/v0.2.0-alpha.md`

加上 npm/pnpm 自动包含的 `package.json`。编译后的 `dist/src/domain/*.js` 使用相对路径读取 `dist/schemas/v1/**/*.json`，因此只携带根目录 `schemas/v1/**` 不构成可运行包；根目录 Schema 源文件不得替代编译产物。不得包含 `dist/**/*.d.ts`、`dist/**/*.map`、`src/**`、根目录 `schemas/**`、`tests/**`、`dist/tests/**`、`.codex/**`、`.git/**`、除精确 alpha release note 外的其他 `docs/**`、`node_modules/**`、未跟踪文件、开发日志或本地绝对路径。`UNLICENSED` 是 package metadata 状态，不得凭空生成或宣称开放许可证文件。

### 5.2 产物与安装边界

- 只在一次性项目外临时目录执行 local pack 与 install；使用项目既有包管理器和 offline/frozen 能力，不访问 registry。
- tarball 文件名应为 `nextstep-0.2.0-alpha.tgz`；产物不提交到仓库。
- 计算 raw tarball bytes 的 SHA-256，格式固定为 `sha256:<64 lowercase hex>`；实现候选内的 verification report 记录 exact digest、字节数、生成命令与 packet parent，不写尚未形成的自身 commit/tree。候选 subject OID 由后续独立 review/control evidence 外部绑定，避免自引用。
- 独立 reviewer 必须从同一 immutable candidate subject fresh 重建并复算；digest 不一致即 REVISE，不得以文件名或版本号相同替代内容一致。
- 临时安装必须禁用生命周期脚本；不得安装到全局、用户级 Codex skills 或当前仓库。

## 6. TDD 实施顺序

未来实现必须使用 TDD skill 的 RED→GREEN→refactor 顺序；每阶段由实现者在专属 worktree 留下命令与原始摘要。

### 6.1 RED

先仅新增测试/fixture，至少证明：

1. 聚合 CLI 的 help/version/无参数行为与唯一 13 项白名单。
2. `version-chain` 通过聚合入口保持 stdout JCS、stderr、exit code 和 canonical quickstart 的 `VERSION_CHAIN_ACCEPTED` 行为。
3. `status` 的参数透传，子命令成功/失败退出码透传。
4. unknown、`contract-probe`、`project-value-validation`、路径穿越/绝对路径命令均不 spawn、非零退出且不泄漏输入/路径。
5. `write-consistency --commit` 等敏感动作不会因聚合器获得可信 capability，既有 fail-closed 边界不弱化。
6. package metadata 精确为 version/bin/private/license/files，不新增 main/exports，且 lockfile、依赖集合和 lifecycle scripts 不变。
7. tarball 内容只命中第 5.1 节白名单，明确排除源码、测试、`.codex`、Git、用户未跟踪对象和开发日志。
8. tarball 可在项目外临时目录 offline/ignore-scripts 安装；installed bin 的 version/help/canonical smoke/unknown/sensitive/fail-closed 均符合契约。
9. 测试结束后清理自身临时目录，不修改 worktree tracked 状态或 refs。

RED 必须因缺少 `nextstep.ts`/bin/files/version 等目标行为失败；不得写永远通过、只查字符串、跳过真实进程或用 snapshot/padding 假装覆盖。

### 6.2 GREEN

- 只实现使 RED 通过的最小 dispatcher、metadata、quickstart 与文档。
- 不修改既有 CLI 来适配聚合器；聚合器必须适配既有行为。
- 不捕获和重发业务 receipt，不增加全局状态，不引入抽象框架或插件系统。

### 6.3 Refactor

- 仅去除本轮新增代码的明显重复，保持命令表为单一冻结映射。
- 重构后重新运行 targeted、full、coverage、pack/install smoke 与 diff/status 检查；不得扩大写集。

## 7. Fresh 验证硬门

### 7.1 targeted 与 full

- `pnpm build` 必须通过。
- targeted 至少运行编译后的 `dist/tests/cli/nextstep.test.js` 与 `dist/tests/release/v020-alpha-package.test.js`，passed 必须等于实际枚举总数，failed/skipped/cancelled/todo=`0/0/0/0`。
- `corepack pnpm check` 必须 fresh 通过，full tests>=`555/555`，failed/skipped/cancelled/todo=`0/0/0/0`；不得降低测试分母或删除/skip 既有测试。
- 同一次 Node native coverage 的 Lines/Branches/Functions displayed 与 same-range raw 比例均不得低于 V2 冻结基线=`94.45%/89.76%/99.57%`，并记录 covered/total 与精确比例。LCOV 只可旁证，不得替代、拼接或从 rounded displayed 反推 raw。

### 7.2 打包与安装 smoke

在项目外 `mktemp -d` 目录中顺序完成：

1. 从 immutable candidate subject fresh build/check。
2. local pack，机械列出 tar entries 并执行第 5.1 节 allow/deny 断言。
3. 计算 tarball SHA-256 与字节数。
4. 在第二个干净临时项目中以 offline + ignore-scripts 安装该 tarball。
5. `nextstep --version` 精确输出 `0.2.0-alpha`。
6. `nextstep --help` 只列 13 项白名单。
7. 把已安装包内 `examples/quickstart/version-chain.json` 送入 `nextstep version-chain`，得到 exit 0、stderr empty、单一 canonical JCS，`code=VERSION_CHAIN_ACCEPTED`。
8. unknown、`contract-probe`、`project-value-validation` 非零退出；敏感/可信 capability 命令保持既有 fail-closed，且临时项目无被写入目标业务文件。
9. 验证 tarball 与临时安装目录位于仓库外；结束后只移除本任务自己创建的临时目录。

### 7.3 不变性与反扫

- `git diff --check` 通过；candidate 相对 packet parent 的路径精确等于第 3.1 节 exact-twelve。
- `pnpm-lock.yaml`、依赖集合、既有 CLI/domain/schema 的 blob OID 不变。
- 测试/pack/install 前后 formal/control 与 candidate HEAD/tree 不变；tracked 状态不新增包产物。
- 对 README、Skill、release 文档与 CLI help 反扫：不得出现 npm/public release、stable/full host、V3/V4/Final Acceptance/P5 complete、CR-006 closed、qualified real runs 3/3、自动 Skill 安装或 tag 已创建等过度声明。

## 8. 文档与 quickstart 要求

- `examples/quickstart/version-chain.json` 必须是 RFC 8785/JCS canonical JSON，来自现有已接受 `version-chain` fixture 的最小可公开开发者样例；不得包含凭据、主仓库绝对路径、真实用户数据或伪造正式会签。
- README 首屏标明 `v0.2.0-alpha / internal developer preview / private / UNLICENSED`，给出最短 local pack、临时 install、help/version 与 version-chain smoke；明确自然语言整理依赖宿主 AI，内核接收结构化 canonical JSON。
- Skill 与 `agents/openai.yaml` 只同步统一入口和当前可用边界，不重写已会签交互语义；二者都必须保留各阶段门禁和 trusted-capability fail-closed 说明，manifest 不得继续把产品描述成 P5-M0-only。
- `docs/releases/index.md` 登记 alpha 候选与“非正式发布”；随包的 `docs/releases/v0.2.0-alpha.md` 记录版本、范围、验证方式、已知风险、回滚与禁止发布边界，但不得嵌入 tarball 自身 SHA 或最终 commit OID，避免包内容与自身 checksum/subject 形成自引用。精确 tarball SHA-256、字节数和独立复算结果只写入不随包的 `.codex/verification-report.md`。
- 回滚只需停止使用/删除项目外临时安装与 tarball，或回退本轮单一线性产品提交；不得使用 destructive Git 命令，不得触碰用户级 Skill。

## 9. 独立角色与后续控制顺序（本任务不执行）

1. fresh 独立 entry reviewer 只审本计划候选；reviewer 不得参与计划修订、packet、实现或后续 package acceptance。
2. entry PASS 后，主控重新读取 live main/formal/control/`plan_generation`/pending，才可用独立 expected-old 单父 CAS 创建唯一 alpha Execution Packet。
3. 之后按分离控制动作创建 claim/fence、dispatch-ready/outbox 与 dispatch ACK；ACK 前实现者仅 readiness，不得编码。
4. 唯一实现 subagent 在隔离 worktree 按第 3.1 节 exact-twelve 和第 6 节 TDD 实施。由于 dispatcher、package metadata、测试和文档共享同一契约，不拆成并行写同一文件的多个实现者。
5. 由另一名未参与计划/实现/control 的独立 reviewer 在无原仓库访问、无 remote/alternates 的隔离环境执行第 7 节 package acceptance。
6. 只有 PASS 才允许主控线性集成候选并从最终 subject fresh 重建、临时安装和复算 checksum；失败则不合入、不打 tag、不包装为可用。
7. tag、push、upload、publish、用户级安装与正式 release 判断必须是此后独立门禁和明确授权；alpha package acceptance 不隐含这些权限。

## 10. Entry review 硬门

独立 entry review 至少核对：

1. main/formal/control/`plan_generation=5` 与 V2 completion authority 精确一致。
2. 目标严格是本地内部开发者预览，`private: true`、`UNLICENSED`、无发布授权。
3. future 写集为 exact-twelve，包含同步用户可见 Skill manifest；`pnpm-lock.yaml`、domain/schema/既有 CLI 明确禁止。
4. help 只含 13 项子命令，`contract-probe`/`project-value-validation` 明确拒绝且不可绕过。
5. dispatcher 使用无 shell 的 sibling-process 方式，stdin/stdout/stderr/exit code 透明，trusted capability 不被扩权。
6. package files 只含运行时 JS/JSON、Skill+manifest、README、quickstart、alpha release note；tar denylist、offline/ignore-scripts 临时安装、checksum 非自引用留痕与零仓库产物要求闭合，且不新增 main/exports/prepack。
7. RED→GREEN→refactor、targeted、full>=555、零失败/跳过、coverage displayed/raw>=`94.45/89.76/99.57` 全部可机械执行。
8. README/Skill/release/quickstart 没有稳定版、正式发布、full host、P5 complete 或自动 Skill 安装的过度声明。
9. 角色隔离、packet→claim/fence→ready/outbox→ACK→实现→独立验收→条件式集成顺序完整。
10. 当前 candidate 写集严格为本计划与两份追加留痕 exact-three，没有创建 packet/ref/package/install/tag。

结论只允许 `PASS / REVISE / REJECT`。只有 `PASS / 100`、P0/P1/P2=`0/0/0`、`required_fixes=[]` 才允许进入 packet preparation；本候选不得自行批准。

## 11. 当前任务停止条件

- 当前只提交 `.codex/exec-plan-v020-alpha-generation-1.md`、`.codex/operations-log.md`、`.codex/verification-report.md` exact-three。
- 不运行产品 full tests；V2 `555/555` 与 coverage=`94.45/89.76/99.57` 只作为冻结基线引用，不冒充当前 fresh 证据。
- 不创建 Execution Packet、claim/fence、dispatch-ready/outbox、ACK、实现代码、tarball、安装、checksum、Result、tag 或 release。
- 不移动 main/formal/control，不关闭 CR-006，不改变 qualified real runs=`0/3`，不声明 alpha、V3、V4、Final Acceptance 或 P5 完成。
