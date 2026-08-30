# 结论

`REVISE / 90`，`P0/P1/P2=0/1/0`。当前候选已经正确保持全局 `plan_generation=5`、只新增 scoped `v3_plan_generation=2`，也没有偷渡 `src/schemas/tests/skills`、S3.2 exact-14、Generation 1 正文计划、formal movement 或真实项目 refs；但它还不能放行，因为 CR-007 的“是否已经获得用户最终批准”在现行真源中存在自相矛盾的口径。

## 为什么

`docs/change-requests/007-existing-project-adoption.md:3` 和 `docs/exec-plans/active/p5-v3-existing-project-adoption-plan-amendment.md:5-13` 都把 CR-007 写成“已由用户最终批准”，并据此只等待 fresh readiness review 与两个分离 generation CAS。可是 `docs/design-docs/p5-existing-project-adoption-design.md:5` 仍写“等待独立评审与用户最终批准”，同时 `docs/change-requests/007-existing-project-adoption.md:169` 还把“用户最终批准 CR”列成 readiness 之后的未来推进步骤。这个矛盾不是措辞小问题，而是会直接误导后续 controller/reviewer 是否还要再次请求 CR 批准，从而破坏你这次想冻结的 generation gate 顺序。

其余硬门我都机械复核过：候选在隔离 no-local clone 中评审，`HEAD=a7e907c022da1479dcc22e71542f8c9ba75d81cc`、`control=c8cbba15a3b08f49b8e0d1bfaa7549b15a24dbe9`、无 `alternates`；相对 `main=e3df650a6861274ff076c72276281cbf528e9188` 只改 10 个文档/留痕文件；S3.1 review tree 与 main tree 同为 `f16068e11a5ff24728055854338b473e8f909630`；两个 Result 文件内的 `result_digest` 也分别匹配 `sha256:9dbf9d3574d3f65800eafe5d526b7718d6d3f7bcd1f34dd35d8c6a7ab010f35f` 与 `sha256:5bff9b08619f4f1d71367e7df0cab697ebc08d7d2eb430171d170b4be1539678`。

## 必须修改

把当前批准状态在 CR、设计合同和增量计划三者中收敛成同一现行事实：

- 设计合同首页不能再把 CR-007 写成“等待用户最终批准”。
- CR 正文的推进顺序不能再把“用户最终批准 CR”列为 readiness PASS 之后的未来动作；如果想保留历史顺序，必须明确它已完成，只剩 fresh readiness review 与两个分离 CAS。
- 修订后仍要保持现有正确边界不变：`plan_generation=5`、`v3_plan_generation=2`、S3.1 `carry-forward-pending -> carry-forward-confirmed`、S3.2..S3.5 `superseded-before-packet`、A3.0-A/B 非伪 tombstone、两个 CAS 各自 exact-three。

## 证据

- `docs/design-docs/p5-existing-project-adoption-design.md:5`
- `docs/change-requests/007-existing-project-adoption.md:3`
- `docs/change-requests/007-existing-project-adoption.md:169`
- `docs/exec-plans/active/p5-v3-existing-project-adoption-plan-amendment.md:5-13`
- `docs/exec-plans/active/p5-v3-existing-project-adoption-generation-readiness.md:44-66`
- `git:a625089bf2828c7ccee7a286ef0c66a1c28c3457` 与 `git:e3df650a6861274ff076c72276281cbf528e9188` 的 tree 同为 `f16068e11a5ff24728055854338b473e8f909630`
