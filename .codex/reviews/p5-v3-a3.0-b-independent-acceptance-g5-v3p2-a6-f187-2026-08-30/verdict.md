## 结论

PASS / 100

## 为什么

- HG0-HG9 全部通过：packet、dedup、subject、Execution Result、既有 acceptance Results 与 root ACK 单父链复算一致。
- 累计候选严格落在 `c5ea44ce -> 5bc681d4 -> a2d3b014 -> ab844fef -> 8de04925 -> 60d373ae` 单父链，聚合改动精确 16 路径，依赖变更 0，公开写 CLI 0，ref transaction 实现 1 处。
- fresh 定向 suite `24/24` 通过，changed-scope coverage 为 `98.34/87.23/100`；fresh `corepack pnpm check` 为 `600/600`，full coverage 为 `93.04/87.77/98.71`。
- formal/control 在测试前后保持 `ea04b57d` / `04b43744` 不变；无 remote、无 alternates、无真实项目 refs 写入。
- 保留 3 个显式 P2 残余风险：双 raw parser 漂移、不可达 rollback receipt blob aggressive GC、超长 raw ancestry 性能；未发现 P0/P1 或 unsafe success。

## 必须修改

- 无。

## 证据

- `gate-requests/gate-package-acceptance-a3.0-b-g5-v3p2-a6-f187-20260830.json`
- `messages/msg-dispatch-ready-a3.0-b-ixp-g5-v3p2-a6-f187-20260830.json`
- `messages/msg-dispatch-ack-a3.0-b-ixp-g5-v3p2-a6-f187-20260830.json`
- `results/result-execution-a3.0-b-g5-v3p2-a5-f186-20260830.json`
- `results/result-package-acceptance-a3.0-b-g5-v3p2-a2-f179-20260830.json`
- `results/result-package-acceptance-a3.0-b-g5-v3p2-a3-f181-20260830.json`
- `results/result-package-acceptance-a3.0-b-g5-v3p2-a4-f183-20260830.json`
- `results/result-package-acceptance-a3.0-b-g5-v3p2-a5-f184-20260830.json`
- `src/adapters/node/adoption-ref-store.ts`
- `src/adapters/node/project-status-source.ts`
- `tests/adapters/node/adoption-ref-store.test.ts`
- `tests/adapters/node/project-status-source.test.ts`
- `tests/cli/project-status.test.ts`
- `tests/domain/adopted-baseline.test.ts`
- `tests/domain/adoption-activation.test.ts`
- `tests/domain/project-status-projection.test.ts`
