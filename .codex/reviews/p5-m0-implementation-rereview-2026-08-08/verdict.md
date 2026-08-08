# P5-M0 实施候选第二轮 L3 审查结论

## 结论

`REVISE / 85`

P0 = 0，P1 = 3，P2 = 0。固定送审 OID 为 `7e3974b9caa2b76337b2f531ba03d5c85be4c9f7`；P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

首轮四项 P1 和干净检出门禁均已关闭，但修改型命令仍可用非布尔真值绕过 dry-run，CLI 的整个机器回执不是 RFC 8785 原始字节，成功回执 Schema 允许空 `data` 假成功。

## 必须修改

1. 运行时校验完整命令调用对象，修改型命令严格要求 `dry_run === true`。
2. 用 JCS 输出整个机器回执，并验证 stdout 原始 UTF-8 字节。
3. 按成功/失败代码约束 `data`，拒绝空成功数据、缺字段、错误类型和额外字段。
4. 补齐负例，绑定新 commit/tree OID，从全新检出执行完整门禁并重新进行 L3。

## 证据

- `git:7e3974b9caa2b76337b2f531ba03d5c85be4c9f7`
- `src/domain/command-policy.ts`
- `src/cli/contract-probe.ts`
- `schemas/v1/machine-receipt.schema.json`
- `tests/domain/command-policy.test.ts`
- `tests/cli/contract-probe.test.ts`
- `tests/domain/machine-receipt-schema.test.ts`
