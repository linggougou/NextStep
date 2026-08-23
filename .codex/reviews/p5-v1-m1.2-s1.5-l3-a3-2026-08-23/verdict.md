# S1.5 attempt 3 独立 L3 终审裁决

## 结论

**`REVISE / 76`**。`P0/P1/P2 = 0/2/0`，五条硬门禁通过 3 条、失败 2 条。attempt 3 已修正历史测试计数，身份链、`353/353`、覆盖率、13/13 write-consistency、17/17 Acceptance Profile 与 Q6=100% 均可独立复现；但最终写入边界仍可能覆盖确认后的用户改动，且父目录竞态可使写入越出规范项目根。当前候选不得进入 Final Content Snapshot。

## 为什么

1. **P1-01：版本竞态被误报为提交成功。** `src/domain/write-transaction.ts:562-595` 在所有 precheck 通过后，会为 update 再读一次内容用于回滚，但只写入 `beforeContents`，不再与 `target.before_digest` 比较。活体探针第一次读取 `old-a`，第二次读取确认后出现的 `user-new`，实现随后仍写入 `planned` 并返回 `WRITE_COMMITTED`；用户新内容被覆盖。create 路径同样先检查缺失、后由 `src/adapters/node/file-write.ts:138-147` 普通 `rename(temp, target)` 安装，若目标在两者之间被用户创建，rename 会覆盖它并返回成功。
2. **P1-02：父目录替换可逃逸项目根。** 确定性 Node adapter 探针在 target/parent 预检完成后，将 `root/docs` 替换为指向外部目录的 symlink。`atomicWrite` 的 `lstat`、temp open、rename 和 readback 都沿父 symlink 执行，最终 `outside/new.md` 被写入 `planned`，结果仍为 `WRITE_COMMITTED`。这违反 PC-06、S3 §5.1 与 TG-01 的规范根/符号链接边界。
3. 现有 `tests/domain/write-transaction.test.ts:812-835` 名为 baseline read race，但只覆盖第二次读取抛 `ENOENT`/`EACCES`；未覆盖读取成功但内容已改变、create no-replace 竞态或父路径替换。因此 `353/353` 不能证明上述关键边界。
4. 其余证据可靠：L3/CV/IXP/execution packet、四份 dedup、三份 Result、三份 scorecard 和 subject digest 共 15/15 独立 RFC8785/JCS 复算匹配；Node v24.14.0、pnpm 10.33.2、offline frozen install 与 `pnpm check` 均通过，覆盖率 92.82/87.62/99.00。冻结窗口内 `main=b06d5db…`、`formal=F14 024c1db…`、`control=2282da4…` 未移动。

## 必须修改

1. 将 `mode + confirmed before_digest + mutation` 收拢到文件系统最终写入边界：update 最终写入前的当前 bytes 不匹配即 `WRITE_CONFLICT_REJECTED` 且零写入；create 使用原子 no-replace 安装，目标一旦出现不得覆盖。
2. 在最终 open/install/readback 路径固定或重新验证规范项目根与全部父路径；父目录变为 symlink、被替换或无法证明仍在根内时，以 `WRITE_ACCESS_BLOCKED` fail closed，禁止在根外创建 temp 或目标。
3. 新增三条确定性回归：第二次 baseline read 返回不同 bytes、create 目标在 precheck 后出现、父目录在 precheck 后变为 symlink。每条都必须证明零用户内容覆盖、零根外写入、`state_promotion=none`。修复后以新的 execution attempt 重跑 Execution Evidence、CV、I/X/P 与 L3，不得改写 attempt 3 历史。

## 证据

- 全量门禁：`pnpm check` → 353/353、0 fail；Lines/Branches/Functions = 92.82/87.62/99.00；source/compiled test files = 36/36。
- 身份复算：15/15 MATCH；subject = `f226e0fce689284b5f02747784d82c09c47b3ec5`，digest = `sha256:c01eb4ed6cae835e6c282e56b8a4a69c7f5c61adcebc58d14bf89ae0ac382d30`。
- 矩阵复验：13/13 write-consistency record digest；17/17 Acceptance Profile，Q6=100%。
- update 活体探针：`result_code=WRITE_COMMITTED`、`reads=3`、`writes=1`、`final_content=planned`、`user_change_was_overwritten=true`。
- create 活体探针：rename 前创建用户文件后，`result_code=WRITE_COMMITTED`、`final_content=planned`。
- 根逃逸活体探针：父目录替换为外部 symlink 后，`result_code=WRITE_COMMITTED`、`outside_content=planned`、`escaped_project_root=true`。
- 完整性检查：`git diff --check` 通过；所有 schema/fixture JSON 可解析；`git fsck --strict --connectivity-only` 退出 0（仅报告仓库既有 dangling objects）；control 父链零 merge commit。

边界声明：本裁决仅覆盖 S1.5 attempt 3 的 L3 终审；不构成 S1.5/M1.2/V1/P5 完成，不批准 Final Verification、Credential、Audit Anchor、F15 或 S1.6。CodeGraph CLI 虽已安装，但本 worktree 没有项目索引且本任务只允许写专属评审目录；本轮使用直接源码、既有测试和独立活体探针替代，未初始化 `.codegraph/`。
