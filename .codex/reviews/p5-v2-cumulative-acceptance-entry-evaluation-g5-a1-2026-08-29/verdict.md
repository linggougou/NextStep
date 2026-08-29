# V2 累计验收 Generation 1 入口独立评审

## 结论

`REVISE / 78`。P0/P1/P2=`1/0/0`，`required_fixes=1`。当前计划候选已经把 V2 的范围、门槛、时序和非授权边界写得很严，但它引用的一部分历史 authority 在这份独立 clone 中不可独立寻址，因此还不能放行到 `packet` 创建门禁。

## 为什么

- subject、formal、entry control、`plan_generation=5`、`pending dispatch=0` 都是对的，见计划第 5-11 行和 verification report 第 3066-3069 行。
- V2 fresh gate 也写清楚了：`52/52` targeted、`>=555/555` full、same-run displayed/raw floors `94.40/89.75/99.57`、三类 fixture、readiness-only -> ACK -> create-once evidence ref -> 正式验收 -> Result -> signoff -> completion 的分离顺序都成立，见计划第 44-51、59-71、76-106 行。
- 但计划第 21-24、32-36 行把 M2.1/M2.2 acceptance review、M2.1 signoff package review 与 identity review 列为“必须全部可寻址”的 exact authority；我在这份隔离 clone 中实际核查时，这些 OID 都不可解析，而且 imported control `ef0ba652...` 的 tree 里也没有对应 exact-three review 目录，所以无法独立复核其单父关系和内容摘要。

## 必须修改

1. 让计划绑定的历史 authority 真正可独立审查：要么把 `3c0853b56b7a09b3299e49893f64a721ab3597ea`、`381224e6301c4a2d58841a99c233439c9b2e1e56`、`a823f63b35475aeb03d853559af187354cdc6883`、`5e95f22dae75253ff8f35e022676aa02ad697ad8` 及其 exact-three 内容纳入可审查仓库状态；要么修订计划，只绑定 imported control tree 里已经存在且可独立复核的 immutable artifacts。修复后重新做唯一独立 entry review。

## 证据

- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review.c07FtQ/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:5)
- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review.c07FtQ/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:21)
- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review.c07FtQ/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:44)
- [`.codex/exec-plan-v2-cumulative-acceptance-generation-1.md`](/private/tmp/nextstep-v2-ca-entry-review.c07FtQ/clone/.codex/exec-plan-v2-cumulative-acceptance-generation-1.md:76)
- [`.codex/verification-report.md`](/private/tmp/nextstep-v2-ca-entry-review.c07FtQ/clone/.codex/verification-report.md:3066)
