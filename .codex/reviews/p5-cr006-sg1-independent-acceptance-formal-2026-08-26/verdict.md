# 结论

`PASS / 98`。固定候选 `9fc9dc2e51790e868d30d23fd28c8b8f17d67935` 通过 SG-1 generation 5 attempt 1 的唯一正式 package acceptance；P0/P1/P2 为 `0/0/2`。

本结论只表示 SG-1 复杂度预算内核可用。它不表示 PC-12、PC-19、V2、V4、P5、`full` host 或 formal promotion 完成，也不授权 user-signoff。

# 为什么

- 验收 packet、dedup、subject digest 独立复算完全匹配；实现 dispatch 链与验收 `packet -> claim/fence 119 -> unique host ACK` 均为单父链，当前 ACK 为 `e9100f0e41182135e10fb5997900060918c75aeb`。
- 候选 commit/tree/parent 精确为 `9fc9dc2` / `2fa56e3` / `a6b3a70`，真实写集恰为七条 SG-1 allowlist，没有依赖、CLI、adapter、control/formal 或项目配置变更。
- 六项冻结预算为 `12/24/2/2/1/5`；三态、边界加一、不可测、非法输入、多项超限稳定顺序、JCS 稳定和跳过验收/会签/CAS 的豁免拒绝均通过。
- 新鲜定向测试为 `8/8`；离线 frozen install 下载 0 个包后，全量 `pnpm check` 为 `482/482`，失败、跳过、取消、todo 均为 0，覆盖率 Lines/Branches/Functions=`93.49/88.98/99.15`。
- 两项 P2：原始 RED 输出没有内容寻址固化；main 的 `3464fbc` 曾在正式验收前提前 cherry-pick。同一主线内容没有被用作本次 PASS 证据，程序异常仍需在 Result/状态同步中披露。

# 必须修改

无。`required_fixes=[]`。

下一步只允许主控固化独立 immutable Result，并收敛 SG-1 registry/route 状态；不得把本 PASS 扩大为 user-signoff、formal 移动、V2 packet、V4、P5 或真实产品完成。

# 证据

- Subject：`9fc9dc2e51790e868d30d23fd28c8b8f17d67935`；tree=`2fa56e3eed99104d44c7e298e1e24418528074b5`；parent=`a6b3a70a90eae6d26c94ca0cd20ac8cf9c85f95c`。
- Acceptance packet：`sha256:b658064af3fac1fc7bd7e62500ef77da912b423b42794aa0c47e1315c02abd32`；dedup=`sha256:27a236cdb49057e0d858d9bc52bec59ee8c343cf1125af564a6b0504b2987856`；subject digest=`sha256:0f7176fc65970b75af7c422b9aa1454259fb37198a31b397f24c833717c78d40`。
- Control：implementation ACK=`e0394c27d70ae522ebc1ae754124124d0a9f3242`；acceptance packet=`91cdc9f2963201fa6d69704a1484ef73f02b48fb`；claim=`4676b97a879baa7de2072878e437354d758936e9`；ACK=`e9100f0e41182135e10fb5997900060918c75aeb`；formal=`ea04b57de83d6c548dcb1629b1f61832db8375ad`。
- 验证：`node --experimental-strip-types --test tests/domain/scalability-budget.test.ts` 为 8/8；`corepack pnpm check` 为 482/482；`git diff --check`、`git fsck --strict --no-dangling`、路径/行数/依赖/边界扫描通过；评审工作树在写入 exact-2 前 clean。
