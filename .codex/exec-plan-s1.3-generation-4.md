# S1.3 Generation 4 执行计划

状态：generation 4 attempt 3 已通过完整正式证据链并提升到 F13；M1.1 attempt 2 独立验收为 `PASS / 97`，当前等待用户会签。

## 0. 当前恢复点

- 候选：`0dc22758a9138f7d69ad812d7617eda709d0c392`，全量 `pnpm check` 为 `148/148`，三类身份与产品语义连续率 `3/3`。
- attempt 1：仅控制范围声明不完整，不代表产品实现失败；保留 blocked Result 与 tombstone，不包装为 candidate-ready。
- attempt 2：corrected packet 已关闭 allowlist 缺口并形成旧候选；L3 `REVISE / 82` 发现 readiness/source-state P1。
- attempt 3：只修改 `src/domain/product-definition.ts` 与 `tests/domain/product-definition-v2.test.ts` 关闭该 P1；CV 与 I/X/P 均通过，L3 attempt 2 为 `PASS / 98`。
- Final Snapshot、Final Verification、Credential、Anchor、Proof 与 F12→F13 CAS 已全部通过；formal=F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`。M1.1 用户会签前不启动 S1.4。

## 1. 控制面

1. 固定本规划提交为 working parent。
2. 从 F12 构造 S1.3 generation 4 attempt 1 packet，复算 RFC 8785 packet digest 与 dedup key。
3. 以 expected-old control CAS 持久化 packet、dispatch-ready、outbox、registry/checkpoint。
4. 建立四个独立 worktree，再启动 Claude Code / OpenCode；第三方会话身份写入 dispatch-ack 或执行留痕。

## 2. 并行开发

### A. Product Definition 2.0 Domain + Schema

- 先增加独立 RED 测试，覆盖 2.0 精确结构、identified/none 条件、字段级 item digest、constraint 冒充和 1.0 拒绝。
- 新增 v2 Schema，保留 v1 历史 Schema不变。
- 修改 product-definition domain，只给产品对象增加专属 2.0 解析，不放宽全局契约版本。

### B. Machine Receipt + CLI

- 先增加双层版本、canonical/digest/object 不一致和 legacy receipt RED。
- 保持 Machine Receipt 信封 1.0，`PRODUCT_DEFINITION_ACCEPTED.data.schema_version` 固定 2.0。
- CLI 只接收 canonical Product Definition 2.0，并返回既有拒绝码。

### C. Fixture + Skill

- 三份有效 fixture 迁移到 2.0；project-delivery-tool 只改线格式。
- community-workshop 与 expense-reminder 必须使用 F12 中的新 Frozen Requirement 和已裁决语义。
- 新增至少一份 1.0 legacy 拒绝 fixture；Skill 说明 2.0、readiness 前置与旧版拒绝。

### D. 候选前累计硬门

- 真实执行三类 intake、补全/确认、freeze、JCS 恢复，再把恢复对象注入 S1.3。
- 断言 ID、完整 canonical JSON 和 digest 3/3 连续。
- 以独立 S1.2 回放产物裁决 target users、non-goals、scope、journey、capability。
- 增加跨项目互换、仅替换 digest、同步篡改、constraint 冒充和 clarification 消费负例。

## 3. 集成顺序

1. Domain + Schema。
2. Machine Receipt + CLI。
3. Fixture + Skill。
4. 累计硬门。
5. 主控修复仅限 packet allowlist 内的集成问题。

每个 worktree 必须先通过局部测试、提交单父 commit 并返回变更清单。主控审查通过后 cherry-pick；不合格则在原 worktree 修正，验收后回收 Agent 和 worktree。

## 4. 候选前验证

- `pnpm typecheck`
- 受影响测试与三类累计回放
- `pnpm check`
- JSON 解析、Skill validator、官方 registry high audit
- `git diff --check`、allowlist、秘密/调试扫描
- formal/control/runtime/reviews 与工作父不变性

只有全部通过才形成 S1.3 candidate-ready 单父候选。

## 5. 候选后门禁

依次执行独立 CV 与 I/X/P，二者通过后运行 L3；再执行 Final Content Snapshot、Final Verification、项目外 Credential、Audit Anchor、Anchor Verification、Anchor Proof 和 expected-old=F12 的 F12 -> F13 CAS。任一步失败均停留 F12，不进入 M1.1 attempt 2 或 S1.4。

## 6. F13 与 M1.1 停点

1. F12 -> F13 成功后，以 ff-only 同步 main，并以独立普通提交同步状态入口；不 push。
2. 生成 M1.1 attempt 2 累积验收任务，验证三类 S1.1 -> S1.2 -> S1.3 连续链及 PC-01..PC-03。
3. M1.1 通过后停在用户会签门禁，明确报告业务能力、formal/control/main、风险与下一里程碑。
4. 未获用户会签前不创建 S1.4 packet，不编码 S1.4。
