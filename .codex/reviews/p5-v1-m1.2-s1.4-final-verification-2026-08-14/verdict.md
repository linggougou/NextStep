# S1.4 独立 Final Verification 裁决：PASS / 98

- 任务：`S1.4-FV` attempt 1，claim `claim-s1.4-fv-g4-a1-f80-20260814`，fence `80`
- 评审 Agent：`01a000a9-396c-73d2-a5ba-26ec970b558d`（qwen3.8-max，manual-isolated / headless consumer contract）
- 对象：Final Content Snapshot `git:37d37e1b51369113378f4b68de16beea12d3400f`（tree `ec05462dd8f8c935ba43aa1bcc7789035246999d`），baseline formal F13 `84c051f7426ec5d2a9bed70aa02a1f321bd81e11`
- 裁决：`PASS`，最终得分 `98 / 100`（raw 100，罚 2 分，均为非阻塞透明度/继承项）
- 结论：五条硬门禁全部通过，允许主控继续 Anchor 链与 expected-old=F13 的正式 CAS 准备；本裁决不批准 formal promotion 本身。

## 一、派发与控制面身份

- dispatch-ack `msg-dispatch-ack-s1.4-fv-g4-a1-f80-20260814` 已在 `refs/nextstep/control` HEAD `f0e16b77…` 持久化；`host_task_id` 与本 Agent ID 精确一致，packet/dedup/claim/fence/baseline/working_parent 全部一致。
- control 父链完整：`8265f5bd`（快照冻结）→ `882c214f`（备包）→ `8a011ba7`（派发意图）→ `3b0f6689`（claim fence 80，即主控指定的 claim control）→ `f0e16b77`（ack）。
- FV packet RFC8785 复算 `sha256:fe0034d9…` 匹配；dedup 派生集 `{repository_id, plan_id, plan_generation, task_id, task_attempt, packet_digest, route_generation}` 复算 `sha256:7fa52650…` 匹配，且 packet/dispatch-ready/ack/outbox effect_key/registry 五处一致。
- 上游四份 packet（execution/CV/IXP/L3）摘要全部 RFC8785 独立复算匹配；四份 gate result、三份 scorecard、subject `{commit,parent,tree}` 摘要复算匹配。上游四包的 dedup 派生集与 S1.3 时代集合不同（项目先例允许、ops-log 已记录），按跨位置一致性校验通过（IXP `8b526bfb…`、L3 `321b58d1…`、CV `84c76185…`），记 PEN-1。

## 二、隔离复验（唯一 --no-local 副本）

- 克隆：`/private/tmp/nextstep-fv-s1.4-g4-a1-f80-Oz1nOX/clone`，detached `37d37e1`，tree 精确等于 `ec05462…`，工作区干净。
- 安装：`pnpm install --offline --frozen-lockfile --ignore-scripts` 成功。
- `pnpm check`：exit 0，`tests 206 / pass 206 / fail 0`；覆盖率 `Lines 91.07% / Branches 83.80% / Functions 98.36%`，三维均 ≥80%，且与 snapshot `integration_checks` 声明逐位一致。

## 三、Acceptance Profile 与三重身份

- 完整矩阵 17/17 与 fixture `expected` 精确一致；Q6 身份一致性 = 17/17 = 100%。
- self-profile-headless 端到端 CLI 双跑：exit 0、`ACCEPTANCE_PROFILE_ACCEPTED`、decision digest 恒为 `sha256:1b31eed0…`（二次回放恒定）。
- 三重身份独立复算全部匹配：
  - Product Definition：`pd-7913f81f…` / `sha256:096428a4…`
  - carrier decision digest：`sha256:2a582889…`（fixture 文件候选与内嵌候选逐字节相等）
  - profile_id：`ap-66c5db77…`（派生 = 声明）
- 已知非阻塞事实：I/X/P r2 verdict 中 self-profile 身份的一次叙述转写误差（`pd-01e7fcb1…/cd10e72a…`），L3 已判定为叙述误差；本验证按 fixture/CV/L3 正确值复算，更正记录见 `docs/qa/index.md` 第 18 条。

## 四、Manifest、边界与审计

- 331/331 条 protected manifest 的 mode/type/oid/path 与 snapshot 树逐条精确匹配；snapshot 共 333 路径 = 331 受保护 + 恰好 2 条 `excluded_mutable_paths`，零意外。
- formal 验证全程保持 F13；F13 为 snapshot 祖先，F13 tree `badae8e7…` = snapshot `parent_formal_tree`；候选 `c2894cd2` 父链 `dd8e6fcc`/tree `e9c22fb6` 精确匹配。
- S1.5 未启动：路线锁与里程碑文档边界原文保持，`src/schemas/tests` 无任何 S1.5 代码。
- JSON 解析 143/144（唯一例外为故意负例 fixture `empty-input.json`，单换行字节）；`git fsck --strict` 干净；`git diff --check` 干净；secret 扫描仅命中扫描器自身模式与测试合成 dummy；`src/` 无 console.log/debugger；`pnpm audit`（registry.npmjs.org）无已知漏洞。

## 五、Verification Credential

- 全部硬门禁通过后，在项目外 evidence root 以 exclusive temp + hard-link no-replace 原子安装 create-once 凭证，文件与父目录 fsync，目录 0700、文件 0600：
  - `verification-credential-c49fb216746a2a51734b2cd171b9c3ea24ce5edf619b3f5f128a8382d4c15e02.json`
  - SHA-256 `c49fb216746a2a51734b2cd171b9c3ea24ce5edf619b3f5f128a8382d4c15e02`（安装后独立复算一致，JCS 幂等复验通过）
  - 7750 字节；绑定 claim/fence/host、ack/control、F13、snapshot/tree/digest、transaction、manifest digest/count、Execution/CV/I-X-P/L3 摘要、测试与风险。

## 六、罚分与遗留

- PEN-1（-1）：S1.4 时代上游 packet dedup 派生集未冻结文档化，以跨位置一致性替代派生复算（透明度风险，方向安全）。
- PEN-2（-1）：`IDENTITY_CONFLICT` 与路线冲突共用 `PROFILE_CONFLICT_REJECTED` 回执码（L3 已记录的继承项，方向安全）。
- 未完成项：Audit Anchor、Anchor Verification、Anchor Proof 与 expected-old=F13 的 F13→F14 CAS；S1.4/M1.2/V1/P5 均未完成，S1.5 不得启动。
- 证据范围声明：manual-isolated headless consumer contract；不证明 trusted-host 适配器、真实用户动作探针或 full 支持。
