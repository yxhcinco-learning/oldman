## MODIFIED Requirements

### Requirement: Versioned per-work local aggregates
小程序 MUST 将已建立文章、已确认草稿和对应文章会话保存在 `wx.env.USER_DATA_PATH` 下经过 schema 校验的版本化本地文件中，并 SHALL 按作品拆分聚合数据；作品索引只可作为可重建缓存，不得成为正文或版本历史的唯一事实来源。未成稿的会话按草稿ID独立恢复，输入框内容不进入新保存文件。

#### Scenario: Save and reopen a work
- **WHEN** 用户保存包含标题、正文、话题快照、采访素材、版本和已发送小文会话的作品后重新打开小程序
- **THEN** 系统从有效聚合文件恢复已保存数据且保持来源分层，不恢复当前输入框；列表索引与聚合不一致时从聚合重建索引

#### Scenario: Index is missing or damaged
- **WHEN** 索引文件不存在、解析失败或引用不存在的作品
- **THEN** 系统扫描并校验作品聚合，恢复可用列表、隔离损坏文件并报告非破坏性问题，不清空用户目录

### Requirement: Atomic ordered writes and conflict protection
小程序仓储 SHALL 使用单写队列、expected revision、同目录临时文件和校验后替换提交作品；AI 候选应用、恢复和已建文章的会话状态 MUST 在同一作品聚合中提交，未成稿的会话与结果按草稿ID独立提交，过期写入不得覆盖较新内容或输入内存。

#### Scenario: Rapid edits during an in-flight save
- **WHEN** 前一次文件写入尚未完成而用户继续输入标题正文或点击保存退出
- **THEN** 写队列最终提交包含最新文章内容的 revision 后才完成退出，旧快照不能在新快照之后落盘

#### Scenario: Crash between aggregate and index update
- **WHEN** 聚合文件已经成功替换而索引或活动恢复记录尚未更新时进程退出
- **THEN** 下次启动以有效聚合的 revision 和时间为准重建索引，不用旧 recovery 覆盖新正文；同快照保存成功也清除该文章过时恢复记录

#### Scenario: Revision conflict
- **WHEN** 保存使用的 expected revision 落后于磁盘中的有效作品
- **THEN** 系统拒绝覆盖、保留内存副本并提供重载、另存副本或救援导出，不显示“已保存”，不以被拒绝的快照覆盖当前输入缓存

### Requirement: Compatible manual backup migration
小程序 SHALL 导出 JSON v6 中的实际文章及已发送会话，新导出不含当前输入框；以下兼容和副本边界继续适用，接受 v1–v6。超过每卷 10MiB 时分卷，在线全部备份先补齐云作品，离线明确只导出本机。

小程序 SHALL 导出与历史网页端兼容的有版本、大小和 schema 校验的 JSON 备份，并 MUST 将有效导入作为新副本添加；单篇 TXT、复制正文与救援导出 SHALL 使用实际文章内容并保留适用 AI 标识。

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
- **WHEN** 导出再导入当前版本备份，或读取包含历史未发送输入的旧 v6 备份
- **THEN** 校验后按新副本读取兼容数据；新导出与新建上传操作剥离输入框，不包含账号、token 或同步队列，不清理旧文件或修改已冻结上传操作

### Requirement: Unwritten context does not create an article
小程序 MUST NOT 因打开新编辑器、选择话题、开启访谈、静态问候或没有转写的录音而建立文章。新文章 SHALL 仅在用户填写的标题或当前有效正文非空时建立；待确认语音、段落编辑框、未发送文字、素材、会话消息、请求/结果和历史版本本身都不触发建稿；已有作品 MUST 继续支持清空编辑，不得借空白判断删除旧稿。

#### Scenario: Leave without author input
- **WHEN** 用户进入正文或访谈，只有静态开场、待确认语音、未发送输入或尚未写入正文的对话便返回、切后台或重开
- **THEN** 文章列表与计数不增加，云同步不收到新作品；跨页所需话题和模式只作为本机临时恢复上下文保留

#### Scenario: Continue across pages before the first input
- **WHEN** 空白新稿开启访谈、关闭回编辑器后再次打开或在前台恢复
- **THEN** 同一草稿ID、话题及模式仍可读取，不因为未建立文章而打不开页面，也不重复增加静态开场

#### Scenario: Persist actual input and existing work
- **WHEN** 用户输入标题、文字、待确认语音、未发送会话文字或实际发送消息，或修改已保存的作品为空
- **THEN** 只有标题或正文首次非空时建立同一篇文章；待确认语音和未发送输入仅留于当前编辑内存，已发送会话及结果按独立本机上下文恢复；旧作品及清空后的版本保护继续有效

#### Scenario: Fail to save a temporary context
- **WHEN** 临时上下文写入失败或发生版本冲突
- **THEN** 页面保留当前状态并提供重试，不把失败当作成功跨页，不写入空文章占位或覆盖已有数据

#### Scenario: Sign in with only an unwritten guest context
- **WHEN** 游客上下文没有对应既有作品，且标题与正文为空
- **THEN** 登录同步不因此被阻断，不迁移为空文章，原临时上下文保留；有文章内容或对应既有作品的恢复记录继续阻止不安全迁移，未成文章的会话恢复保持在原空间

#### Scenario: Late reply after another temporary context opens
- **WHEN** 新稿尚无标题正文，用户切换另一临时上下文后原请求收到结果
- **THEN** 回复仍归原草稿ID的独立上下文，不覆盖当前上下文、不建立空文章；保存失败仍可重试，确认采用正文后才创建原ID文章

#### Scenario: Leave after an intermediate-only edit
- **WHEN** 语音待确认框或小文输入框有内容而标题正文为空，用户返回或关闭访谈
- **THEN** 导航成功且列表不增加，不把无需建立文章误报为保存失败，也不显示文章已保存；本次编辑内存允许继续确认或发送
