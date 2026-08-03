# S4 技术架构第三次独立复审任务

## 目标

只读复审修订候选，确认第二次复审剩余 2 个 P1 和 1 个 P2 是否关闭，并扫描回归。使用 judge-harness L2，输出 verdict.md 与 scorecard.json。

## 固定输入

- `/tmp/nextstep-s4-rereview2-input/`
- 候选 SHA-256：`68d90c936ae1c842949322647dc362923fcb2505f4d5dd90f7f469a3d8c16e30`
- 上轮结论：`.codex/reviews/s4-technical-architecture-rereview-2026-07-14/verdict.md`

## 定向检查

1. 宿主/Adapter 是否原子执行最高 fence 校验与 create-or-return 幂等创建；旧 claim 迟到、同 key/不同 fence、同 fence/不同 payload 是否被明确拒绝；能力不足是否禁止 full。
2. Verification Credential / Anchor Proof 最终摘要路径是否以 no-replace 原语发布，文件与父目录刷盘、目标已存在逐字节校验、平台能力不足 fail-closed 是否完整。
3. formal-promote 是否在 expected-old CAS 前要求锚为旧正式基线后代/快进，首次初始化是否是唯一例外。
4. 上述修订是否引入常驻服务、数据库、Project Provenance Store、P3/P4 偷跑或不现实的 Codex 能力承诺。
5. 重新检查 005/008/009/S3 完整性、Git 自引用、工作树保护、证据生命周期和风险验证。

## 输出

写入本目录 `verdict.md`、`scorecard.json`。结论只能 PASS/REVISE/REJECT；给出 P0/P1/P2、精确行号和修复。全程不得修改项目文件。
