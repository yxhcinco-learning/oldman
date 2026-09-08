> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/PRODUCT.md 与 active-client-scope 规范。

# local-writing Specification

## Purpose
定义小程序本地优先写作的真实编辑、用户文件自动保存与恢复、作品生命周期，以及可校验、可救援的便携备份行为。
## Requirements
### Requirement: Real writing with recovery
系统 SHALL 支持标题、正文、单段编辑、输入模式切换；自动保存作品及待确认转写、未完成编辑，且仅在写入成功后显示已保存。

#### Scenario: Reopen after saved
- **WHEN** 编辑保存后刷新或重新打开
- **THEN** 内容与未完成编辑恢复且示例不混入作品库

#### Scenario: Rapid edits or failed write
- **WHEN** 连续编辑、存储失败或并发 revision 冲突
- **THEN** 不用旧内容覆盖新内容，失败时保留内存副本、报告问题并可导出

#### Scenario: Input during manual save
- **WHEN** 用户点击保存后在写入完成前继续输入
- **THEN** 等待包含最新输入的写入再退出编辑器，不丢弃新修订

### Requirement: Work lifecycle
系统 SHALL 支持新建、继续编辑、手动保存、软删除与恢复，显示真实字数与修改时间，无标题作品使用未命名作品。

#### Scenario: Delete and restore
- **WHEN** 用户将作品移入回收站再恢复
- **THEN** 作品及其内容不丢失并回到正常列表

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
- **THEN** JSON 包含工作快照，TXT 另外标出未完成内容供人工保留

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

### Requirement: Compatible topic and material backup
版本化 JSON 备份 SHALL 包含作品关联的议题快照、来源元数据和采访素材，并继续安全处理没有这些字段的旧备份；导入 MUST 完整校验关联和大小后作为新副本创建。

#### Scenario: Export and restore a topic-linked work
- **WHEN** 用户导出包含议题背景和采访素材的新版备份并重新导入
- **THEN** 系统为作品、素材和引用分配一致的新关联，保留来源与正文分离，不覆盖现有作品

#### Scenario: Import legacy or invalid data
- **WHEN** 用户导入旧版备份，或新版备份包含损坏来源、超限素材、不匹配引用或未知结构
- **THEN** 旧版按普通作品恢复；无效新版整批拒绝且已有数据库保持，不删库、不部分导入

### Requirement: Client-specific local persistence with one saving meaning
以下仅本地说明 SHALL 适用于历史游客数据与已登录账号的未入云作品。第二阶段账号云作品必须保留独立的本机与云保存结果，正常页面不常驻同步标签，详情和异常按需展示，编辑前取最新，离线保存当前输入后暂停；本机新草稿仍可写。

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

#### Scenario: Cloud work offline
- **WHEN** 正在编辑已入云作品时断网
- **THEN** 保住已有输入、暂停修改，恢复网络后先核对最新版本

#### Scenario: Return to an unsaved blank draft
- **WHEN** 新建草稿尚无可保存内容、没有本机修订及云版本，页面从后台返回
- **THEN** 保留当前草稿标识、输入方式及编辑现场，不按已保存作品读取，不生成空文件或删除/归属错误；新增输入先保存，已落盘后仍走正常版本核对

#### Scenario: Reopen a saved empty article
- **WHEN** 已保存的当前或兼容旧格式作品正文为空
- **THEN** 按作品标识正常读取，不以正文是否为空判定存在性；真实缺失、回收或删除的已有作品不能降级为新稿重新创建

### Requirement: Portable backup is the only cross-client transfer
以下手工备份是跨 AppID/账号和历史 H5 的唯一迁移方式；同账号同 AppID 的小程序设备 SHALL 使用私有云同步续写，不将备份副本或本机 revision 当同步协议。

小程序 SHALL 使用兼容的版本化 JSON 业务备份作为显式跨设备、微信用户或 AppID 的迁移方式，并接受旧 H5 备份；导入 MUST 校验后创建新副本，不得迁移业务 token、OpenID 或覆盖目标客户端作品。

#### Scenario: Transfer between web and mini program
- **WHEN** 用户手持小程序或旧 H5 的 JSON 备份并在小程序手工导入
- **THEN** 作品、未完成输入、话题/采访材料、文章会话和版本按 schema 恢复为新副本，身份与本地存储位置按目标客户端重新建立

#### Scenario: Change the mini-program AppID
- **WHEN** 临时开发 AppID 被正式 AppID 替换
- **THEN** 新 AppID 从隔离的空本地空间开始；只有用户明确选择的有效备份可以迁移业务内容，系统不尝试读取或合并旧 AppID 文件

#### Scenario: Same-account continuation
- **WHEN** 用户在另一小程序设备登录相同账号
- **THEN** 先取最新完整作品再编辑，不要求用户手工导入

### Requirement: Online identity does not own local articles
以下身份不关联文章规则仅适用尚未启用账号的旧最小身份与游客。第二阶段 SHALL 将主动登录后认领的作品绑定服务端确认账号，退出或换账号隐藏旧缓存、保留旧账号恢复稿，不再次认领给其他账号。

微信内部用户与业务会话 SHALL 只控制在线接口访问，不得成为本地文章的所有权键、加密恢复键或删除触发器；登录更新、token 失效和服务端身份库回滚 MUST NOT 修改客户端作品。

#### Scenario: Refresh or revoke a session
- **WHEN** 小程序 token 过期、被撤销或重新无感登录
- **THEN** 本地文章、回收站、备份和活动草稿保持原样，在线能力在新会话成功后恢复

#### Scenario: Identity database is restored from backup
- **WHEN** 运维回滚或恢复服务端最小身份数据库
- **THEN** 客户端可能需要重新登录，但不上传、重写或清除任何网页 IndexedDB 或小程序用户文件

#### Scenario: Account isolation
- **WHEN** 用户退出已登录账号
- **THEN** 停止同步并隐藏其作品，回到必须登录的入口，原账号未上传内容保持原归属

### Requirement: Backups exclude unwritten new context
JSON备份 SHALL 使用与作品保存一致的内容边界，未开始写作的新话题、模式及系统开场 MUST NOT 被导出为文章；真实输入、会话记录和原有作品 MUST 完整保留，包括用户明确清空后的最新编辑。

#### Scenario: Export before saying anything
- **WHEN** 当前新草稿只有话题或访谈开场，没有真实输入或请求记录
- **THEN** 导出的作品及会话列表不新增该草稿，导入该备份也不会产生空文章

#### Scenario: Export actual or previously saved content
- **WHEN** 当前草稿含真实输入、未发送文字或会话记录，或本来就是已保存的文章
- **THEN** 备份包含相应最新草稿与历史会话；已有文章被清空时导出清空后的内容，不恢复旧正文

#### Scenario: Rescue current content after a storage error
- **WHEN** 用户导出当前内容且已有作品元数据读取失败
- **THEN** 可从传入内存草稿、会话及未发送输入完成救援，不因元数据读取失败阻断救援；可读取已有作品身份时，仍保留该作品的最新清空状态
