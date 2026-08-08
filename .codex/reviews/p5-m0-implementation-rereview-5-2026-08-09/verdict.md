# P5-M0 实施候选第六轮 L3 审查结论

## 结论

`REVISE / 87`

P0 = 0，P1 = 1，P2 = 1。固定送审 OID 为 `35606ba9f894fdbdc3c6d978c1b7e6547e58d6fa`；P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

单次描述符快照、`toJSON`、摘要投影和动态读取问题均已关闭，但 JSON 对象快照仍使用普通对象容器并继承可变 `Object.prototype`。命令策略和 Ajv 回执校验可读取非自有必填字段，返回的冻结回执也可能依赖未被冻结的原型数据。Verifier 与 Anti-Slop 的通过不覆盖该可执行 P1。

## 必须修改

1. 所有 JSON 对象快照与投影使用无原型容器；命令和回执必填字段明确要求自有字段；Ajv 启用 `ownProperties`。
2. 补原型污染下命令、回执根字段和嵌套 `data` 拒绝，以及返回回执自有、深冻结和稳定性测试。
3. 补数组异常属性、RFC 8785 完整向量和对象所有权测试。
4. 修订绑定新 commit/tree 后重跑 clean clone、全量门禁和四角色 L3。

## 证据

- `git:35606ba9f894fdbdc3c6d978c1b7e6547e58d6fa`
- `src/domain/canonical-json.ts`
- `src/domain/command-policy.ts`
- `src/domain/machine-receipt.ts`
- `tests/domain/canonical-json.test.ts`
- `tests/domain/command-policy.test.ts`
- `tests/domain/machine-receipt-schema.test.ts`
