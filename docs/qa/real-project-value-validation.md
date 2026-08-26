# 真实项目价值验证协议

## 1. 状态与边界

本协议只定义离线记录、资格判定和聚合方式。当前包级状态文案固定为：**真实项目价值验证框架可用，真实运行 0/3**。仓库 fixture、NextStep 自测、派生项目和 AI 样例均不得计入真实运行；达到 3/3 也不等于 PC-19、V2、V4 或 P5 完成。

CLI 只读取 canonical JSON stdin，不采集、补写、联网、接入遥测或修改项目。输入信封为 `{schema_version:"1.0",runs:[...]}`；成功 stdout 是唯一 aggregate JCS，失败 stderr 是唯一稳定错误码行。

## 2. 真实运行资格

一条记录必须同时满足以下条件才合格：

- `run_kind=real`、`collection_mode=prospective`、`project_origin=external-user-project`；
- 项目由用户拥有，或用户在运行开始前明确授权，并把最小授权凭证引用写入 `user_authorization_ref`；
- `project_identity` 是稳定、不可逆、项目级身份；同一项目复制、改名或重复执行仍使用同一 identity；
- `run_id` 在批内唯一，开始/结束时间有效且 `ended_at >= started_at`；
- `used_nextstep=true`，原始证据摘要存在，且 binding 精确匹配；
- 用户确认已发生，`confirmed=true` 且 `confirmation_ref` 指向最小确认凭证。

`evidence_binding_digest` 的唯一公式是：

```text
sha256(JCS({run_id,project_identity,evidence_digest}))
```

批内相同 `project_identity` 的全部记录都排除。合法但不合格记录只保留一个 reason，优先级为：`duplicate-project-identity`、`synthetic`、`retrospective`、`nextstep-self`、`nextstep-derived`、`used-nextstep-false`、`missing-user-authorization`、`missing-user-confirmation`、`evidence-binding-mismatch`。

Schema、时间、数值、敏感输入或重复 `run_id` 属于整批拒绝，不产生 aggregate。CLI 错误码固定为 `INVALID_INPUT`、`NON_CANONICAL_INPUT`、`SENSITIVE_INPUT_REJECTED`、`DUPLICATE_RUN_ID`。

## 3. 五项度量

| 度量 | 起点 | 终点/事件 | 单位 | 缺失语义 |
|---|---|---|---|---|
| `time_to_first_frozen_requirement_seconds` | 本次 prospective run 的 `started_at` | 首份可回放 Frozen Requirement 被形成 | 秒 | 未形成则 `null`，不得按 0 |
| `user_intervention_count` | `started_at` | 用户为纠正、补充或明确选择而采取的可引用动作 | 次 | 必填非负整数；内部 ACK、Agent 自检不计数 |
| `false_block_count` | `started_at` | 经用户或独立裁决确认的误阻塞 | 次 | 未裁决为 `null`；数字值必须至少有一个 `false_block_evidence_refs` |
| `recovery_seconds` | 每次可引用故障导致闭环阻塞的时刻 | 同一 run 恢复到可继续状态的时刻 | 每次事件的秒数组 | 无恢复事件为 `[]`；未发生不补 0 |
| `outcome` | `started_at` | `ended_at` 时的最终状态 | `completed/abandoned/blocked` | 必填，不从缺失数据猜测 |

中位数与 outcomes 只使用 qualified runs。时间首次冻结和误阻塞只聚合非 `null` 值；恢复中位数展平所有 qualified run 的全部恢复事件。没有可用值返回 `null`，不删除离群值，也不把缺失转成 0。没有配对基线时不计算节省百分比。

## 4. 身份、证据与隐私

在获授权的本地流程中，为项目分配高熵随机项目标识，再对包含作用域与该标识的 JCS 投影做 SHA-256，得到 `project_identity`；不得使用项目名、路径或业务内容作为低熵可猜身份。`run_id` 由同一授权流程独立生成。

原始证据只包含用户同意保留的事件时间、度量、裁决/授权/确认引用和对应摘要。先形成不含聊天、源码、密钥或业务正文的最小 evidence manifest，按 RFC 8785/JCS 编码，再对其 UTF-8 字节做 SHA-256，得到 `evidence_digest`。运行记录只保留摘要和最小引用，不嵌入完整 evidence。

授权范围、保留期、可访问者和删除规则必须由未来真实运行单独记录；本仓库 fixture 不提供真实授权。任何完整聊天、源代码、密钥、token、cookie、私钥或未经同意的业务内容都会被拒绝。

## 5. 操作顺序与限制

1. 在运行开始前取得用户拥有权或明确授权，生成稳定 `project_identity` 与唯一 `run_id`。
2. prospective 记录五项度量及最小证据引用；不得事后回填为 prospective。
3. 形成最小 evidence manifest，计算 `evidence_digest` 和固定 binding。
4. 取得用户确认，写入结束时间与 outcome；canonicalize 整个输入信封。
5. 将 JCS 输入传给离线 CLI，保存 aggregate；少于三个独立合格项目时状态保持 `real-runs-insufficient`。

binding 只能发现受支持路径中的 run、project 与 evidence 误配或回填。能任意改写磁盘记录的恶意操作者也能重算全部摘要，因此本协议不提供密码学不可抵赖性，不证明因果提升，也不把 `three-real-runs-observed` 表述为“验证完成”。
