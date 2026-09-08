## MODIFIED Requirements

### Requirement: Durable complete writing sync
系统 SHALL 只同步已经建立的文章及其正文、版本、已发送会话、素材和访谈模式；新保存的文章快照不包含待确认语音、段落编辑框或未发送会话输入；MUST 先本机提交再持久排队，冻结已发送操作并只确认对应内容。

#### Scenario: Crash during upload and later edits
- **WHEN** 上传中继续输入、进程重启或确认结果写入失败
- **THEN** 原操作可幂等重试，新输入仍标待同步；只有对应快照确认后显示已同步

#### Scenario: Continue on another device
- **WHEN** 同账号另一设备打开云作品
- **THEN** 最新完整快照成功落到本机后才允许编辑，不恢复录音或自动重新调用正在执行的模型请求

#### Scenario: Intermediate input does not create or upload an article
- **WHEN** 新上下文仅有输入框文字、素材、会话或未应用结果，标题正文为空
- **THEN** 本机和云端文章计数不增加，不建立作品上传操作；确认输入或采用结果进入标题/正文后正常保存和同步

### Requirement: Complete portable backup volumes
系统 SHALL 导出包含实际文章及已发送会话的 JSON v6，新导出快照不包含当前输入框状态，兼容 v1–v5 导入，MUST 为每份导入创建新副本且不携带身份或同步元数据。

#### Scenario: Full cloud backup or offline export
- **WHEN** 用户选择备份
- **THEN** 在线全部备份先补齐云内容，离线标明仅本机；超过每卷 10MiB 分卷，损坏导入不改变已有作品
