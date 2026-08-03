# 结论

`REVISE`，L2 评分 `90 / 100`。P0 = 0，P1 = 2。

首轮 4 个 P1 中，模型映射与正式引用/工作树分离已经关闭；无数据库控制面与项目外凭证各仍有一个并发或崩溃窗口，因此当前候选还不能离开独立技术审查门禁。

# 为什么

1. `Stage` 已与 `Stage Gate` 分离，Interaction Source 对 Product Definition、Technical Plan、适用 Milestone、Acceptance Evidence/Report 的版本化引用和内容变化失效规则完整，首轮 P1-1 已关闭。
2. `refs/nextstep/control` 已具备 expected-old CAS、outbox、claim、lease、单调 fence 和崩溃恢复，且没有引入数据库或常驻服务；但 fence 目前只随宿主调用传递，没有要求宿主或适配器原子拒绝旧 fence，也没有要求 `dedup_key` 在“查询与创建”之间具有原子幂等语义。旧 claim 在新 claim 接管后仍可能迟到调用宿主，首轮 P1-2 未完全关闭。
3. Verification Credential 与 Anchor Proof 已具备 JCS/SHA-256 内容寻址、最小权限、摘要绑定、防重放和 formal-promote 校验顺序；但“exclusive create 临时文件后原子重命名”不能保证最终摘要路径 create-once，普通 rename 可覆盖并存在检查后替换的 TOCTOU 窗口，且未要求重命名后刷盘父目录。首轮 P1-3 未完全关闭。
4. `refs/nextstep/formal` 已明确不直接被工作树检出；正式读取来自 ref/tree，普通分支为编辑视图，dirty/staged/untracked 时不会自动覆盖，首轮 P1-4 已关闭。
5. RFC 8785 JCS、SHA-256、证据保留/清理、故障注入与 005、008、009、S3 的已会签约束未见冲突；控制 ref、正式 ref、审计锚、Verification Credential 和 Anchor Proof 未形成 Git 对象自引用、循环依赖或提升后项目内补写。
6. 当前候选仍排除 Project Provenance Store、数据库、常驻服务、独立编排平台、P3/P4 实例和真实代码实现，未发现新增范围偷跑。

# 必须修改

## P0

无。

## P1

1. 宿主副作用的 fencing 仍不能阻止迟到写者和并发重复创建。证据：`s4-technical-architecture.md:353-355`。修复：把 `full` 的硬条件改为宿主或 Codex Adapter 对同一副作用键原子执行“仅接受最高 fence + 幂等创建/返回原结果”；查询后创建不能算幂等。若宿主不支持该原子契约，只允许 `manual-isolated` / `blocked`，并在 `project-probe` 中注入“旧 claim 暂停、新 claim 接管、旧 claim 恢复调用”的竞争验证。
2. 项目外凭证的 create-once 安装仍有覆盖和掉电丢失窗口。证据：`s4-technical-architecture.md:425`。修复：最终摘要路径必须用 `O_CREAT|O_EXCL`、hard-link install、`renameat2(RENAME_NOREPLACE)` 或等价 no-replace 原语发布；目标已存在时打开并逐字节校验，不得先检查再普通 rename；成功发布后必须刷盘父目录。无法提供 no-replace 与目录持久化保证的平台应 fail closed 或进入明确的受控存储适配。

## P2

1. 正式 ref 移动命令只展示 expected-old CAS，没有在命令契约中显式要求新锚是旧正式基线的后代。证据：`s4-technical-architecture.md:441,483`。建议在 `formal-promote` 中增加 ancestry/fast-forward 硬校验，首次初始化作为唯一例外，确保历史审计锚持续可达。

# 证据

- 固定候选：`/tmp/nextstep-s4-rereview-input/s4-technical-architecture.md`，SHA-256 `fb1d6150313549d897740e265483fffb43caff02917137f3667ea37c1fc0107a`。
- 固定上游：`/tmp/nextstep-s4-rereview-input/005-stage-document-contracts.md`、`008-downstream-interaction-product-acceptance-contract.md`、`009-s4-technical-input-supplement.md`、`s3-skill-interaction-source.md`、`PROJECT_ROUTE_LOCK.md`。
- 首轮基线：`/tmp/nextstep-s4-review-input/s4-technical-architecture.md`；首轮结论由复审 brief 固定为 `REVISE / 84`、P0 = 0、P1 = 4。
- 修订差异与格式：固定副本差异检查无空白错误；项目 `git diff --check` 通过。工作区既有未提交改动未被本次复审修改。
