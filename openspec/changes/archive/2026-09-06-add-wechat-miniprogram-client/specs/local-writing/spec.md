> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

## ADDED Requirements

### Requirement: Client-specific local persistence with one saving meaning
系统 SHALL 在网页端继续使用当前 Origin 的 IndexedDB，在微信小程序端使用当前微信用户、当前 AppID 和当前设备的本地用户文件；两个客户端只有各自持久写入成功后才能显示“已保存”，且 MUST NOT 将该状态描述为云备份、永久保存或跨设备同步。

#### Scenario: Save in the web client
- **WHEN** 用户在网页端完成一次作品写入
- **THEN** 内容只进入该浏览器 Origin 的 IndexedDB，现有 revision、恢复和冲突语义保持，不因小程序身份服务而上传

#### Scenario: Save in the mini-program client
- **WHEN** 用户在小程序完成一次作品聚合写入
- **THEN** 内容只进入该微信用户和 AppID 隔离的用户文件，服务端身份库不接收正文、素材、会话或备份

#### Scenario: Local persistence is unavailable
- **WHEN** 任一客户端的本地持久化失败或可用数据被系统清理
- **THEN** 系统显示真实未保存/不可恢复状态并保留可用内存内容与救援导出，不声称可从微信身份或服务器找回作品

### Requirement: Portable backup is the only cross-client transfer
网页和小程序 SHALL 使用兼容的版本化 JSON 业务备份作为显式跨 Origin、设备、微信用户或 AppID 的迁移方式；导入 MUST 校验后创建新副本，不得迁移业务 token、OpenID 或覆盖目标客户端作品。

#### Scenario: Transfer between web and mini program
- **WHEN** 用户从一个受支持客户端导出 JSON 并在另一个客户端手工导入
- **THEN** 作品、未完成输入、话题/采访材料、文章会话和版本按 schema 恢复为新副本，身份与本地存储位置按目标客户端重新建立

#### Scenario: Change the mini-program AppID
- **WHEN** 临时开发 AppID 被正式 AppID 替换
- **THEN** 新 AppID 从隔离的空本地空间开始；只有用户明确选择的有效备份可以迁移业务内容，系统不尝试读取或合并旧 AppID 文件

### Requirement: Online identity does not own local articles
微信内部用户与业务会话 SHALL 只控制在线接口访问，不得成为本地文章的所有权键、加密恢复键或删除触发器；登录更新、token 失效和服务端身份库回滚 MUST NOT 修改客户端作品。

#### Scenario: Refresh or revoke a session
- **WHEN** 小程序 token 过期、被撤销或重新无感登录
- **THEN** 本地文章、回收站、备份和活动草稿保持原样，在线能力在新会话成功后恢复

#### Scenario: Identity database is restored from backup
- **WHEN** 运维回滚或恢复服务端最小身份数据库
- **THEN** 客户端可能需要重新登录，但不上传、重写或清除任何网页 IndexedDB 或小程序用户文件
