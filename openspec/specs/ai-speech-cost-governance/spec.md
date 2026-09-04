# ai-speech-cost-governance Specification

## Purpose
TBD - created by archiving change govern-ai-speech-costs. Update Purpose after archive.
## Requirements
### Requirement: Persistent anonymous daily usage ledger
系统 SHALL 在独立 SQLite 中按 `Asia/Shanghai` 自然日持久化文章 AI、话题 AI 的输入/输出 token 总量和腾讯实时语音秒数；账本 MUST 使用事务、WAL、严格表、完整性检查与 schema 上限，并且 MUST NOT 保存请求时间线、用户/IP/作品/话题标识、正文、提示词、链接、转写或音频。

#### Scenario: Start and restart within one day
- **WHEN** 网关当天完成付费调用后重启
- **THEN** 当日已消费量仍存在且继续参与预算判断，进程监控可以清零但付费额度不得恢复

#### Scenario: Encounter an unusable ledger
- **WHEN** 用量库路径、schema、完整性、迁移或写事务不可用
- **THEN** 三类付费调用在访问上游前以固定 503 失败关闭，本地写作、备份、已发布话题读取和后台非 AI 操作继续可用

### Requirement: Atomic reservation and conservative settlement
系统 MUST 在每次外部付费调用前按服务原子比较当日消费、活动预留与上限并写入预留；调用完成 SHALL 按可用的实际 token 或会话秒数结算，无法证明未发生计费的失败、取消、超时和崩溃 MUST 按预留全额结算，不得通过并发或重启绕过上限。

#### Scenario: Reserve concurrent requests
- **WHEN** 两个请求并发争用只够其中一个最坏上界的剩余额度
- **THEN** 只有事务中先成功预留的请求可访问上游，另一个以固定 429 拒绝且不产生付费调用

#### Scenario: Settle a successful call
- **WHEN** 上游返回有效的实际用量
- **THEN** 系统原子删除活动预留、累计实际用量并释放未使用部分，后台快照反映新余额

#### Scenario: Recover an interrupted reservation
- **WHEN** 网关在外部调用后、结算前崩溃并重新启动
- **THEN** 遗留预留按全额计入原日期再被清除，不重新获得这部分当日额度且不保留请求明细

### Requirement: Configurable limits and explicitly approximate costs
服务端 SHALL 分别接受文章 AI 每日 token、话题 AI 每日 token 和实时语音每日秒数上限，零值 MUST 可作为显式停用；可选人民币单价只用于匿名汇总估算，页面 MUST 标明估算不等于供应商账单，缺少单价不得关闭用量硬上限。

#### Scenario: Reach a configured daily limit
- **WHEN** 某服务的已消费与活动预留达到其当日上限
- **THEN** 新调用在外部连接前以 `daily_budget_exhausted` 拒绝，其他服务按各自独立余额继续工作

#### Scenario: Cross Shanghai midnight
- **WHEN** 服务端时间进入下一个 `Asia/Shanghai` 自然日
- **THEN** 新请求使用新日额度，历史汇总保持只读且重置时间显示为下一次上海零点

#### Scenario: Omit estimated prices
- **WHEN** 运维配置了用量上限但没有配置一个或多个估算单价
- **THEN** 预算守卫正常执行，后台显示对应单位用量和“未配置估算”，不得猜测费用

### Requirement: Provider-specific conservative bounds
文章 AI SHALL 依据最终请求字节和最大输出预留；关闭联网的话题 AI SHALL 依据请求字节和最大输出预留，开启联网的话题 AI MUST 按模型上下文上限和最大输出预留；实时语音 SHALL 从剩余秒数授予不超过五分钟的会话上限并按该值强制结束。

#### Scenario: Generate a searched topic candidate
- **WHEN** 编辑发起允许 `web_search` 的话题生成
- **THEN** 系统在顶层 Responses 请求前预留完整受支持上下文与 6000 最大输出，完成后按返回 usage 结算且不因供应商忽略 `max_tool_calls` 形成无保护调用

#### Scenario: Start speech near the daily limit
- **WHEN** 当日语音只剩少于 300 秒但仍大于零
- **THEN** 网关只预留并允许剩余秒数，到达该时长即发送限制事件并结束会话；余额为零时不创建腾讯连接

