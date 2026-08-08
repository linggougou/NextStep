# P5-M0 实施上下文摘要

## 当前状态

- 生命周期：`S5 开发落地`。
- 项目阶段：`P5 产品落地`。
- 当前里程碑：`P5-M0 实施就绪门禁`。
- 状态：候选已形成并通过本地门禁，待独立 L3 审查；不得进入 S1.1。

## 实施范围

- 固定 Node 24.14.0、pnpm 10.33.2、TypeScript 7.0.2 与严格编译配置。
- 使用 Node 内置 test/coverage，行、函数、分支阈值均为 80%。
- 实现 JCS、canonical bytes、SHA-256、摘要投影、精确契约版本、四态结论、机器回执、敏感字段和命令 dry-run 策略。
- 使用 Ajv 8.20.0 严格 Draft-07 Schema，不强转、不补默认值、不删除未知字段。
- 实现只读 `contract-probe`、Node 进程 I/O adapter、隔离临时 Git fixture 和依赖方向测试。
- 建立项目内 `skills/nextstep/` M0 入口，只允许阶段读取和只读探针。

## Agent 分工

- 主 Agent：工程配置、生产实现、集成、验证、真源和门禁。
- Terra：`tests/**` 的 RED 测试、CLI 集成测试和 Git fixture 强化。
- Luna：Node/包管理器/Ajv 只读核对，并前向测试 `$nextstep`。
- Sol：P5-M0 架构与 fail-closed 审查，发现版本、Schema、canonical bytes、摘要投影、dry-run 和 fixture 隔离缺口；候选已逐项修复。

## 验证结果

- `pnpm install --frozen-lockfile`：通过。
- `pnpm check`：通过，46/46 测试。
- 覆盖率：行 91.43%，分支 88.24%，函数 97.06%。
- `pnpm audit --registry=https://registry.npmjs.org --audit-level=high`：无已知漏洞。
- `git diff --check`、尾随空白、秘密、调试输出和 TODO 扫描：通过。
- `package.json` 和 Schema JSON：`jq` 解析通过。
- `skills/nextstep`：官方 `quick_validate.py` 通过，YAML 安全解析通过。
- `refs/nextstep/formal`、`refs/nextstep/control`、`.codex/runtime` 和真实 Execution Packet：均不存在。

## 首轮 L3 修复

- 首轮 Chief Reviewer 结论为 `REVISE / 78`；该结论已保存在 `.codex/reviews/p5-m0-implementation-2026-08-08/`，不能用于关闭门禁。
- 已修复完整输入信封敏感字段、`apikey`、未知字段、非法 UTF-8 和危险 `GIT_*` 环境继承问题，新增负例均通过。
- 路线锁已同步为候选已编码、本地门禁通过、待独立 L3 复审。
- 下一步必须将当前候选绑定 Git OID，从该 OID 的干净检出复验，再执行完整 L3 复审。

## 第二轮 L3 修复

- 固定 OID `7e3974b9caa2b76337b2f531ba03d5c85be4c9f7` 的 Verifier 为 `PASS`，Anti-Slop Judge 为 `PASS / 98`，Strict Judge 与 Chief Reviewer 均为 `REVISE / 85`。
- 第二轮发现并修复：非布尔 `dry_run` 运行时绕过、整个机器回执非 JCS 字节、成功回执 `data={}` 假成功。
- 修复后 40/40；下一步仍需绑定新 OID、干净检出验证和完整 L3，不得进入 S1.1。

## 第三轮 L3 修复

- 固定 OID `187f599edbaa63d74a6df3a8949c0b52f2dfc02e` 的 Chief Reviewer 结论为 `REVISE / 87`，P0 = 0、P1 = 1、P2 = 0。
- 已对成功回执的 `canonical_json` 重新执行 JCS 解析、敏感字段扫描和摘要一致性验证，并修正成功夹具。
- 非法 JSON、非 JCS、摘要不匹配和嵌入敏感字段负例均通过；当前 41/41，仍待新 OID 干净检出和完整 L3。

## 第四轮 L3 修复

- 固定 OID `389dadf9d699f032b9bebd3650939262815a17ee` 的 Chief Reviewer 结论为 `REVISE / 80`，P0 = 0、P1 = 3、P2 = 0。
- 已将 CLI 输入边界改为完整信封原始 JCS 字节校验，补齐敏感字段复数/组合变体，并让回执从单一 canonical 快照完成验证和冻结；访问器对象被拒绝。
- 空白、乱序、换行、重复键、敏感字段变体、访问器及命令访问器负例均通过；当前 46/46，仍待新 OID 干净检出和完整 L3。

## 第五轮 L3 修复入口

- 固定 OID `8a64af3bbdec89c4d4faa8f8533566d86bf4174e` 的 Verifier 为 `PASS`，Anti-Slop Judge 为 `PASS / 100`，Strict Judge 与 Chief Reviewer 均为 `REVISE / 82`，P0 = 0、P1 = 2、P2 = 1。
- 第五轮发现：普通 `toJSON` 数据字段可绕过依赖库 JCS 排序；摘要投影静默丢失非枚举和 Symbol 属性并执行 getter；动态 Proxy 可制造描述符验证视图与后续消费视图不一致。
- 当前修复边界是建立单次描述符快照、冻结纯 JSON 数据、直接 JCS 序列化和稳定投影/命令策略；修复后必须绑定新 OID、干净检出并执行第六轮完整 L3。
- P5-M0 仍未关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 第五轮 L3 修复结果

- 建立 `snapshotJsonValue`：每个输入对象只读取一次属性描述符，拒绝访问器、非枚举、Symbol、稀疏/扩展数组、非 JSON 值和循环；共享引用复用同一深冻结快照。
- JCS 改为只序列化冻结快照，`toJSON`、`__proto__` 均作为普通数据字段；移除会触发 `toJSON` 钩子的 `json-canonicalize` 依赖。
- 摘要投影、敏感字段扫描、命令策略和机器回执均验证并返回其消费的冻结快照；CLI 后续读取使用敏感扫描返回值。
- TDD RED 稳定复现 8 个第五轮问题；补充共享对象二次读取 RED 后，最终完整门禁为 59/59，覆盖率行 92.99%、分支 90.45%、函数 97.44%。
- 官方 registry audit、Skill 校验、格式、JSON、秘密、调试残留、refs/runtime/真实任务包和 P3/P4/S4 上游保护扫描均通过。
- 下一步是绑定新 commit/tree OID，从 `--no-local` 全新克隆复验并执行第六轮完整 L3；当前仍不得进入 S1.1。

## 工具替代

- 默认 pnpm registry 的 audit endpoint 不存在，改用 npm 官方 registry 重跑并通过。
- 系统 Python 缺少 PyYAML，Skill 官方生成器和校验器改在 `/tmp` 一次性虚拟环境运行；未写入项目依赖或全局 Python。
- 系统 Ruby Psych 不支持 `safe_load_file`，改用临时 PyYAML 环境安全解析并通过。

## 明确未做

- 未实现任何 `PC-01..PC-20` 产品能力。
- 未生成或派发真实 Execution Packet。
- 未初始化正式/control ref，未接 Codex SDK/App Server，未声明宿主模式。
- 未进入 S1.1，未修改 P3/P4/S4 已会签正文。
