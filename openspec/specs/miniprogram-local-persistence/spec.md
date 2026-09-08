# miniprogram-local-persistence Specification

> 当前范围：小程序是唯一用户端，网页仅运营后台；H5专属描述只作历史兼容，不构成新需求或依赖。平台材料由用户处理，技术归档不代表正式发布审核通过。

## Purpose
定义小程序本地作品聚合、原子写入与修订冲突、失败救援、回收站和版本化备份副本恢复，明确本地保存不等于云同步。
## Requirements
### Requirement: Versioned per-work local aggregates
小程序 MUST 将作品、草稿恢复状态和对应文章会话保存在 `wx.env.USER_DATA_PATH` 下经过 schema 校验的版本化本地文件中，并 SHALL 按作品拆分聚合数据；作品索引只可作为可重建缓存，不得成为正文或版本历史的唯一事实来源。

#### Scenario: Save and reopen a work
- **WHEN** 用户保存包含标题、正文、待确认输入、话题快照、采访素材、版本和小文会话的作品后重新打开小程序
- **THEN** 系统从有效聚合文件完整恢复各类数据且保持来源分层，列表索引与聚合不一致时从聚合重建索引

#### Scenario: Index is missing or damaged
- **WHEN** 索引文件不存在、解析失败或引用不存在的作品
- **THEN** 系统扫描并校验作品聚合，恢复可用列表、隔离损坏文件并报告非破坏性问题，不清空用户目录

### Requirement: Atomic ordered writes and conflict protection
小程序仓储 SHALL 使用单写队列、expected revision、同目录临时文件和校验后替换提交作品；AI 候选应用、恢复和文章会话状态 MUST 在同一作品聚合中提交，过期写入不得覆盖较新内容。

#### Scenario: Rapid edits during an in-flight save
- **WHEN** 前一次文件写入尚未完成而用户继续输入或点击保存退出
- **THEN** 写队列最终提交包含最新输入的 revision 后才完成退出，旧快照不能在新快照之后落盘

#### Scenario: Crash between aggregate and index update
- **WHEN** 聚合文件已经成功替换而索引或活动恢复记录尚未更新时进程退出
- **THEN** 下次启动以有效聚合的 revision 和时间为准重建索引，不用旧 recovery 覆盖新正文

#### Scenario: Revision conflict
- **WHEN** 保存使用的 expected revision 落后于磁盘中的有效作品
- **THEN** 系统拒绝覆盖、保留内存副本并提供重载、另存副本或救援导出，不显示“已保存”

### Requirement: Recoverable storage failures
小程序 MUST 处理空间不足、权限/系统错误、文件损坏和用户文件被系统清理；失败时 SHALL 保留仍在内存中的正文、待确认语音和未发送编辑，显示真实未保存状态并提供有限重试或救援导出。

#### Scenario: Local file write fails
- **WHEN** 创建临时文件、替换文件或更新恢复信息失败
- **THEN** 原有效聚合保持可读，当前内存内容不被旧磁盘数据覆盖，系统不声称已保存且不进入无上限重试

#### Scenario: User files were cleaned
- **WHEN** 启动时发现此前索引存在但作品聚合已被系统清理
- **THEN** 系统说明本地文件不可用、保留仍可读取的有效项目并提供备份导入，不伪造云端恢复或创建空内容覆盖

### Requirement: Local work lifecycle and soft deletion
小程序 SHALL 支持新建、续写、自动保存、软删除、恢复和明确清理回收站；编辑停顿后 MUST 自动保存，点击编辑器返回时 MUST 等待最后一次本地写入而不再次询问是否保存。软删除 MUST 保留完整作品聚合与会话，只有用户明确确认的永久删除才可移除对应本地文件。

#### Scenario: Leave after the latest edit
- **WHEN** 用户修改标题或正文后立即点击编辑器返回
- **THEN** 系统取消尚未触发的防抖等待、完成最新内容的本地写入后直接返回，不显示保存确认框；若写入失败则留在编辑页显示重试和救援导出，不静默丢弃内容

#### Scenario: Delete and restore
- **WHEN** 用户把作品移入回收站后恢复
- **THEN** 标题、正文、素材、会话和版本全部恢复，作品回到正常列表且 revision 单调增加

#### Scenario: Permanently delete selected work
- **WHEN** 用户在回收站明确确认永久删除一篇作品
- **THEN** 系统只删除该作品的已解析绝对用户文件和索引条目，不递归清理用户目录、不影响其他作品，并在失败时保留可恢复状态

