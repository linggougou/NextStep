# P5-M0 实施候选 L3 审查结论

## 结论

`REVISE / 78`

P0 = 0，P1 = 4，P2 = 1。P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

送审快照的完整输入信封未完全 fail closed，Git fixture 可受继承环境重定向并写到临时根外，候选没有可供干净检出复验的 Git OID，且路线锁存在“候选待审查”与“未编码/尚未实现”的状态冲突。Verifier 的原基线通过不覆盖这些后续实际复现结果。

## 必须修改

1. 修复完整信封敏感字段、`apikey`、未知字段和非法 UTF-8 拒绝，并补全不泄漏负例。
2. 清除 fixture 的危险 `GIT_*` 继承变量，并证明外部路径零写入。
3. 同步路线锁状态，将完整候选绑定到明确 Git OID。
4. 从该 OID 的干净临时检出运行安装、类型检查、构建、全部测试、覆盖率、依赖审计和范围反扫。
5. 对新 OID 重新执行完整 L3，不复用本轮结论替代复审。

## 证据

- `src/cli/contract-probe.ts`
- `src/adapters/node/process-io.ts`
- `src/domain/sensitive-fields.ts`
- `tests/support/git-fixture.ts`
- `PROJECT_ROUTE_LOCK.md`
- `docs/exec-plans/active/p5-product-implementation-milestones.md`
- `.codex/verification-report.md`
