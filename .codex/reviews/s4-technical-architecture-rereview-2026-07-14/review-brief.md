# S4 技术架构第二次独立复审任务

## 任务目标

对修订后的 `docs/architecture/s4-technical-architecture.md` 执行独立 L2 复审，确认首轮 4 个 P1 是否关闭，并扫描新增回归。只审查，不修改任何项目文件。

## 固定输入

- 只读副本：`/tmp/nextstep-s4-rereview-input/`
- 修订候选 SHA-256：`fb1d6150313549d897740e265483fffb43caff02917137f3667ea37c1fc0107a`
- 首轮 review brief：`.codex/reviews/s4-technical-architecture-2026-07-14/review-brief.md`
- 首轮独立结论：`REVISE / 84`，P0 = 0，P1 = 4。

## 必须核验

1. `Stage` 与 `Stage Gate` 已分离，Interaction Source 的产品/技术/里程碑/验收追踪与失效规则完整。
2. `refs/nextstep/control` 的 expected-old CAS、outbox、claim、lease、fencing 和崩溃恢复能防双写、迟到写者与重复副作用，且没有偷偷引入数据库或常驻服务。
3. Verification Credential 与 Anchor Proof 具备内容寻址、create-once、最小权限、摘要固定、防覆盖/删除/重放和 formal-promote 强制校验顺序。
4. `refs/nextstep/formal` 永不被工作树检出；正式读取、编辑视图状态、dirty/staged/untracked 保护和安全同步规则自洽。
5. RFC 8785 JCS、SHA-256、证据保留清理和新故障注入补强没有与已会签 S3/008/009 冲突。
6. 两个专用 Git ref、审计锚和项目外证明之间不存在 Git 对象自引用、循环依赖或提升后补写。
7. 仍然排除 Project Provenance Store、数据库、常驻服务、独立编排平台、P3/P4 实例和代码实现。

## 输出要求

在 `.codex/reviews/s4-technical-architecture-rereview-2026-07-14/` 写入 `verdict.md` 和 `scorecard.json`，使用 judge-harness L2 契约。结论只能是 PASS/REVISE/REJECT；按 P0/P1/P2 给出精确行号和修复。最终回复只返回结论、分数、P0/P1 和路径。