### Requirement: Compatible manual backup migration
第二阶段 SHALL 导出 JSON v6 并包含已保存小文输入；以下兼容和副本边界继续适用，新增接受 v5/v6。超过每卷 10MiB 时分卷，在线全部备份先补齐云作品，离线明确只导出本机。

小程序 SHALL 导出与网页端兼容的有版本、大小和 schema 校验的 JSON 备份，并 MUST 将有效导入作为新副本添加；单篇 TXT、复制正文与救援导出 SHALL 保持现有未完成输入和 AI 标识边界。

#### Scenario: Move a web backup into the mini program
- **WHEN** 用户选择受支持的网页端 JSON 备份并导入小程序
- **THEN** 系统完整校验后为作品、段落、素材、会话和版本引用重映射 ID，作为新副本加入且不覆盖本地作品

#### Scenario: Move a temporary-AppID backup into the final AppID
- **WHEN** 用户在临时 AppID 导出备份并在正式 AppID 手工选择导入
- **THEN** 系统只迁移备份中经过校验的业务内容，不迁移 token、OpenID 或隐式设备身份，并明确创建副本

#### Scenario: Import an invalid or oversized backup
- **WHEN** 文件损坏、版本未知、引用不一致、内容超限或写入新副本中途失败
- **THEN** 整次导入拒绝或回滚，现有聚合和索引保持，不留下半篇作品或部分会话

#### Scenario: Version six round trip
- **WHEN** 导出再导入包含未发送输入的备份
- **THEN** 完整恢复为新副本，不包含账号、token 或同步队列

### Requirement: Local-only storage disclosure
以下本地说明仅适用历史游客数据及已登录账号的未入云草稿。第二阶段 SHALL 在内部区分本机已保存、正在同步、已同步、未上传和需重新登录；正常页面不常驻这些标签，主动查看保存详情或出现异常时才提供对应信息；账号归属与云版本单独持久保存，token 不进入作品或备份；仅主动登录后自动上传，退出不改变原账号归属。

小程序 MUST 把“已保存”解释为当前微信用户、当前 AppID、当前设备的本地文件写入成功，不得暗示云备份、永久保存或跨设备同步；身份 token 和服务端用户记录 MUST 与作品文件分离。

#### Scenario: View storage information
- **WHEN** 用户在“我的”、保存状态或首次备份提示查看数据说明
- **THEN** 系统说明换设备、换微信用户、清理小程序或更换 AppID 可能无法读取原数据，并提供手工备份入口

#### Scenario: Establish or replace an online session
- **WHEN** 小程序创建、刷新或清除业务 token
- **THEN** 本地作品目录和聚合文件保持不变，服务端不会因为会话变化收到作品、采访素材或会话正文

#### Scenario: Account saving status
- **WHEN** 云作品本机保存成功但云确认尚未返回
- **THEN** 内部保留待同步状态；用户主动查看保存详情时只能表示本机已保存或正在同步，不能表示对应内容已保存到云端

### Requirement: Unwritten context does not create an article
小程序 MUST NOT 因打开新编辑器、选择话题、开启访谈、静态问候或没有转写的录音而建立文章。只有出现标题、正文、待确认输入、素材、未发送文字、真实会话消息或请求/结果记录时 SHALL 按既有规则保存；已有作品 MUST 继续支持清空编辑，不得借空白判断删除旧稿。

#### Scenario: Leave without author input
- **WHEN** 用户进入正文或访谈、看到开场，但没有输入或录到任何文字便返回、切后台或重开
- **THEN** 文章列表与计数不增加，云同步不收到新作品；跨页所需话题和模式只作为本机临时恢复上下文保留

#### Scenario: Continue across pages before the first input
- **WHEN** 空白新稿开启访谈、关闭回编辑器后再次打开或在前台恢复
- **THEN** 同一草稿ID、话题及模式仍可读取，不因为未建立文章而打不开页面，也不重复增加静态开场

#### Scenario: Persist actual input and existing work
- **WHEN** 用户输入标题、文字、待确认语音、未发送会话文字或实际发送消息，或修改已保存的作品为空
- **THEN** 真实内容及历史记录按既有方式保存；首次输入只建立同一篇文章，旧作品、恢复稿与结果保护继续有效

#### Scenario: Fail to save a temporary context
- **WHEN** 临时上下文写入失败或发生版本冲突
- **THEN** 页面保留当前状态并提供重试，不把失败当作成功跨页，不写入空文章占位或覆盖已有数据

#### Scenario: Sign in with only an unwritten guest context
- **WHEN** 游客恢复记录只有话题或静态访谈开场，没有对应既有作品或实际输入
- **THEN** 登录同步不因此被阻断，不迁移为空文章，原临时上下文保留；真实待恢复输入和未保存结果继续阻止不安全迁移
