# controlled-public-deployment Specification

## Purpose
定义“岁月有声”小范围受控公网测试的版本化运行、同源 HTTPS、临时访问保护、服务端秘密、浏览器本地数据与可审计验收边界。
## Requirements
### Requirement: Versioned private application runtime
系统 MUST 将固定提交构建为独立 release，并以专用非登录用户和两个受 systemd 托管的回环进程运行 Vinext 前端与 Fastify 网关；进程 MUST 支持开机启动、异常重启、SIGTERM 优雅停止、健康检查和上一 release 回滚。持久化微信身份库与话题库 MUST 位于 release 外并在迁移前分别检查和备份，部署不得停止或复用其他项目的服务、端口、目录或数据库。

#### Scenario: Activate a verified release
- **WHEN** 新 release 通过哈希、依赖、构建、身份库与话题库备份/迁移和回环健康检查
- **THEN** `current` 原子指向该 release，仅重启岁月有声前端和网关，两个进程只监听未占用的 `127.0.0.1` 端口并在异常后受限重启

#### Scenario: Release fails before or after activation
- **WHEN** 构建、数据库检查或迁移、健康检查、systemd 启动或公网验证失败
- **THEN** 不覆盖上一 release；恢复 `current`、服务及迁移前数据库到记录的前一状态，其他站点与数据保持不变，并隔离失败副本供排查

#### Scenario: Roll back code after successful data migration
- **WHEN** 已成功激活的新代码需要普通代码回滚
- **THEN** 回滚脚本切换 release 而不删除、覆盖或降级微信身份库与话题库，数据库恢复只用于失败迁移的同轮补救

### Requirement: Fixed protected same-origin HTTPS
公网测试 MUST 只使用固定的 `https://suiyue.maicong.chat` Origin，由 Nginx 在 80/443 提供 TLS、访问保护和同源反向代理；`/` MUST 转发前端，`/api/ai/*` MUST 转发 Fastify HTTP，`/api/speech` MUST 保留 WebSocket Upgrade，应用端口不得通过云防火墙或公网地址开放。

#### Scenario: Authorized same-origin use
- **WHEN** 体验者通过有效测试凭据打开 HTTPS 页面并调用 AI 或语音
- **THEN** 页面、静态资源、API 和 WSS 均保持同一 Origin，网关看到精确允许的 Origin，浏览器无需跨域配置

#### Scenario: Missing credentials or untrusted origin
- **WHEN** 请求没有有效代理访问凭据，或 API/WebSocket Origin 不是固定 HTTPS Origin
- **THEN** Nginx 或网关在连接上游前拒绝请求，不返回服务秘密、正文、音频或详细上游响应

#### Scenario: HTTP or internal port request
- **WHEN** 访问测试域名的 HTTP 地址或尝试通过公网连接应用端口
- **THEN** HTTP 跳转至相同 HTTPS 域名，公网仅 80/443 可达，3011/3012 仍只在服务器回环监听

### Requirement: Proxy-layer temporary controls
测试期访问控制 MUST 位于反向代理层，并对普通请求及 AI/语音入口提供简单按 IP 限流；应用现有 AI 并发、频率、超时和 ASR 连接/时长/字节限制 MUST 保留。临时认证 SHALL 只创建有限测试条目并只保护体验者入口；独立 `/admin/topics` 与 `/api/admin/*` SHALL 由应用自己的管理员会话、Origin、CSRF 和登录限流保护，不得使用体验者 Basic Auth 作为后台授权。产品不得为普通用户新增正式账号、邀请码或复杂用户配额。

#### Scenario: Request bursts exceed a bound
- **WHEN** 单一来源短时间超过代理、后台登录或应用现有限制
- **THEN** 请求以 429 或连接拒绝结束，不自动调用外部服务、放宽限制或进入无上限重试

#### Scenario: Rotate temporary access
- **WHEN** 体验凭据疑似泄露或体验人员发生变化
- **THEN** 管理者可只轮换服务器认证文件并验证 Nginx，无需发布新前端、迁移 IndexedDB、修改后台管理员密码或影响后台会话策略

#### Scenario: Access the independent editorial console
- **WHEN** 访问者打开后台页面或管理 API
- **THEN** Nginx 将请求转发给应用且不使用体验者 Basic Auth；应用在任何管理读取、写入或 AI 调用前验证独立后台身份和对应安全条件

#### Scenario: Recover after mobile authentication is cancelled
- **WHEN** 移动浏览器在体验者 Basic Auth 对话框期间切到后台并把认证当作取消
- **THEN** 401 响应保留认证挑战并显示同源、无缓存的最小恢复页；页面回到前台至多自动重试一次，用户也可通过至少 48px 的“重新登录”操作再次触发原生认证框，且页面不得读取、保存或传输凭据到产品应用

