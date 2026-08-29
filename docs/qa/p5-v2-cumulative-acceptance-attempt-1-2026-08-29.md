# P5 / V2 Cumulative Acceptance Attempt 1 与用户会签候选

## 1. 当前结论

V2-I-X-P-Profile attempt 1 累计验收本体与独立 L3 均为 **`PASS / 100`**。I/X/P/Profile=`25/25/25/25`，P0/P1/P2=`0/0/0`，`required_fixes=[]`。

本报告是用户会签候选，不是用户会签本身。当前 V2、alpha、P5 均未正式完成；只有本报告通过新的独立会签包评审、主控创建绑定精确 Result 的 signoff-request control CAS、用户明确批准，并由主控分开完成 user-signoff ACK CAS 与 V2 completion CAS，V2 才能标记为正式完成。

## 2. 验收对象与身份

- formal baseline：F16 `ea04b57de83d6c548dcb1629b1f61832db8375ad`
- historical subject：`43df63566b4edd8496f3ad1e62533b980767abd8`
- subject tree：`09057e7fce389b946bccef8b745875df46f1a984`
- subject parent：`a8ba3dae236f3978fd4e97c4ce0062cf81a25b9d`
- subject digest：`sha256:5f6e3b0bbcee3fa7cd1b291b754cffaeb17e22fc09d506758701151464b59d0b`
- independent L3 commit：`68888402063b36c75c73e8fe937984781b307d71`
- independent L3 tree：`4ac57b0e5b134701d18ab3d5ece2fbd21fd0470e`
- Result control：`82e20134381a8a21891babaca6484f54de236974`
- Result：`control:results/result-version-acceptance-v2-g5-a1-f157-20260829.json`
- Result digest：`sha256:f82ce4edd94b587f7f076eb6b52cfffbb2acb0b9b6dd2690a3d1aa4940543ad2`
- packet digest：`sha256:e1b6d1cc7b401fc92e46b774b07faa17a8504a67b91cc6fd77198b1ead8cf62c`
- claim/fence：`claim-v2-ixp-profile-g5-a1-f157-20260829` / `157`
- dispatch ACK control：`9e3c63f04d5ea6a3f8a67086b2fd2e7e312194cc`
- plan generation：`5`

## 3. 可重复验证结果

唯一 `git clone --no-local`、移除 origin、无 alternates、非 shallow 的隔离副本固定到精确 historical subject；主控完成一次 offline frozen install 后，同一独立 reviewer 在 dispatch ACK 与 create-once evidence ref 已固化的边界内执行：

- build：唯一一次，exit 0
- targeted：唯一一次，52/52，fail/skipped/cancelled/todo 均为 0
- full regression：唯一一次，555/555，fail/skipped/cancelled/todo 均为 0
- Node native displayed coverage Lines/Branches/Functions：94.45% / 89.76% / 99.57%
- 同次 raw coverage：Lines `8366/8858=94.44569880334161%`；Branches `3008/3351=89.76424947776783%`；Functions `697/700=99.57142857142857%`
- 累计门槛：94.40% / 89.75% / 99.57%，全部通过
- Q4 版本归属：20/20，duplicates=0，missing=0，backlog=0
- Q5 里程碑/任务图：18/18，owners=9/9，dependency edges=17/17，cycles=0
- Q6 Profile：headless/ui-with-evidence/route-conflict=`3/3=100%`
- `git diff --check`：通过

验收闭合范围为 M2.1/M2.2、S2.1..S2.4、PC-09..PC-13、TG-02/03/04/06/07/13/16/19。三份 exact-three review artifact 的 raw/JCS 摘要均已由主控复算并固化进不可变 Result。

## 4. 产品结论

- PC-09..PC-13 已在统一 historical subject 上形成新的累计 I/X/P/Profile 证据，不能用 M2.1/M2.2 的分段 PASS 拼接替代。
- S2.1..S2.4 的版本链唯一归属、小里程碑、任务图、验收模板和三类 Profile fixture 连续性均满足当前 V2 计划门槛。
- 重复、遗漏、Backlog 偷渡、依赖环、Result 完整性错配和 route-conflict 等失败路径保持 fail closed。
- 独立 reviewer 的 `PASS / 100` 才是本次验收结论；历史里程碑 Result 只作入口证据，执行者自检不具批准效力。

## 5. 限制与承接边界

- 本 PASS 证明 fixture/headless/manual-isolated V2 契约，不证明 qualified real-project runs、公开发布、trusted full host 或普通用户端到端使用。
- `v0.2.0-alpha` 的打包、安装、CLI 聚合入口、quickstart、tag 与 release 都是会签后的独立工作，当前尚未完成。
- CR-006 保持 open，qualified real runs 保持 0/3；本会签不会把模拟或自测仓库冒充真实项目价值验证。
- V3、V4、Final Acceptance 与 P5 均未完成；formal 保持 F16，不随 V2 会签移动。
- 本 PASS 不表示用户已经会签；会签过程不得重建 Result、改写历史 evidence 或压缩 request、ACK、completion 三个控制边界。

## 6. 建议会签原文

> 我确认 V2 attempt 1 的精确 Result `sha256:f82ce4edd94b587f7f076eb6b52cfffbb2acb0b9b6dd2690a3d1aa4940543ad2` 与 Result control `82e20134381a8a21891babaca6484f54de236974`，接受 PC-09..PC-13、M2.1-M2.2、S2.1-S2.4 的 I/X/P/Profile 累计验收结论，并接受报告列明的 carry-forward 边界；授权主控在重新核对 formal、control、Result、subject、review 与 `plan_generation=5` 后执行 user-signoff ACK control CAS，并在另一独立 control CAS 将 V2 标记为 formally-completed。本会签不移动 formal，不自动创建 `v0.2.0-alpha` 包或 tag，不关闭 CR-006，也不代表 V3、V4、Final Acceptance 或 P5 完成。

## 7. 会签后的精确状态效果

1. 本报告独立评审通过前：Result 保持 `passed-awaiting-user-signoff`，但尚无 signoff request；V2/alpha/P5 均未完成。
2. 会签包独立评审 PASS 后：主控以 Result control 为 expected-old 创建单独的 signoff-request CAS；只有该 CAS 成功后，V2 才进入 `awaiting-user-signoff`。
3. signoff request 已存在且用户针对本报告绑定的精确 Result/control 给出新语义批准后：主控重新读取 formal、实时 control、Result digest、subject、review 与 `plan_generation=5`，再创建独立 user-signoff ACK CAS。
4. ACK CAS 成功后：主控在独立的下一父链边界创建 V2 completion CAS；只有该 CAS 成功后，V2 才标记为 `formally-completed`。
5. 任一 CAS 冲突均保持对应阶段 pending；不得用旧 expected-old 盲目重试，也不得把用户此前的 broad autonomy 解释为本 Result 的精确会签。
6. V2 completion CAS 成功后只允许进入独立 alpha 计划/packet/实施/验收；本次会签本身不创建 alpha 包、tag、release，不移动 formal，也不关闭 CR-006 或 P5。
