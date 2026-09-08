## ADDED Requirements

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
