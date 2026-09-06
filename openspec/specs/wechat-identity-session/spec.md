# wechat-identity-session Specification

> 当前范围：小程序是唯一用户端，网页仅运营后台；H5专属描述只作历史兼容，不构成新需求或依赖。平台材料由用户处理，技术归档不代表正式发布审核通过。

## Purpose
定义微信主动登录、服务端换码、单设备可撤销账号会话、AI/语音鉴权、账号与私有作品数据库及 AppID 隔离边界，同时保留尚未启用账号的旧客户端最小身份兼容规则。
## Requirements
### Requirement: Silent minimal WeChat identity
旧版未启用账号的客户端 SHALL 保留以下最小身份兼容行为。第二阶段客户端 MUST 仅在用户点击微信登录后建立账号会话，不自动换码；未登录仅可查看开屏、登录和隐私说明，登录后才可进入产品并自动同步。以下旧客户端无感登录和本地使用规则只用于兼容，不能作为第二阶段入口绕过。

小程序 SHALL 在需要在线身份时使用 `wx.login` 取得一次性 code 并由服务端建立内部用户，不得展示注册/密码登录页，也不得主动请求手机号、微信昵称、头像或其他非必要资料；身份失败 MUST NOT 阻塞本地写作。

#### Scenario: First successful launch
- **WHEN** 用户首次打开小程序、网络可用且微信换码配置有效
- **THEN** 客户端在后台完成一次换码并取得自有业务 token，用户可直接使用产品且不会看到“注册账号”或资料授权要求

#### Scenario: Login is unavailable
- **WHEN** `wx.login`、业务后端或微信换码失败
- **THEN** 系统不创建基于假 code 的用户、不回退 mock、不循环弹窗，本地能力保持可用且在线操作提供一次明确重试

#### Scenario: Explicit account login
- **WHEN** 用户使用第二阶段客户端
- **THEN** 独立微信授权登录页仅在点击后建立账号会话并自动创建首次账号，头像昵称可选，失败保留在登录页并提供重试，不清除历史本机作品；本页取代旧版不显示登录页的限制

#### Scenario: Return after sign in
- **WHEN** 从作品登录后游客作品已认领或账号恢复
- **THEN** 按固定账号和认领后的标识重新读取原作品，保留已保存输入，不重复提交模型任务；换账号返回作品列表，不读取前一账号缓存

#### Scenario: Cloud sync fails after sign in
- **WHEN** 微信登录成功但作品同步未完成
- **THEN** 保留有效账号及本机内容，重试只执行同步，不自动再次换码；离开登录页后迟到结果不得强制导航

### Requirement: Server-only code exchange
服务端 MUST 只使用受限运行时中的 AppID 与 AppSecret 调用微信 `code2Session`，MUST 把一次性 code 视为不可重放输入，并 SHALL 以 `(app_id, openid)` 查找或创建最小内部身份；AppSecret、OpenID、`session_key` 和完整微信响应不得下发到客户端或进入操作日志。

#### Scenario: Exchange a valid code
- **WHEN** 未使用的有效 code 被提交到限流登录端点
- **THEN** 服务端用固定 AppID 换取身份、事务创建或更新内部用户并返回自有 token；不需要的 `session_key` 在请求内使用后即丢弃

#### Scenario: Reject an invalid or replayed code
- **WHEN** 微信返回无效、过期、已使用、AppID 不匹配或上游错误
- **THEN** 服务端返回不含微信秘密和原始响应的受控错误，不创建用户、不签发 token且不自动重试同一 code

### Requirement: Revocable opaque business session
以下 token 散列、期限和存储安全规则 SHALL 继续适用。第二阶段账号 MUST 仅保留一个有效账号会话；旧客户端自动恢复仅适用尚未启用账号的用户，账号客户端被替换或过期时必须主动登录，续期只延长当前会话。

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

#### Scenario: Account session replacement
- **WHEN** 另一个设备主动登录账号
- **THEN** 旧会话失效且不自动重登；账号启用后旧换码接口不能重新签发会话

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
以下最小身份库限制仅适用第一阶段记录。第二阶段 SHALL 在同一受限数据库以独立表保存账号资料、私有作品和同步记录，共享事务验证账号会话及作品提交；数据库备份因此包含私有作品，必须同等受限且不得写入日志或仓库。

服务端身份库 SHALL 仅保存内部用户、微信 AppID/OpenID 关联及可撤销会话，不得保存文章、采访素材、小文会话、原音、手机号、头像或昵称；数据库 MUST 位于 release 外的受限持久目录并支持事务迁移、完整性检查和备份。

#### Scenario: Activate a new application release
- **WHEN** 部署切换到新的代码 release
- **THEN** 身份数据库仍位于 `/var/lib/suiyue-yousheng`，迁移在服务接流量前完成且回滚不删除数据库或小程序本地作品

#### Scenario: Inspect operations or backups
- **WHEN** 运维查看日志、健康状态或身份库备份
- **THEN** 日志只含允许的请求元数据，备份受限保存且不包含任何作品正文、音频或客户端 token 明文

#### Scenario: Account database migration
- **WHEN** 升级到账号与云作品版本
- **THEN** 保留旧用户与身份，事务迁移；接流量后不得恢复旧备份覆盖新作品

### Requirement: Temporary AppID remains a development boundary
借用 AppID MUST 只存在于未跟踪的本机 private config 并仅用于开发/体验版；常规脚本 MUST NOT 上传、提审或发布。系统 SHALL 明确正式 AppID 会产生不同 OpenID 与隔离的本地文件空间，并 MUST NOT 自动合并身份或声称数据会随 AppID 迁移。

#### Scenario: Build with the borrowed AppID
- **WHEN** 开发者在已登录的微信开发者工具打开本机小程序工程
- **THEN** 工具从未跟踪 private config 读取临时 AppID，仓库默认配置不包含该发布身份且构建命令不触发上传

#### Scenario: Move to the final AppID
- **WHEN** 正式 AppID 到位并替换本机与服务器配置
- **THEN** 系统把它视为新的微信身份域和本地数据空间；需要保留的测试作品只能由用户先导出再显式导入为副本
