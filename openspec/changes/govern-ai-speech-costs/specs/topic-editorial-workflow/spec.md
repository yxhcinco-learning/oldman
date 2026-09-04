## ADDED Requirements

### Requirement: Daily topic generation budget guard
后台话题生成 SHALL 在顶层 DeepSeek Responses 请求前使用独立话题 AI 日预算；联网生成 MUST 保守覆盖服务端搜索可能扩展的模型上下文。额度拒绝 MUST 保留编辑引子、写入固定失败类别且不得创建候选、自动重试或影响手工草稿。

#### Scenario: Topic generation budget is unavailable
- **WHEN** 编辑提交有效引子但话题 AI 当日余额不足或用量账本不可用
- **THEN** 系统在访问 DeepSeek 前返回 429 或 503，生成记录标记 `daily_budget_exhausted` 或 `cost_governance_unavailable`，表单输入仍在且手工新建可用

#### Scenario: Settle topic response usage
- **WHEN** Responses 请求返回成功候选和 usage
- **THEN** 系统按实际输入/输出结算并释放未使用预留，既有生成记录继续保存 token 与搜索调用数但用量账本不保存引子、链接或候选内容

