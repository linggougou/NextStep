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
- `pnpm check`：通过，38/38 测试。
- 覆盖率：行 90.20%，分支 86.47%，函数 97.06%。
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

## 工具替代

- 默认 pnpm registry 的 audit endpoint 不存在，改用 npm 官方 registry 重跑并通过。
- 系统 Python 缺少 PyYAML，Skill 官方生成器和校验器改在 `/tmp` 一次性虚拟环境运行；未写入项目依赖或全局 Python。
- 系统 Ruby Psych 不支持 `safe_load_file`，改用临时 PyYAML 环境安全解析并通过。

## 明确未做

- 未实现任何 `PC-01..PC-20` 产品能力。
- 未生成或派发真实 Execution Packet。
- 未初始化正式/control ref，未接 Codex SDK/App Server，未声明宿主模式。
- 未进入 S1.1，未修改 P3/P4/S4 已会签正文。
