# S1.1 需求入口实现上下文摘要

## 控制身份

- 任务包：`ep-p5-v1-m1.1-s1.1-g1-a1-20260809`
- 任务包摘要：`sha256:586e0db08151c8378b7943885c7dba6367448a4c8d72ce49769cb6a75becba81`
- 观测 baseline：`976feac8be464cb150204d804130829c7583da18`
- 当前 `HEAD`：`976feac8be464cb150204d804130829c7583da18`
- 控制引用派发时 OID：`6c948268857418aa4fad53839d403942d5c51110`

## 生命周期与边界

- 当前阶段：`S5 开发落地 / P5 产品落地 / V1 / M1.1 / S1.1`。
- 里程碑真源：`docs/exec-plans/active/p5-product-implementation-milestones.md`（formal ref）。
- 本轮阶段出口：一句原始想法可形成可校验、不可变的结构化需求候选，并由 headless CLI 输出唯一 JCS 机器回执。
- 最小可验收闭环：三类正例和六类负例 fixture 经领域入口与 CLI 回放，且不会生成开发任务。
- 明确非目标：S1.2 冻结/确认/恢复，S1.3 产品定义，开发任务、Execution Packet、外部模型、服务、数据库、UI、宿主适配、正式或控制 ref 写入。
- 变更判断：任务包内既定 S1.1 实现，不是新需求或阶段切换。
- 高危动作判断：不改变路线、技术栈、产品真源或验收门禁。

## 复用与验证路径

- 复用 `src/domain/canonical-json.ts` 的 RFC 8785 canonical JSON 解析和无原型深冻结快照。
- 复用 `src/domain/sensitive-fields.ts` 的敏感字段 fail-closed 扫描。
- 复用 `src/domain/machine-receipt.ts`、`schemas/v1/machine-receipt.schema.json` 和 `src/cli/contract-probe.ts` 的唯一 stdout 回执、stderr 诊断及非零失败约定。
- 测试模式：Node 内置 `node:test`，先更新/新增测试，再运行 `pnpm test` 记录 RED，完成最小实现后运行 `pnpm test` 和 `pnpm check` 记录 GREEN。
- CodeGraph：未初始化，且路线锁规定“需询问”；不初始化，使用现有文件、测试和 `rg` 进行替代检索。
- 适用运行时：已读取 `tdd-workflow` 与 `verification-loop`；以任务包固定 `pnpm test`、`pnpm check`、官方 Skill `quick_validate.py` 和范围/refs/runtime 反扫执行。

## 风险

- 严格输入契约必须不补造缺失事实，错误回执不得泄漏敏感值。
- 回执数据必须保持 JCS、无原型和深冻结语义，不生成开发任务字段或派发副作用。
- S1.1 会降低总覆盖率，必须通过 `pnpm check` 的全局 80% 门槛。
