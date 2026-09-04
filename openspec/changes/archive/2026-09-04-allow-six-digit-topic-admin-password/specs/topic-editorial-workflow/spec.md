## MODIFIED Requirements

### Requirement: Independent single-editor administration
后台 SHALL 使用独立单编辑身份、服务端会话和 CSRF 防护；管理员密码 MUST 为 6–1024 个字符并只以 scrypt 散列进入服务端配置，密码、会话、Cookie、密钥和用户文章 MUST 不进入审计或操作日志。

#### Scenario: Generate the shortest valid credential
- **WHEN** 管理员在交互式散列工具中输入六个字符的密码
- **THEN** 系统生成既有 scrypt 格式的散列且不回显明文，并拒绝五个字符或超过 1024 个字符的输入

#### Scenario: Establish and end an admin session
- **WHEN** 配置有效管理员凭据并通过独立登录页认证
- **THEN** 系统签发 HttpOnly、SameSite 严格且生产环境 Secure 的短期会话，显式退出、到期或密码散列轮换后不可继续使用

#### Scenario: Reject unauthorized mutation
- **WHEN** 管理写请求缺少有效会话、精确 Origin、JSON Content-Type、CSRF token 或当前 revision token
- **THEN** 系统在执行数据库或 AI 操作前以 401、403、415 或 409 拒绝，并只记录固定错误类别

#### Scenario: Use the admin on supported screens
- **WHEN** 编辑在桌面或窄屏手机打开后台
- **THEN** 桌面可完成生成、编辑、预览和排期，手机以单列保持查看、调整排期和提前下线操作可达，后台不进入产品导航或小程序
