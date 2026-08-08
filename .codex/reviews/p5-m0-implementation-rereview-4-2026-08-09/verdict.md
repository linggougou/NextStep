# P5-M0 实施候选第五轮 L3 审查结论

## 结论

`REVISE / 82`

P0 = 0，P1 = 2，P2 = 1。固定送审 OID 为 `8a64af3bbdec89c4d4faa8f8533566d86bf4174e`；P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

`json-canonicalize` 会把普通 `toJSON` 数据字段当作钩子，导致非 JCS 载荷被 parser、CLI 和回执接受；摘要投影通过 `Object.entries` 静默丢失非枚举和 Symbol 属性并执行 getter；动态 Proxy 仍可让描述符验证视图与后续读取视图不一致。Verifier 与 Anti-Slop 的通过不覆盖这些可执行复现。

## 必须修改

1. 让 `toJSON` 始终作为普通 JSON 数据字段处理，并补根级、嵌套、CLI 和回执负例。
2. 摘要投影拒绝访问器、非枚举属性和 Symbol，并基于同一次描述符快照构造投影。
3. 规范化、敏感扫描和命令策略验证并消费同一份冻结纯数据快照。
4. 修订绑定新 commit/tree OID，从 `--no-local` 全新检出重跑验证和完整四角色 L3。

## 证据

- `git:8a64af3bbdec89c4d4faa8f8533566d86bf4174e`
- `src/domain/canonical-json.ts`
- `src/domain/content-digest.ts`
- `src/domain/command-policy.ts`
- `tests/domain/canonical-json.test.ts`
- `tests/domain/digest-projection.test.ts`
- `tests/domain/command-policy.test.ts`
- `tests/cli/contract-probe.test.ts`
