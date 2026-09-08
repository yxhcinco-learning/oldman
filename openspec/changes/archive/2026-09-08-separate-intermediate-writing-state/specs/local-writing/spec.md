## MODIFIED Requirements

### Requirement: Persistent topic-linked writing material
系统 SHALL 在已建立的文章中以非破坏方式关联议题快照和采访素材，并 MUST 将其与当前正文、输入框和 AI 候选分开；未成稿时仅保留必要本机上下文，不以素材或会话创建文章；旧作品没有议题或素材时 SHALL 继续按普通作品打开。

#### Scenario: Save and reopen a topic-linked work
- **WHEN** 用户从议题开始写作、完成若干采访回答并刷新或重新打开已建立的文章
- **THEN** 正文、议题快照、来源修订、采访素材和当前工作模式按各自状态恢复，没有任何素材被重复追加到正文

#### Scenario: Continue offline after topic snapshot exists
- **WHEN** 用户已保存议题快照后断网或议题服务不可用
- **THEN** 系统仍可查看已保存背景、编辑本机正文和采访素材；需要联网的来源刷新或 AI 请求显示不可用，不阻止本机保存

#### Scenario: Persistence fails
- **WHEN** 保存议题快照或采访素材遇到存储失败、修订冲突或空间不足
- **THEN** 系统保留内存内容、报告真实问题并提供重试或实际文章救援导出，不显示为已保存、不覆盖较新正文

#### Scenario: Do not keep a content-free topic draft as a work
- **WHEN** 新建的议题关联草稿标题正文为空，即使含话题、素材、会话或输入框内容，并且用户离开该草稿
- **THEN** 系统可保留必要本机上下文，但不得把它作为“未命名作品”留在作品列表；标题正文非空后才建立文章，既有作品继续保存

### Requirement: Backups exclude unwritten new context
JSON备份 SHALL 使用与作品保存一致的内容边界，标题正文为空的新上下文 MUST NOT 被导出为文章；待确认语音、段落编辑框、未发送输入和未应用会话不能使其成为备份文章。原有作品及其已发送会话 MUST 保留，包括用户明确清空后的最新正文。当前输入框不写入新导出的文章快照。

#### Scenario: Export before saying anything
- **WHEN** 当前新草稿标题正文为空，即使包含待确认语音、未发送文字、素材、会话或请求结果
- **THEN** 导出的作品及会话列表不新增该草稿，导入该备份也不会产生空文章

#### Scenario: Export actual or previously saved content
- **WHEN** 当前草稿标题或正文非空，或本来就是已保存的文章
- **THEN** 备份包含相应最新文章与已发送会话；已有文章被清空时导出清空后的内容，不恢复旧正文，不导出当前输入框文字

#### Scenario: Rescue current content after a storage error
- **WHEN** 用户导出当前内容且已有作品元数据读取失败
- **THEN** 可从传入内存中的实际标题、正文与已发送会话完成救援，不因元数据读取失败阻断救援；可读取已有作品身份时，仍保留该作品的最新清空状态

### Requirement: Real writing with recovery
系统 SHALL 支持标题、正文、单段编辑、输入模式切换；自动保存实际标题、正文与已确认段落，且仅在文章写入成功后显示已保存。待确认转写、段落编辑框及未发送会话输入仅保留当前编辑内存，不自动写入文章或恢复文件。

#### Scenario: Reopen after saved
- **WHEN** 编辑保存后刷新或重新打开
- **THEN** 已保存标题正文及已发送会话恢复，当前输入框不从新保存的文件恢复，示例不混入作品库

#### Scenario: Rapid edits or failed write
- **WHEN** 连续编辑、存储失败或并发 revision 冲突
- **THEN** 不用旧内容覆盖新内容，失败时保留内存副本、报告问题并可导出

#### Scenario: Input during manual save
- **WHEN** 用户点击保存后在写入完成前继续输入
- **THEN** 等待包含最新输入的写入再退出编辑器，不丢弃新修订

### Requirement: Validated portable backups
系统 SHALL 提供单篇 TXT、复制正文及全量版本化 JSON 备份；导入必须校验并作为新副本添加。

#### Scenario: Valid import
- **WHEN** 导入同一作品的备份
- **THEN** 分配新 ID，不覆盖现有作品

#### Scenario: Invalid import or failed migration
- **WHEN** 备份损坏、未知版本或事务失败
- **THEN** 拒绝操作并保留已有数据，不清空数据库

#### Scenario: Rescue export includes unfinished input
- **WHEN** 存储失败且尚有待确认语音或未完成单段编辑
- **THEN** JSON/TXT导出实际文章内容，当前输入框不创建备份文章；仍在页面中的输入继续可确认或复制，保存失败不清空页面内存
