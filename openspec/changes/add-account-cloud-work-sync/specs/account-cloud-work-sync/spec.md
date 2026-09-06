## ADDED Requirements

### Requirement: Explicit private account and single session
系统 SHALL 在点击微信登录后绑定服务端确认身份并自动同步；同账号 MUST 只有一个有效账号会话，续期不创建新会话；资料可选且不收集手机号。

#### Scenario: Another device signs in
- **WHEN** 同账号在另一设备主动登录
- **THEN** 旧会话失效、不能读取或写入云作品且客户端不自动抢占，未上传内容保留在原账号空间

#### Scenario: Logout or account failure
- **WHEN** 用户退出、换码失败、会话过期或被替换
- **THEN** 系统区分状态、停止对应在线操作、隐藏已退出账号缓存，未登录不能进入产品；重新登录前不清除已有本机内容

### Requirement: Optional private profile
系统 SHALL 支持用户主动选择头像和填写昵称；MUST 鉴权读写、限制输入并去除头像元数据，失败保留旧资料。

#### Scenario: Cancel or invalid profile
- **WHEN** 用户取消选择、拒绝平台授权、上传超限或图片无法解码
- **THEN** 不改变原头像昵称，不阻塞写作，不生成公开原图地址

### Requirement: Authorized versioned work mutations
系统 MUST 以有效账号会话确定作品归属，在同一事务校验 baseVersion 并提交作品、单调云版本和 operationId 回执；不得以本机 revision 或客户端自报 userId 授权。

#### Scenario: Response lost or replayed
- **WHEN** 服务端已提交而客户端未收到响应并以同一操作重试
- **THEN** 返回原提交结果、不重复创建版本；同 operationId 不同内容拒绝

#### Scenario: Ownership or version mismatch
- **WHEN** 其他账号访问作品、旧会话写入或 baseVersion 落后
- **THEN** 拒绝操作且不覆盖原文，其他账号的作品与不存在作品使用一致响应

### Requirement: Durable complete writing sync
系统 SHALL 同步正文、版本、会话、素材、访谈模式与已保存待确认输入；MUST 先本机提交再持久排队，冻结已发送操作并只确认对应内容。

#### Scenario: Crash during upload and later edits
- **WHEN** 上传中继续输入、进程重启或确认结果写入失败
- **THEN** 原操作可幂等重试，新输入仍标待同步；只有对应快照确认后显示已同步

#### Scenario: Continue on another device
- **WHEN** 同账号另一设备打开云作品
- **THEN** 最新完整快照成功落到本机后才允许编辑，不恢复录音或自动重新调用正在执行的模型请求

### Requirement: Offline pause and recoverable stale input
系统 MUST 在云作品断网或身份失效时保住当前输入并暂停修改；已登录账号临时断网时未入云的新本机草稿 SHALL 保持可写。重新进入页面时必须核对账号；已有输入保存失败时仅保留只读救援，不丢弃内存或开放新编辑。

#### Scenario: Stale local input after takeover
- **WHEN** 原设备存在未上传内容且云端已有更新
- **THEN** 先持久保留完整恢复稿再安装云端最新，提供查看、另存新篇和导出，不自动合并或覆盖

#### Scenario: Local persistence fails
- **WHEN** 最新快照或恢复稿无法落盘
- **THEN** 不覆盖当前内存、不开放云作品编辑，显示真实失败并提供有限重试或救援

### Requirement: Safe initial ownership migration
系统 SHALL 在主动登录后自动认领当前游客空间尚未归属的作品及回收站，MUST 持久记录归属并允许迁移重试。

#### Scenario: Migration interrupted or IDs collide
- **WHEN** 首次迁移中断、重新登录或本机 ID 与云端碰撞
- **THEN** 已认领作品不重复归属或上传到另一账号，碰撞以新标识创建，旧内容保持

### Requirement: Synchronized work deletion
系统 SHALL 在线同步移入回收站和恢复，永久删除 MUST 经用户明确确认并清除在线正文，只保留防止复活的必要记录。

#### Scenario: Old device returns after purge
- **WHEN** 永久删除后旧设备重新连接或重放待保存操作
- **THEN** 同步删除对应缓存，旧保存不能复活已删作品，不影响其他作品

### Requirement: Complete portable backup volumes
系统 SHALL 导出包含写作输入状态的 JSON v6，兼容 v1–v5 导入，MUST 为每份导入创建新副本且不携带身份或同步元数据。

#### Scenario: Full cloud backup or offline export
- **WHEN** 用户选择备份
- **THEN** 在线全部备份先补齐云内容，离线标明仅本机；超过每卷 10MiB 分卷，损坏导入不改变已有作品

### Requirement: Safe runtime and evidence
系统 MUST 对云请求施加容量、频率、大小和日志边界，数据库接流量后的回滚不得恢复旧备份覆盖新作品；常规回归 SHALL 使用非计费测试入口。

#### Scenario: Unavailable or oversized cloud storage
- **WHEN** 数据库不可用或作品超过限制
- **THEN** 返回受控错误，保留本机内容，不显示同步成功或输出私密内容

