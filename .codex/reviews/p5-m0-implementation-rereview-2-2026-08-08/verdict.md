# P5-M0 实施候选第三轮 L3 审查结论

## 结论

`REVISE / 87`

P0 = 0，P1 = 1，P2 = 0。固定送审 OID 为 `187f599edbaa63d74a6df3a8949c0b52f2dfc02e`；P5-M0 不得关闭，不得进入 S1.1，不得生成真实 Execution Packet。

## 为什么

前两轮问题均已关闭，但成功回执的嵌入载荷 `data.canonical_json` 缺少跨字段语义校验，仍会接受非法或非 JCS 内容、摘要不匹配和字符串内敏感字段，构成可伪造的结构完整成功。

## 必须修改

1. 结构校验后严格解析 `canonical_json` JCS 字节。
2. 对解析载荷执行敏感字段扫描并验证 `digest` 一致性。
3. 修正成功夹具，补非法 JSON、非 JCS、摘要不匹配和嵌入敏感字段负例。
4. 绑定新 commit/tree OID，完成干净检出并重新执行完整 L3。

## 证据

- `git:187f599edbaa63d74a6df3a8949c0b52f2dfc02e`
- `src/domain/machine-receipt.ts`
- `schemas/v1/machine-receipt.schema.json`
- `tests/domain/machine-receipt-schema.test.ts`
