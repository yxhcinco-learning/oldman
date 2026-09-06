## MODIFIED Requirements

### Requirement: Local-only storage disclosure
以下本地说明仅适用游客及未入云草稿。第二阶段 SHALL 区分本机已保存、正在同步、已同步、未上传和需重新登录；账号归属与云版本单独持久保存，token 不进入作品或备份；仅主动登录后自动上传，退出不改变原账号归属。

小程序 MUST 把“已保存”解释为当前微信用户、当前 AppID、当前设备的本地文件写入成功，不得暗示云备份、永久保存或跨设备同步；身份 token 和服务端用户记录 MUST 与作品文件分离。

#### Scenario: View storage information
- **WHEN** 用户在“我的”、保存状态或首次备份提示查看数据说明
- **THEN** 系统说明换设备、换微信用户、清理小程序或更换 AppID 可能无法读取原数据，并提供手工备份入口

#### Scenario: Establish or replace an online session
- **WHEN** 小程序创建、刷新或清除业务 token
- **THEN** 本地作品目录和聚合文件保持不变，服务端不会因为会话变化收到作品、采访素材或会话正文

#### Scenario: Account saving status
- **WHEN** 云作品本机保存成功但云确认尚未返回
- **THEN** 显示本机已保存或正在同步，不能显示已同步

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

