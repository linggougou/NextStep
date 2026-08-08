# P5-M0 实施候选第四轮 L3 审查结论

## 结论

`REVISE / 80`

P0 = 0，P1 = 3，P2 = 0。固定送审 OID 为 `389dadf9d699f032b9bebd3650939262815a17ee`；P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

CLI 未按原始字节拒绝非 JCS 信封；敏感字段复数和常见命名变体可绕过并回显；机器回执验证原对象后重新复制，带变化访问器时可返回未验证状态。Verifier 与 Anti-Slop 的通过不覆盖这些动态边界复现。

## 必须修改

1. CLI 对完整输入原始字节使用 `parseCanonicalJsonBytes`。
2. 覆盖敏感字段复数、驼峰、下划线和组合变体，并证明 stdout/stderr 不泄漏。
3. 回执先形成单一 plain-data 快照，再在同一快照上验证并冻结；拒绝访问器属性。
4. 补负例，绑定新 commit/tree OID，完成干净检出和完整 L3。

## 证据

- `git:389dadf9d699f032b9bebd3650939262815a17ee`
- `src/cli/contract-probe.ts`
- `src/domain/sensitive-fields.ts`
- `src/domain/machine-receipt.ts`
- `tests/cli/contract-probe.test.ts`
- `tests/domain/machine-receipt-schema.test.ts`
