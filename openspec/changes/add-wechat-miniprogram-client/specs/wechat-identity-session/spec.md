## ADDED Requirements

### Requirement: Silent minimal WeChat identity
小程序 SHALL 在需要在线身份时使用 `wx.login` 取得一次性 code 并由服务端建立内部用户，不得展示注册/密码登录页，也不得主动请求手机号、微信昵称、头像或其他非必要资料；身份失败 MUST NOT 阻塞本地写作。

#### Scenario: First successful launch
- **WHEN** 用户首次打开小程序、网络可用且微信换码配置有效
- **THEN** 客户端在后台完成一次换码并取得自有业务 token，用户可直接使用产品且不会看到“注册账号”或资料授权要求

#### Scenario: Login is unavailable
- **WHEN** `wx.login`、业务后端或微信换码失败
- **THEN** 系统不创建基于假 code 的用户、不回退 mock、不循环弹窗，本地能力保持可用且在线操作提供一次明确重试

### Requirement: Server-only code exchange
服务端 MUST 只使用受限运行时中的 AppID 与 AppSecret 调用微信 `code2Session`，MUST 把一次性 code 视为不可重放输入，并 SHALL 以 `(app_id, openid)` 查找或创建最小内部身份；AppSecret、OpenID、`session_key` 和完整微信响应不得下发到客户端或进入操作日志。

#### Scenario: Exchange a valid code
- **WHEN** 未使用的有效 code 被提交到限流登录端点
- **THEN** 服务端用固定 AppID 换取身份、事务创建或更新内部用户并返回自有 token；不需要的 `session_key` 在请求内使用后即丢弃

#### Scenario: Reject an invalid or replayed code
- **WHEN** 微信返回无效、过期、已使用、AppID 不匹配或上游错误
- **THEN** 服务端返回不含微信秘密和原始响应的受控错误，不创建用户、不签发 token且不自动重试同一 code

### Requirement: Revocable opaque business session
系统 SHALL 使用高熵随机 opaque token 作为小程序业务会话，服务端 MUST 只保存 token 哈希、用户关联、创建、到期、撤销和有限最近使用信息，并 MUST 限制有效期、每用户活动会话数和失效记录清理。

#### Scenario: Use a valid session
- **WHEN** 小程序以有效 Bearer token 调用受保护 API
- **THEN** 服务端识别内部用户并执行请求，响应和日志不回显 token、OpenID 或 Authorization

#### Scenario: Session expires or is revoked
- **WHEN** token 已到期、被撤销、超过活动会话限制或数据库中不存在
- **THEN** 服务端返回统一未授权；客户端清除本地 token并最多执行一次单飞无感重新登录，不并发重复换码或无限重试业务请求

#### Scenario: Token persistence fails
- **WHEN** 微信加密 storage 不可用或保存 token 失败
- **THEN** 当前运行可继续使用内存会话，下次冷启动重新无感登录；系统不得把 token 写入作品文件、日志或明文备份

### Requirement: Authenticated AI and speech access
小程序 AI 请求 MUST 使用有效业务会话；语音 MUST 先以业务会话申请短时单次 ticket，再用该 ticket 建立 WSS。话题读取可以保持只读公开，但 MUST 继续遵守发布审核、大小、缓存和限流边界。

#### Scenario: Request an AI turn
- **WHEN** 已登录小程序提交符合 schema 的 AI 请求
- **THEN** 服务端在验证 Bearer token、用户级频率和现有并发限制后调用上游；无效会话在调用 DeepSeek 前被拒绝

#### Scenario: Open a speech connection
- **WHEN** 已登录小程序申请语音 ticket 并在 60 秒内第一次建立 WSS
- **THEN** 网关原子消费 ticket 后才连接腾讯上游，继续施加连接、时长、字节和缓冲限制

#### Scenario: Reuse or leak a speech ticket
- **WHEN** ticket 过期、已消费、与预期用途不符或缺失
- **THEN** 网关在连接腾讯上游前拒绝，ticket 不进入访问日志且长期业务 token不出现在 WebSocket URL

### Requirement: Minimal identity persistence
服务端身份库 SHALL 仅保存内部用户、微信 AppID/OpenID 关联及可撤销会话，不得保存文章、采访素材、小文会话、原音、手机号、头像或昵称；数据库 MUST 位于 release 外的受限持久目录并支持事务迁移、完整性检查和备份。

#### Scenario: Activate a new application release
- **WHEN** 部署切换到新的代码 release
- **THEN** 身份数据库仍位于 `/var/lib/suiyue-yousheng`，迁移在服务接流量前完成且回滚不删除数据库或小程序本地作品

#### Scenario: Inspect operations or backups
- **WHEN** 运维查看日志、健康状态或身份库备份
- **THEN** 日志只含允许的请求元数据，备份受限保存且不包含任何作品正文、音频或客户端 token 明文

### Requirement: Temporary AppID remains a development boundary
借用 AppID MUST 只存在于未跟踪的本机 private config 并仅用于开发/体验版；常规脚本 MUST NOT 上传、提审或发布。系统 SHALL 明确正式 AppID 会产生不同 OpenID 与隔离的本地文件空间，并 MUST NOT 自动合并身份或声称数据会随 AppID 迁移。

#### Scenario: Build with the borrowed AppID
- **WHEN** 开发者在已登录的微信开发者工具打开本机小程序工程
- **THEN** 工具从未跟踪 private config 读取临时 AppID，仓库默认配置不包含该发布身份且构建命令不触发上传

#### Scenario: Move to the final AppID
- **WHEN** 正式 AppID 到位并替换本机与服务器配置
- **THEN** 系统把它视为新的微信身份域和本地数据空间；需要保留的测试作品只能由用户先导出再显式导入为副本