### Requirement: Server-only secrets and safe operations logs
Linux 网关 MUST 从 root-only 服务端环境文件加载腾讯云 ASR、DeepSeek、微信身份、话题数据库及后台管理员配置；秘密不得进入 Git、客户端、构建镜像、release、命令参数、输出或日志。操作与审计日志 MUST 只记录允许的 requestId、actor、action、entity、status、durationMs、用量和固定 errorCategory，不得记录正文、会话、音频、密码、Key、Cookie、Authorization、CSRF、签名 URL、模型 reasoning 或上游私密响应。

#### Scenario: Start with valid protected configuration
- **WHEN** root-only 环境文件包含完整项目来源 ASR、精确 Origin、DeepSeek、微信身份、话题数据库和后台密码散列配置
- **THEN** `/api/health` 只以布尔值报告相应能力，网关能够按用户或编辑动作调用对应服务且日志只含允许字段

#### Scenario: Configuration or upstream failure
- **WHEN** 数据库或凭据缺失、Origin 不匹配、上游鉴权/余额/网络/格式失败或请求超时
- **THEN** 相应能力返回不含秘密、编辑引子与正文的受控错误，其他独立能力继续运行，日志仅记录固定错误类别且不自动重试计费调用

### Requirement: Browser-compatible security headers
HTTPS 入口 MUST 返回与现有同源 API、WSS 和麦克风兼容的安全响应头，包括 HSTS、nosniff、严格 Referrer Policy、`Permissions-Policy: microphone=(self)` 以及限制到 self 的内容安全策略；安全头不得阻断现有静态资源、同源 AI、语音 Upgrade 或页面录音授权。

#### Scenario: Load and use the protected application
- **WHEN** 授权用户通过受支持浏览器加载首页、静态资源并发起同源 API/WSS
- **THEN** 安全头存在且相关请求成功，不需要放宽为任意 Origin、任意脚本或任意连接来源

### Requirement: Local-only article persistence across public testing
公网测试 MUST 继续把作品、会话和历史只保存在每位体验者当前 HTTPS Origin 的浏览器 IndexedDB；服务端不得接收用于同步或迁移的文章备份。JSON 备份/恢复 MUST 继续作为显式人工迁移与恢复方式，不得自动上传 localhost 数据。

#### Scenario: First visit from a new origin or device
- **WHEN** 同事首次打开固定测试域名
- **THEN** 其作品库从该 Origin 的空 IndexedDB 开始，看不到 localhost、其他域名、协议、端口或其他同事浏览器中的文章

#### Scenario: Save, refresh and back up
- **WHEN** 体验者新建文字、保存、刷新并导出 JSON 备份
- **THEN** 内容在同一浏览器 Origin 恢复，备份由浏览器下载；服务器不创建文章、聊天、音频或备份副本

### Requirement: Evidence-based controlled public verification
部署 MUST 在激活前确认回滚路径并运行相应 check/build；激活后 MUST 验证访问控制、TLS、静态资源、健康/status、WebSocket Upgrade、文字保存刷新备份、服务重启和失败路径。真实 DeepSeek/ASR 调用 MUST 使用少量非敏感短样本并记录次数，测试替身、配置状态或 WebSocket 握手不得冒充公网真实上游成功；必须由用户操作的真机麦克风/键盘结果 MUST 单列。

#### Scenario: Complete automated and bounded live checks
- **WHEN** 公网入口和服务已启动且外部账户可用
- **THEN** 自动检查覆盖成功与拒绝路径，常规优化、润色和文字追问各至多一次真实短样本，ASR 仅在有合规短音频时至多一次，并记录实际调用次数、结果和费用边界

#### Scenario: Provider or device check cannot complete
- **WHEN** 外部服务余额/权限/网络失败，或验收需要真实 iOS/安卓麦克风、系统键盘和后台切换
- **THEN** 停止重复付费调用，保持服务可回滚并将项目列为未完成，不以 mock、桌面尺寸或合成音频替代

### Requirement: Bounded first-party event ingress
部署代理 SHALL 只通过现有网关暴露精确的第一方 H5 事件路径，保持站点级临时 Basic Auth 边界、应用专用按 IP 限流并关闭 access log，所有未列出 API 继续拒绝。应用 SHALL 另外强制精确 Origin、JSON、body、schema 和全局频率限制，且不在监控数据中保留 IP 地址。

#### Scenario: Send a controlled H5 event
- **WHEN** 已通过体验访问认证的 H5 页面向精确运营事件路径提交有效白名单事件
- **THEN** Nginx 只在专用限流下转发到回环网关，应用接受事件但不转发到第三方收集器

#### Scenario: Probe an unlisted or abusive route
- **WHEN** 客户端使用其他 operations 路径、缺少 H5 访问边界、突发请求或提供无效 Origin/body
- **THEN** Nginx 或网关在聚合前返回 401、403、404、413、415 或 429，且不扩大其他公开 API 边界
