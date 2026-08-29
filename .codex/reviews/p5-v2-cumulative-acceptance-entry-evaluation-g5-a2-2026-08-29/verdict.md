# V2 累计验收 Generation 1 入口独立评审

## 结论

`PASS / 100`。P0/P1/P2=`0/0/0`，`required_fixes=[]`。本轮已经独立证明 attempt 1 的唯一 REVISE 缺口被关闭：四组 immutable authority 在当前 no-local / origin-removed / no-alternates clone 中真实可寻址、可核对、可复算，因此该计划可以作为后续独立 packet 创建前的唯一入口。

## 为什么

- review subject、historical subject、entry control、formal 和 checkpoint 的身份链一致：subject=`b8fdae247d6b3259e31817c8d9ceba5c4137506f`，tree=`3d57644ab83c47af61be98bcc68317e145bc7c41`，唯一父=`d271513adadb15316c113c9982060ad457159c76`；entry control=`ef0ba6525fd2be8ac13c6d07ed4e4a9f991795d2`，formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`，checkpoint=`plan_generation 5`、`pending_dispatch_messages=[]`。
- attempt 1 唯一 required fix 已经被 controller-only provisioning 闭合：`3c0853...`、`381224...`、`a823f63...`、`5e95f22...` 四个 commit 在本 clone 中全部可寻址；两份 acceptance 为 exact-three，两份 signoff/identity review 为 exact-two，tree、唯一父和路径集均与计划第 5 节匹配。
- 我对所有冻结 digest 进行了独立复算：四组 JSON 走 RFC8785/JCS，Markdown 走 raw bytes，全部精确匹配计划写入的 sha256 值，没有出现 attempt 1 那种“只有文本 OID、不可独立复核”的硬缺口。
- provisioning 后 clone 继续保持 no-local / origin-removed / no-alternates / non-shallow，且 frozen formal/control、HEAD、HEAD tree 和工作树都没有漂移。计划里的 V2 并集、52/52、`>=555/555`、coverage floors `94.40/89.75/99.57`、I/X/P/Profile、readiness/ACK/create-once 与 signoff/completion 分离顺序也保持清晰且未越权。

## 必须修改

无。

## 证据

- `3c0853b56b7a09b3299e49893f64a721ab3597ea`：tree=`f840cb0e1aa2b1030fece5d7426f945997a955bd`，父=`6ec262fbac45de3d0f84c05a4a5582049139f219`，写集为 `.codex/reviews/p5-v2-m2.1-acceptance-g5-a1-f147-2026-08-27/{milestone-acceptance.json,scorecard.json,verdict.md}`，digest 全匹配 `035d2294... / da31dc7d... / 88eba0ed...`。
- `381224e6301c4a2d58841a99c233439c9b2e1e56`：tree=`0cb097f038e8b3f5518e809c43d496ed0e007a13`，父=`43df63566b4edd8496f3ad1e62533b980767abd8`，写集为 `.codex/reviews/p5-v2-m2.2-acceptance-g5-a2-f156-2026-08-28/{milestone-acceptance.json,scorecard.json,verdict.md}`，digest 全匹配 `818ab1cc... / 20c6887b... / 12cf5e8e...`。
- `a823f63b35475aeb03d853559af187354cdc6883`：tree=`0432861e56929bd09f7c14c0e4da6b401d3ee36b`，父=`3b0ce5435a259247b1849788664d39a4406038df`，写集为 `.codex/reviews/p5-v2-m2.1-signoff-package-review-a1-2026-08-27/{scorecard.json,verdict.md}`，digest 匹配 `977f57c3... / c669cb7c...`。
- `5e95f22dae75253ff8f35e022676aa02ad697ad8`：tree=`293eb9dec987a4b602ef50687d6a7f6c77ab0403`，父=`48d437454432abba4067e71bd38f51d5b5e8d397`，写集为 `.codex/reviews/p5-v2-m2.1-user-signoff-identity-review-a1-2026-08-27/{scorecard.json,verdict.md}`，digest 匹配 `c7ee32e9... / af6c0b19...`。
- `provisioning-evidence.json` 明确记录 `refs_before_equal_refs_after=true`、`head_tree_worktree_unchanged=true`、`remote_absent=true`、`alternates_absent=true`、`shallow=false`；当前 clone 复核仍为 remote=0、无 alternates、非 shallow、`refs/nextstep/formal=ea04b57...`、`refs/nextstep/control=ef0ba652...`、HEAD=`b8fdae24...`、HEAD tree=`3d57644a...`。
- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review-a2.9HCJee/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:74)
- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review-a2.9HCJee/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:94)
- [`.codex/verification-report.md`](/private/tmp/nextstep-v2-ca-entry-review-a2.9HCJee/clone/.codex/verification-report.md:3086)
- [PROJECT_ROUTE_LOCK.md](/private/tmp/nextstep-v2-ca-entry-review-a2.9HCJee/clone/PROJECT_ROUTE_LOCK.md:34)
