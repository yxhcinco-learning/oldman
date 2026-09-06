## MODIFIED Requirements

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

