# P5 / V1 / M1.2 / S1.4 Generation 1 执行计划

## 1. 目标

在不建设 NextStep Web/UI、不提前进入 S1.5/S1.6 的前提下，实现可运行的载体无关原型、产品载体裁决和 Acceptance Profile 适用性校验，并通过 headless、含 UI、冲突三类目标项目 fixture 证明 PC-04、PC-05 与 TG-04 的 S1.4 承接部分。

## 2. 当前身份

- main：`035b8e1e04177c7cb7e58ada002389d42d6320ca`
- formal：F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`
- control：`04677ae041443ba9bca740bb70b814b5347d6b26`
- plan_generation：`4`
- pending dispatch：`0`
- 入口裁决：`.codex/reviews/p5-v1-m1.2-s1.4-entry-evaluation-2026-08-14/`，`PASS / 100`

## 3. 用户旅程

1. 宿主读取已签 Product Definition 2.0 与当前路线。
2. 宿主组织载体无关原型候选，kernel 只做确定性校验。
3. 载体裁决固定验证主载体、真源承载、辅助入口与候选分支条件。
4. 目标项目路线派生 Acceptance Profile：headless 必需 I/X/P；含 UI 追加 UI 设计真源与 UI 还原证据；冲突 fail closed。
5. CLI 仅返回单个 JCS 机器回执，不签认、不回写、不移动 formal/control。
6. S1.4 证据经 CV、I/X/P、L3、Final Verification、Credential、Anchor、Anchor Proof 与 expected-old=F13 CAS 后才可正式提升到 F14。

## 4. TDD 与并行切片

### W1 载体无关原型

独占：`src/domain/interaction-prototype.ts`、`schemas/v1/interaction-prototype.schema.json`、`tests/domain/interaction-prototype.test.ts`、`tests/fixtures/interaction-prototype/**`。

DoD：输入、回应、确认节点、阶段转换、异常、恢复、不可偏离项完整；缺确认、非法转换、无恢复、Web/UI 主线声明、Codex 对话脚本窄化、敏感字段均拒绝。

### W2 载体裁决

独占：`src/domain/carrier-decision.ts`、`schemas/v1/carrier-decision.schema.json`、`tests/domain/carrier-decision.test.ts`、`tests/fixtures/carrier-decision/**`。

DoD：主载体=`skill-chat`、真源=`project-documents-git`，Web/UI 为候选分支且恢复条件可校验；冒充当前主线、覆盖已会签裁决或未知版本均拒绝。

### W3 Acceptance Profile

独占：`src/domain/acceptance-profile.ts`、`schemas/v1/acceptance-profile.schema.json`、`tests/domain/acceptance-profile.test.ts`、`tests/fixtures/acceptance-profile/**`。

DoD：headless、含 UI、冲突三类 fixture；路线/Profile 冲突 100% 拒绝且不得降级；独立任务只能提供证据，不能改变 Profile 适用性。

### W4 CLI / Receipt / Skill 集成

独占：`src/cli/interaction-prototype.ts`、`src/cli/carrier-decision.ts`、`src/cli/acceptance-profile.ts`、`src/domain/machine-receipt.ts`、`schemas/v1/machine-receipt.schema.json`、对应 `tests/cli/**`、`tests/domain/machine-receipt-schema.test.ts`、`tests/skill/**`、`skills/nextstep/SKILL.md`。

DoD：stdin 单条 RFC8785/JCS，stdout 单条回执，stderr 仅诊断，失败 exit 1；既有 S1.1..S1.3 Skill 断言不回归。

## 5. 集成顺序

W1、W2、W3 可并行；W4 依据冻结导出签名实现，若存在编译依赖则在 W1..W3 上传后补齐。主控按 W1→W2→W3→W4 顺序审核与集成，禁止 Agent 互相覆盖共享文件。

## 6. 本地门禁

- 每个切片：先 RED 测试、再最小 GREEN、再局部 typecheck/test。
- 集成候选：`pnpm check`，行/函数/分支覆盖率均 ≥80%。
- 三类 Profile fixture 裁决正确率 Q6=100%。
- `git diff --check`、`git fsck --strict --no-dangling`、敏感字段扫描、依赖方向测试通过。
- formal/control 在正式提升前保持 F13/packet 后 control；无 S1.5/S1.6 对象。

## 7. 失败处理

- packet/control CAS 失败：不编码、不派发，重读身份后重建。
- 任一切片失败：只回退该切片，不影响其他已通过切片；保留失败测试与证据。
- Profile 冲突：阻塞，不降级为 headless。
- 需要改变 006/007/008/S3/S4/P3：进入 Change Request，不在实现中偷改真源。
