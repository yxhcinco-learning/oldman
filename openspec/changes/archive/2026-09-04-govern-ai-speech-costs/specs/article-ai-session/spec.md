## ADDED Requirements

### Requirement: Daily article AI budget guard
文章 AI SHALL 在每次 DeepSeek Chat Completions 请求前从持久化守卫预留本次输入与最大输出上界；额度不足或账本不可用 MUST 在调用 DeepSeek 前拒绝，并保持当前正文、会话输入、候选和本机历史不变。

#### Scenario: Article budget is exhausted
- **WHEN** 用户发送有效文章请求但当日文章 AI 剩余额度不足以覆盖本次保守预留
- **THEN** 会话显示今日 AI 额度已用完、明日可再试的可恢复提示，服务端记录固定 `daily_budget_exhausted` 且不访问 DeepSeek

#### Scenario: Article call finishes or may have been billed
- **WHEN** DeepSeek 成功返回 usage，或请求在可能到达上游后失败、取消、超时且没有可靠 usage
- **THEN** 成功按实际输入/输出结算，未知用量按预留全额结算；系统不自动重试，正文只在既有确认流程后改变

