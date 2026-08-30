# Existing Project Adoption Change Intake 上下文摘要

## 任务与授权

- 日期：2026-08-30。
- 用户授权：将 Existing Project Adoption 作为 V3 当前阶段缺口候选进入 Change Intake；先补齐独立 control genesis、adoption 状态模型、可信确认与回滚契约，并完成计划修订和独立评审。
- 明确未授权：直接修改 S3.2、产品编码、创建 genealogy-hub refs、推进 V3 plan generation CAS、移动 main/formal/control 或声明 V3 完成。
- 工作基线：main/parent=`6ce2fa0e2b957fc0fab49d5ee2d62c503b9cc478`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`；启动时 live control=`007467180e32a866cbb15eba98a6c79b93b34529`。

## 已证实问题

- `project-status-source` 只接受同时存在的 formal/control refs、formal commit、单父 control commit以及 control tree 中合法 checkpoint/registry。
- `project-status-projection` 还要求 current task identity、已知状态、next action 绑定和合法 version signoff；空白 refs 或伪造 V1/V2 signoff 不能成为接入方案。
- genealogy-hub 已有 `S5/M1` 路线锁与活动计划，但没有 `refs/nextstep/*`；`status` 返回 `source-unavailable` 是预期 fail closed。
- S4 已允许 formal 首次指向“用户确认的现有基线”，但未定义独立 control genesis、adopted-baseline 状态、可信激活和双 ref 回滚。
- V3 Generation 1 的 S3.1 已进入实施，S3.2 exact-14 只负责职责隔离、幂等分派和 registry transition；不能静默扩大。

## Change Intake 分流依据

- 已会签 Skill 真源要求识别已有项目、已有路线锁和当前阶段，并允许用户选择已有项目。
- V3 出口要求至少一个正式支持主宿主以 full 完成自动分派与恢复；未初始化项目目前无法进入控制链。
- CR-006 的真实项目价值验证仍为 qualified runs 0/3；仅使用 NextStep-native fixture 不能证明既有项目接入价值。
- 因此 adoption 是 V3 当前阶段缺口候选，但是否正式纳入仍取决于本 CR 与 plan-generation 2 修订候选的独立评审和后续用户批准。

## 冻结的最小设计方向

1. 公开只读 `adoption-inspect` 只从候选 HEAD 的 Git blobs生成 candidate，不写 refs 或工作树。
2. 宿主 AI 可提出阶段映射，但 kernel 只接受带证据分类的候选；用户通过可信 action 明确确认 exact candidate digest。
3. control 使用零父 genesis 和以 genesis 为唯一父的 activation commit；业务 HEAD 不进入 control 父链。
4. trusted in-process activation 使用一次 expected-missing Git ref transaction 原子创建 formal 与 control。
5. `adopted-baseline` 不等于历史门禁已由 NextStep 验证；证据分类固定为 `verified`、`user-declared`、`unknown`。
6. 激活前后复核 HEAD/blobs/dirty/index/untracked/worktree/namespace；漂移零副作用失败。
7. 仅在无后继 control、refs 仍等于 activation OID/候选 HEAD 且 namespace 无额外 ref 时，允许 expected-OID 双 ref 原子回滚。

## 文件与评审边界

- 候选只修改 CR、设计合同、V3 plan-generation 2 增量计划、CR 索引和 `.codex` 留痕。
- 不修改 `src/**`、`schemas/**`、`tests/**`、`skills/**`、S3.2 原计划正文或任何 Git ref。
- 独立评审使用 Judge Harness，reviewer 只能追加其 scorecard/verdict，不得修订候选。

## 工具与替代流程

- CodeGraph CLI 存在但项目无 `.codegraph/`，且路线锁要求初始化前询问；本轮未初始化。
- 使用 `rg`、明确源码入口、S3/S4/P4/V3 真源、live refs 和 Git plumbing 规则完成影响分析。
