## MODIFIED Requirements

### Requirement: Explicit private account and single session
系统 SHALL 在点击微信登录后绑定服务端确认身份并自动同步；同账号 MUST 只有一个有效账号会话，续期不创建新会话；资料可选且不收集手机号。符合游客公开条件的文章及公开作者资料 SHALL 允许未登录只读访问；云作品、个人资料、互动写入、收藏、关系明细及花朵账户 MUST 继续验证有效账号并隔离缓存。

#### Scenario: Another device signs in
- **WHEN** 同账号在另一设备主动登录
- **THEN** 旧会话失效、不能读取或写入云作品且客户端不自动抢占，未上传内容保留在原账号空间

#### Scenario: Logout or account failure
- **WHEN** 用户退出、换码失败、会话过期或被替换
- **THEN** 系统区分状态、停止对应受保护在线操作、隐藏已退出账号的作品及私有互动缓存；重新登录前不清除已有本机内容，仍可按当前受众权限阅读游客公开内容，不得从公开入口读取旧账号缓存

#### Scenario: Keep public reading separate from work synchronization
- **WHEN** 游客阅读分享文章，或有效登录后作品同步遇到失败
- **THEN** 游客阅读不触发私有作品同步；已有有效会话的公开阅读及可独立确认的互动不因作品同步失败重新换码，私有作品仍遵循原有保存、冲突和恢复约束
