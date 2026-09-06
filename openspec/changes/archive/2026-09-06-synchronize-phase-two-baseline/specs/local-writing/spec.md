## MODIFIED Requirements

### Requirement: Persistent topic-linked writing material
系统 SHALL 在作品中以非破坏方式关联议题快照和采访素材，并 MUST 将其与当前正文、待确认语音和 AI 候选分开保存；旧作品没有议题或素材时 SHALL 继续按普通作品打开。

#### Scenario: Save and reopen a topic-linked work
- **WHEN** 用户从议题开始写作、完成若干采访回答并刷新或重新打开作品
- **THEN** 正文、议题快照、来源修订、采访素材和当前工作模式按各自状态恢复，没有任何素材被重复追加到正文

#### Scenario: Continue offline after topic snapshot exists
- **WHEN** 用户已保存议题快照后断网或议题服务不可用
- **THEN** 系统仍可查看已保存背景、编辑本机正文和采访素材；需要联网的来源刷新或 AI 请求显示不可用，不阻止本机保存

#### Scenario: Persistence fails
- **WHEN** 保存议题快照或采访素材遇到存储失败、修订冲突或空间不足
- **THEN** 系统保留内存内容、报告真实问题并提供重试或救援导出，不显示为已保存、不覆盖较新正文

#### Scenario: Do not keep a content-free topic draft as a work
- **WHEN** 新建的议题关联草稿只有背景快照，尚无标题、正文、待确认语音、用户消息或素材，也没有已保存的访谈模式或会话记录，并且用户离开该草稿
- **THEN** 系统可以保留编辑期间的崩溃恢复记录，但离开时不得把它作为“未命名作品”留在作品列表；已有用户内容或素材仍按普通作品保存

### Requirement: Client-specific local persistence with one saving meaning
系统 SHALL 在微信小程序使用当前微信用户、当前 AppID 和当前设备隔离的本地用户文件，只有持久写入成功才能显示“已保存”；MUST NOT 描述为云备份、永久保存或跨设备同步。退役 H5 的 IndexedDB 只保留数据兼容边界，不是活跃客户端要求。

#### Scenario: Save in the mini-program client
- **WHEN** 用户完成一次作品聚合写入
- **THEN** 内容只进入该微信用户和 AppID 隔离的用户文件，服务端最小身份库不接收正文、素材、会话或备份

#### Scenario: Local persistence is unavailable
- **WHEN** 本地持久化失败或可用数据被系统清理
- **THEN** 显示真实未保存/不可恢复状态并保留可用内存与救援导出，不声称可从微信身份或服务器找回作品

#### Scenario: Encounter old browser data
- **WHEN** 清理工程或切换小程序身份
- **THEN** 不访问、合并或清空旧浏览器作品，已有合法 JSON 备份仍可显式导入副本

### Requirement: Portable backup is the only cross-client transfer
小程序 SHALL 使用兼容的版本化 JSON 业务备份作为显式跨设备、微信用户或 AppID 的迁移方式，并接受旧 H5 备份；导入 MUST 校验后创建新副本，不得迁移业务 token、OpenID 或覆盖目标客户端作品。

#### Scenario: Transfer between web and mini program
- **WHEN** 用户手持小程序或旧 H5 的 JSON 备份并在小程序手工导入
- **THEN** 作品、未完成输入、话题/采访材料、文章会话和版本按 schema 恢复为新副本，身份与本地存储位置按目标客户端重新建立

#### Scenario: Change the mini-program AppID
- **WHEN** 临时开发 AppID 被正式 AppID 替换
- **THEN** 新 AppID 从隔离的空本地空间开始；只有用户明确选择的有效备份可以迁移业务内容，系统不尝试读取或合并旧 AppID 文件
