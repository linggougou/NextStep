# P5 / V1 Cumulative Acceptance Attempt 5 与用户会签候选

## 1. 当前结论

V1-I-X-P-Profile attempt 5 累计验收本体与独立 L3 均为 **`PASS / 100`**。12/12 hard gates 通过，P0/P1/P2=`0/0/3`，`required_fixes=[]`。

本报告是用户会签候选，不是用户会签本身。当前 V1、P5 均未正式完成；只有本报告通过独立会签包终审、主控创建绑定精确 Result 的 signoff request、用户明确批准，并由主控分开完成 user-signoff ACK CAS 与 V1 completion CAS，V1 才能标记为正式完成。

## 2. 验收对象与身份

- formal subject：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- subject tree：`5b97a4432fbedb3dda189e05052c2e7665a1bea8`
- subject parent：`5d3ee76a514bda3da38adc8cccbe5ef4550bf30f`
- subject digest：`sha256:3e75ad6dffe9a2f5479f0e2c48bea6e45f04593b4e75ac14d48e1e4cbb891672`
- candidate commit：`3f0b394fc610b7e9259e1f593fc86468588aac49`
- independent L3 commit：`a7d9471b370165d822cfd698765f317503ec4681`
- Result control：`07fb99f61202972a0d04ec30afab2bc883a8c42d`
- Result：`control:results/result-version-acceptance-v1-g4-a5-f117-20260824.json`
- Result digest：`sha256:fd5e6c09a20ad35c25261bf0b0ace81da14767576ebb84361701cb01594c881b`
- control fence：`117`
- plan generation：`4`

## 3. 可重复验证结果

唯一 `git clone --no-local` 隔离副本固定到精确 F16，并在 object-only ACK import、完整 refs/FETCH_HEAD 不变与 clone-local formal/control 镜像通过后，使用 Node `v24.14.0`、pnpm `10.33.2` 执行：

- offline frozen install：唯一一次，exit 0，downloaded=0
- 全量 `pnpm check`：唯一一次，474/474，fail/skipped/cancelled/todo 均为 0
- 覆盖率 Lines/Branches/Functions：93.44% / 88.92% / 99.15%
- coverage parser：识别 Node 24 字面量 `all files`
- cumulative runner：唯一一次，exit 0，stdout=665356 bytes，stderr=0
- 固定十二 section 行数：`18/15/3/18/17/20/13/15/5/32/5/17`
- source refs：17/17
- PC closure：PC-01..08，8/8
- TG closure：TG-01/02/03/04/05/06/08/09/10/11/12/13/14/15/16/17/18/19，18/18

四类 fresh artifact（install log、check log、runner source、runner output）的解码长度、SHA-256、Git blob OID、RFC8785/JCS 与敏感扫描均由主控和独立 L3 机械复算匹配。

## 4. 产品结论

- S1.1..S1.6 的三类目标项目连续性、Q1/Q2/Q3/Q6/Q11、write consistency、rollback、architecture negatives 与 fail-closed union 均有稳定行级证据。
- PC-01..08 的结构化 evidence refs 均 join 到真实 section rows，不存在旧 attempt 的 S1.7/S1.8 悬空引用。
- Q11 的 20 行风险探针与顶层精确 18 项 TG evidence 全部闭合。
- runner output 是非空 canonical RFC8785/JCS，sections 与验收报告机械相等；执行者自检不具批准效力，正式结论来自独立 L3。

## 5. 限制与承接风险

- `P2-MANUAL-ISOLATED-NOT-FULL`：manual-isolated/headless 证据不证明 trusted-host/full 或真实用户动作。
- `P2-CONTROL-PARENT-CHAIN-CAUSALITY`：dispatch/ACK 因果以 control Git 父链证明，不以文件时间或对话顺序证明。
- `P2-TRUSTED-HOST-REGISTRY-LIFETIME`：长生命周期 trusted-host session registry 的容量与寿命尚未证明。
- 本 PASS 不表示用户已经会签，也不表示 V1 或 P5 已完成。
- 会签过程不得重建 Result、改写历史 evidence、移动 formal 或绕过独立 V2 entry evaluation。

## 6. 建议会签原文

> 我确认 V1-I-X-P-Profile attempt 5 的精确 Result `sha256:fd5e6c09a20ad35c25261bf0b0ace81da14767576ebb84361701cb01594c881b` 与 control `07fb99f61202972a0d04ec30afab2bc883a8c42d`，接受报告列明的三项 P2 carry-forward 风险；授权主控在重新核对 formal/control/Result/plan_generation 后执行 user-signoff ACK control CAS，并在独立的下一 control CAS 将 V1 标记为 formally-completed。该会签不授权跳过 V2 入口独立评估，也不代表 P5 完成。

## 7. 会签后的精确状态效果

1. 本报告终审通过前：registry 保持 `gate-passed-awaiting-signoff-package-review`，`signoff_status=not-requested`；P5 保持未完成，V2 保持未授权。
2. 会签包终审 PASS 后：主控先以 Result control 为 expected-old，创建独立 signoff-request CAS；只有该 CAS 成功后，V1 才进入 `awaiting-user-signoff`。
3. signoff request 已存在且用户针对本报告绑定的精确 Result/control 给出新语义批准后：主控重新读取 formal、实时 control、Result digest 与 `plan_generation=4`，并以实时 expected-old 创建独立 user-signoff ACK CAS。
4. ACK CAS 成功后：主控在独立下一父链边界创建 V1 completion CAS；只有该 CAS 成功后，V1 才标记为 `formally-completed`。
5. 任一 CAS 冲突均保持对应阶段 pending，不标记完成、不使用旧 expected-old 盲目重试。
6. V1 completion CAS 成功后只允许独立评估 V2 entry；本次会签不直接生成 V2 packet、dispatch、代码或完成结论，也不表示 P5 完成。
