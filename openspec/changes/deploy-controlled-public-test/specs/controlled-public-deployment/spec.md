## ADDED Requirements

### Requirement: Versioned private application runtime
系统 MUST 将固定提交构建为独立 release，并以专用非登录用户和两个受 systemd 托管的回环进程运行 Vinext 前端与 Fastify 网关；进程 MUST 支持开机启动、异常重启、SIGTERM 优雅停止、健康检查和上一 release 回滚，且不得停止或复用其他项目的服务、端口或目录。

#### Scenario: Activate a verified release
- **WHEN** 新 release 通过哈希、依赖、构建和回环健康检查
- **THEN** `current` 原子指向该 release，仅重启岁月有声前端和网关，两个进程只监听未占用的 `127.0.0.1` 端口并在异常后受限重启

#### Scenario: Release fails before or after activation
- **WHEN** 构建、健康检查、systemd 启动或公网验证失败
- **THEN** 不覆盖上一 release；恢复 `current` 和服务到记录的前一版本，其他站点与数据保持不变，并保留失败证据供排查

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
测试期访问控制 MUST 位于反向代理层，并对普通请求及 AI/语音入口提供简单按 IP 限流；应用现有 AI 并发、频率、超时和 ASR 连接/时长/字节限制 MUST 保留。临时认证 SHALL 只创建有限的 `admin01`、`admin02` 类测试条目和各不相同的四位数字口令，明文只保存在本机受限私密交付文件中，服务器只保存 htpasswd 哈希。产品代码不得为测试新增正式账号、邀请码、提示条、管理后台或复杂用户配额。

#### Scenario: Request bursts exceed a bound
- **WHEN** 单一来源短时间超过代理或应用现有限制
- **THEN** 请求以 429 或连接拒绝结束，不自动调用外部服务、放宽限制或进入无上限重试

#### Scenario: Rotate temporary access
- **WHEN** 测试凭据疑似泄露或体验人员发生变化
- **THEN** 管理者可只轮换服务器认证文件并验证 Nginx，无需发布新前端、迁移 IndexedDB 或修改产品代码

#### Scenario: Interrupted native authentication
- **WHEN** 移动浏览器显示 Basic Auth 对话框时切到后台复制凭据并把本次挑战作为取消返回 401
- **THEN** 401 页面不显示或记录凭据，提供可读的“重新登录”入口再次访问受保护首页并重新触发标准挑战；取消不会绕过认证、自动循环刷新或调用应用和外部服务

#### Scenario: Validate simplified test entries
- **WHEN** 部署者轮换为有限的易输入测试条目
- **THEN** 每个预期账号分别通过 HTTPS 认证，无效账号或口令仍返回 401；验证输出和验收记录不得包含四位数字明文

### Requirement: Server-only secrets and safe operations logs
Linux 网关 MUST 使用 `ASR_CREDENTIAL_SOURCE=project` 从 root-only 服务端环境文件加载同一批次的腾讯云 ASR 凭据，并从同一文件加载 DeepSeek Key；秘密不得进入 Git、客户端、构建镜像、release、命令输出或日志。操作日志 MUST 只记录 requestId、action、status、durationMs、可用的 tokens 和固定 errorCategory，不得记录正文、会话、音频、Key、Cookie、Authorization、签名 URL 或上游私密响应。

#### Scenario: Start with valid protected configuration
- **WHEN** root-only 环境文件包含完整项目来源 ASR 凭据、精确 Origin 和有效 DeepSeek 配置
- **THEN** `/api/health` 及两个 status 可报告非秘密运行/配置状态，网关能够按用户动作调用相应上游且日志只含允许字段

#### Scenario: Configuration or upstream failure
- **WHEN** 凭据缺失、Origin 不匹配、上游鉴权/余额/网络/格式失败或请求超时
- **THEN** 请求返回不含秘密与正文的受控错误，日志仅记录固定错误类别和状态，不回退 mock、不自动重试计费调用

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
