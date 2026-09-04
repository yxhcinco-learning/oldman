## ADDED Requirements

### Requirement: User-invoked XiaoWen interview mode
文章会话 SHALL 将采访实现为用户主动选择的小文工作模式，而不是独立通用聊天入口或第二个助手。采访中小文 MUST 每轮只提出一个基于当前议题、已确认正文或前序回答的问题，并不得在提问响应中返回或应用候选正文。

#### Scenario: Ask one grounded question
- **WHEN** 用户进入采访模式且存在可用议题背景或前序素材
- **THEN** 小文用简短承接提出一个具体、容易回答的问题，不编造用户职业、经历、态度或事件事实，不同时提出问题清单

#### Scenario: Introduce XiaoWen before the first answer
- **WHEN** 用户首次打开一个没有采访回答和采访轮次的话题采访
- **THEN** 界面用简短静态消息说明“小文”是写作助手、会围绕话题一次问一个问题，并先请用户简单介绍自己；这一步不发送文章、素材或 AI 请求

#### Scenario: Skip, pause or leave interview
- **WHEN** 用户选择换个问题、暂停采访或返回正常写作
- **THEN** “换个问题”只替换当前问题；关闭小文即暂停并回到文章，已有回答、正文和背景保留，不自动继续提问、不自动成文，重开后恢复采访

#### Scenario: Keep one primary interview action
- **WHEN** 用户查看当前问题和采访输入区
- **THEN** 输入区只提供文字、点按语音和单一“发送”；不常驻“保存回答”“继续问我”“先暂停”“回到文章”或素材勾选表单，存在回答时可另提供一个次级“整理成文章”动作

#### Scenario: Reject an unexpected interview candidate
- **WHEN** 上游在采访提问响应中意外返回完整正文或其他可应用内容
- **THEN** 控制器丢弃候选部分，只保存合规问题或把结果标记失败，不创建待应用状态

### Requirement: Explicit composition from interview material
小文 SHALL 只在用户明确请求后使用被允许的采访素材、当前正文和议题快照生成完整文章候选；候选 MUST 继续遵守当前预览、事实核对、基准检查、应用、放弃和版本追溯规则。

#### Scenario: Compose from selected material
- **WHEN** 用户确认参与本次成文的采访回答并点击整理成文章
- **THEN** 系统生成一份独立候选及材料说明，区分来源事实、用户观点和连接性表达，确认前正文保持不变

#### Scenario: Material is insufficient or contradictory
- **WHEN** 采访素材缺少关键事实或不同回答明显冲突
- **THEN** 小文提出一个澄清问题或提示用户核对，不自行补写确定事实、不把冲突候选自动应用

#### Scenario: Cancel or fail composition
- **WHEN** 用户取消请求，或请求断网、超时、配置/额度失败、输出无效
- **THEN** 系统不自动重试计费请求，已保存素材和原文保持，会话显示真实失败及显式重试入口
