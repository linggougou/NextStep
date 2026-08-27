# v0.2.0-alpha 开发上下文摘要

## 目标

- 首个固定可用版本：`v0.2.0-alpha`。
- 目标窗口：2026-09-08 至 2026-09-12。
- 定位：P5 内部预发布检查点，不替代 V3、V4、Final Acceptance，不宣称 P5 完成或正式交付归档。

## 当前事实

- 生命周期阶段：`S5 / P5 产品落地`。
- live main：`004e3b13b9abd3c47529802be7b1adfd2611c4b0`。
- formal：`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- control：`d1e5624aebccd3d5675c10d022ba7caa9f687d82`。
- V1 已 formally-completed；V2 入口独立复评已通过。
- S2.1 generation 5 attempt 1 Execution Packet 已处于 `packet-prepared`，实现尚未派发。
- S2.1 packet digest：`sha256:94aa00ca0bf2bad7586adbfec25453e119413f5f46f73cbd6a7beedcd9694f3b`。

## 当前最小闭环

1. 为 S2.1 创建唯一 claim/fence。
2. 固化 dispatch-ready/outbox 与 dispatch ACK。
3. 在隔离 worktree 中按 TDD 实现 S2.1。
4. 由独立 subagent 验收候选；不允许实现者自批。
5. 通过后再合入 main，并进入 S2.2。

## S2.1 写集

- `schemas/v1/version-chain.schema.json`
- `src/domain/version-chain.ts`
- `src/cli/version-chain.ts`
- `tests/domain/version-chain.test.ts`
- `tests/cli/version-chain.test.ts`
- `tests/fixtures/version-chain/**`
- `skills/nextstep/SKILL.md`

## 明确不做

- 不并行编码 S2.2、S2.3、S2.4；它们存在顺序依赖。
- 不恢复 Web/UI，不新增服务、数据库或通用多 Agent 平台。
- 不把 alpha 预发布检查点包装为 V3/V4/P5 或 Final Acceptance 完成。
- 不读取、修改、暂存或清理原工作区受保护的 Multica 上下文文件及既有未跟踪评审文件。

## 验收策略

- 使用 `tdd-workflow`：测试先行，先 RED 后 GREEN，再重构。
- 使用 `verification-loop`：build、typecheck、全量测试与覆盖率、敏感信息反扫、差异审查。
- 目标覆盖率至少维持项目现有 80% 门禁；不得有 skip/cancel/todo。
- 实现候选与独立验收角色分离；只有 PASS 才允许集成。

## 并行边界

- control-audit：只读核对 claim/dispatch 控制链。
- s21-design：只读研究 S2.1 API、Schema、CLI 与测试模式。
- alpha-scope：只读收敛预发布打包范围。
- 主控：负责控制 CAS、worktree 建立、候选集成与最终验证。
