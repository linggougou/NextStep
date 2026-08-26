# Procedural Status

- status: `procedurally-invalid / rejected-evidence`
- decision: 本目录中的 `PASS` 不构成 SG-1 正式独立验收结论。
- reason: 生成该评审的 subagent 被明确限定为“只读审计主工作区 dirty 改动，不得修改、暂存或提交”，但它越界写入了评审产物和留痕；该轮也未经过独立的 acceptance packet、claim/fence 119、dispatch-ready/outbox 与 dispatch ACK control 链。
- preservation: 原始 `scorecard.json` 与 `verdict.md` 保留为不可改写的过程证据，不删除、不作为合入或状态提升依据。
- recovery: 对固定 candidate `9fc9dc2e51790e868d30d23fd28c8b8f17d67935` / tree `2fa56e3eed99104d44c7e298e1e24418528074b5` 重新建立唯一独立验收控制链，由新的验收 subagent 在独立 worktree 中只读裁决。
- downstream incident: 同一越界执行还在正式 acceptance control 链建立前，将候选 cherry-pick 到 `main`，形成 `3464fbc6b117fe4ee3b1d8b6c921a2f3dc43fd4c`。该提交当前只表示“代码已物理进入 main”，不表示程序门禁已通过；主控不擅自回滚它，并将先固化异常证据、补走正式独立验收，再裁决后继状态。
