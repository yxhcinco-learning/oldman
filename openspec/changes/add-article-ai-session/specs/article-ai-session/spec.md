## ADDED Requirements

### Requirement: Article scoped persistent context
系统 SHALL 为每篇作品保存独立会话、操作状态和不可变正文版本；手动编辑和 AI 操作共享同一上下文，未采用建议 MUST 与实际正文区分。

#### Scenario: Edit then optimize and ask
- **WHEN** 用户手写、常规优化并应用、手改、润色并追问
- **THEN** 当前正文、相关历史和真实采纳状态共同输入 AI，其他作品不混入；刷新仍可查看会话与版本

#### Scenario: Interrupted and missing history
- **WHEN** 请求中刷新，或查询接入前丢失/本次未提供的历史
- **THEN** 中断请求不自动重发；无证据内容不得声称已找到，完整已保存版本可本机查看

### Requirement: Two constrained full article optimizations
系统 SHALL 提供常规优化和润色文笔；前者处理通顺、分段、错别字与标点，后者改善用词、描写和节奏；二者 MUST 保留事实、原意和文体，不新增事实，不自动改标题。

#### Scenario: Generate a candidate
- **WHEN** 用户对已确认的非空正文选择任一优化
- **THEN** 使用当前全文生成完整候选和修改说明；当前正文不立即改变，用户可查看原文并决定应用或放弃

#### Scenario: Invalid or incomplete result
- **WHEN** 上游失败、输出被截断、结果为空或格式无效
- **THEN** 提供明确错误和显式重试入口，原文不变，不回退模拟文本

### Requirement: Safe application and restoration
应用和恢复 SHALL 检查当前作品和正文基准并通过本机事务保存；旧响应、过期候选和多标签冲突 MUST 不覆盖较新的内容。

#### Scenario: Apply and undo
- **WHEN** 用户确认应用有效候选并随后撤销
- **THEN** 正文与会话采纳记录同时保存，原版本仍存在；撤销创建恢复版本而非删除历史

#### Scenario: Edit while a candidate exists
- **WHEN** 候选生成后正文又被手改或在另一页保存
- **THEN** 旧候选不可直接应用；后续手改不得被撤销功能静默清除

#### Scenario: Storage fails
- **WHEN** 应用或保存会话时 IndexedDB 写入失败
- **THEN** 不声称成功；保留原存储、候选和内存补救备份，重试与导出可达

### Requirement: Read only textual follow up
文字追问 SHALL 支持关于文章和修改历史的问题，回答能引用所提供版本；问题本身 MUST 不触发自由改文或自动恢复。

#### Scenario: Locate removed material
- **WHEN** 用户询问某段去了哪里
- **THEN** 根据实际提供的版本说明可观察的变更并允许查看原文；可复制或确认恢复历史版本，不杜撰修改原因

### Requirement: Server side privacy and bounded usage
Key SHALL 仅由服务端读取；首次发送前说明数据去向；请求 MUST 受来源、体积、时限、并发和用量频率限制，不记录凭据或用户内容。

#### Scenario: Consent and pending input
- **WHEN** 未同意数据发送、正文为空/超长，或有待确认语音/段落
- **THEN** 不发送付费请求，提示用户处理后再试

#### Scenario: Cancel and configuration failure
- **WHEN** 用户取消/关闭请求，或配置无效、网络超时、额度不足
- **THEN** 尽力终止上游并显示真实状态，迟到回复不应用；语音与本机编辑仍可使用

### Requirement: Compatible local backup and migration
数据库 SHALL 以非破坏升级增加会话存储；JSON v2 SHALL 包含版本与会话并继续接受 v1，导入 MUST 先完整校验再创建关联独立的新副本。

#### Scenario: Upgrade and restore
- **WHEN** 打开 v1 数据库或导入 v1/v2 备份
- **THEN** 已有正文与草稿保持；v2 的会话、版本和引用随新副本正确映射，回收站恢复保留历史

#### Scenario: Invalid associations or future schema
- **WHEN** 备份包含不匹配的作品/版本引用、损坏内容或未知版本
- **THEN** 整批拒绝而不部分导入，不删库修复
