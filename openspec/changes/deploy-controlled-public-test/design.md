## Context

当前正式版由 Vinext 前端和 Fastify AI/语音网关组成，两者只在本机开发端口运行。文章、会话和历史全部在浏览器 IndexedDB；服务端只转发用户主动发起的 DeepSeek 和腾讯云 ASR 请求。现有 Lighthouse `lhins-pg6lbxtx`（Ubuntu 24.04、Node 24、Nginx、Certbot）已承载其他独立服务，公网仅需继续使用 80/443。DNSPod 的 `suiyue.maicong.chat` 尚未占用，适合作为固定测试 Origin。

本次是用户明确授权的小范围临时公网测试，不是正式开放。需要允许异地同事访问，同时让发布、认证、秘密、费用、日志和回滚边界可审计。部署不能改变产品数据模型，也不能让 localhost 的 IndexedDB 自动迁移到新 Origin。

## Goals / Non-Goals

**Goals:**

- 以固定提交构建可回滚 release，在服务器重启或进程异常后自动恢复。
- 仅通过 `https://suiyue.maicong.chat` 提供同源页面、AI HTTP 和语音 WebSocket，并将应用端口限制在回环地址。
- 在 Nginx 层提供测试期访问保护和简单限流，不修改产品身份模型。
- 在 Linux 使用 `ASR_CREDENTIAL_SOURCE=project` 和 root-only 环境文件，保护 DeepSeek/腾讯云秘密及用户内容。
- 以少量非敏感调用完成真实公网验收，记录自动、合成音频和真机手工验证的区别。

**Non-Goals:**

- 账号、邀请码、云端文章、跨设备同步、管理后台、站内反馈、测试提示条、外部搜索、配图、精简、扩写或新的 AI 交互。
- 把本机 IndexedDB、JSON 备份、正文、聊天或音频上传到服务器。
- 新建云服务器、数据库、对象存储、发布平台、付费资源包或复杂配额系统。
- 推送/合并代码、修改 Git 历史，或替代 Safari/安卓真实设备的麦克风和键盘验收。

## Decisions

### 隔离的双进程 systemd 托管

服务器使用专用无登录用户 `suiyue`，release 位于 `/opt/suiyue-yousheng/releases/<version>`，`current` 是原子切换软链接。`suiyue-web.service` 在 `127.0.0.1:3011` 运行 `vinext start`，`suiyue-gateway.service` 在 `127.0.0.1:3012` 运行 Fastify。两者启用开机启动、`Restart=on-failure`、有限重启速率、SIGTERM 优雅停止和 systemd 沙箱。

选择双服务而非组合开发启动器，因为前端与网关的健康、日志和失败域不同；不使用 Docker Compose，避免在已有主机上为两个 Node 进程额外引入镜像、守护进程和镜像内秘密管理。release 保留上一版，部署只切换 `current` 并重启这两个服务。

### 固定同源 HTTPS 与代理路由

固定 Origin 为 `https://suiyue.maicong.chat`。Nginx 80 端口只保留 ACME challenge 并跳转 HTTPS；443 的 `/api/ai/` 和 `/api/speech` 转发到 3012，其他路径转发到 3011。语音位置显式传递 HTTP/1.1、Upgrade、Connection 和原始 Origin，长请求超时兼容现有 120 秒 AI 与 5 分钟语音上限。

选择独立子域名而非复用根域名、`time` 或 `tct`，避免覆盖其他项目路由和 IndexedDB Origin。TLS 使用服务器现有 Certbot Nginx 集成与 `certbot.timer` 自动续期。Lighthouse 防火墙保持 80/443；应用端口不新增公网规则。

### 代理层临时访问保护和限流

所有页面、状态接口和 WebSocket 握手都在 Nginx 层使用 Basic Auth；认证文件位于 `/etc/nginx`、root 可写且不进入 release。生成一个随机测试密码，通过用户既有私密交付渠道分发；部署报告只说明用户名和轮换命令/位置，不把密码写入 Git、聊天或日志。Nginx 对普通请求和 AI/语音握手分别使用简单按 IP 限流，保留应用已有 AI 并发 2、每分钟 20 次及 ASR 连接 2 的限制。

选择 Basic Auth 是因为主机现有 Nginx 支持且阶段性保护无需产品账户；它不是细粒度授权，同一凭据泄露后必须轮换。状态接口不豁免认证，避免泄露服务配置状态。

### 运行秘密与日志

网关只从 `/etc/suiyue-yousheng/runtime.env` 读取 `DEEPSEEK_API_KEY`、腾讯云 ASR 完整凭据和非秘密配置；文件 `0600 root:root`，通过 systemd `LoadCredential` 暂不采用，因为现有应用直接消费环境变量且本次不改造秘密读取协议。Linux 固定 `ASR_CREDENTIAL_SOURCE=project`，绝不使用 `windows-user`。release、构建、客户端和 Nginx 配置均不含秘密。

Fastify 增加 `/api/health` 和最小结构化操作日志。日志字段限定为 requestId、action、status、durationMs、tokens（有上游 usage 时）和 errorCategory；不记录请求体、正文、聊天、音频、Authorization、Cookie、签名 URL或上游原始响应。Nginx access log 对该站点关闭，只保留 warn 级错误；journald 通过系统默认轮转和容量策略管理。

### 安全响应头与浏览器能力

Nginx 设置 HSTS、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、严格同源 `Permissions-Policy: microphone=(self)` 和适配现有应用/同源 API/WSS 的 CSP。CSP 不允许任意远端脚本或连接；前端仅连接 self 的 HTTPS/WSS。Basic Auth 响应和 API 错误同样带安全头。

### 验收和费用边界

部署前运行本地 check/build 并确认前一 release、当前 Nginx 配置与 DNS 记录。发布后验证认证拒绝/成功、TLS/静态资源、两个 status、健康、WebSocket Upgrade、文字 IndexedDB/刷新/JSON 备份、服务重启和 Nginx 配置；AI 只进行常规优化、润色和文字追问各至多一次短样本，失败路径使用无效 Origin/无认证/超限或受控断网，不批量调用。ASR 仅在可复用的非敏感短 PCM 存在时至多一次真实合成音频联调；没有音频不以握手冒充转写。

服务商余额和告警保持账户侧管理；本次不自动充值、购买或创建成本监控资源。真实手机麦克风、iOS/安卓键盘、后台切换若必须用户操作，保留为未完成项。

## Risks / Trade-offs

- [共享 Basic Auth 不是个人身份] → 仅用于少量同事、通过 HTTPS 传输、限制传播并提供即时轮换；不把它包装成正式账号。
- [固定新 Origin 看不到 localhost 文章] → 明确不同 Origin 的 IndexedDB 相互隔离；需要内容时由用户手工 JSON 备份/恢复，不做自动迁移。
- [Vinext 仍为 beta] → 固定锁文件和 Node 24，在同一提交运行 check/build/启动验收，保留上一 release 快速回滚。
- [服务器复用导致资源竞争] → 使用独立端口/用户/目录/服务，部署前检查内存、磁盘和监听，限并发且不停止其他项目。
- [共享腾讯云身份权限大于纯 ASR] → 只在 root-only 网关环境文件使用现有受控身份，不进入客户端；后续正式上线应换 ASR 专用运行身份，本次不未经授权创建新 CAM 身份。
- [外部 AI/ASR 产生费用或暂时失败] → 限制并发/频率/样本数、无自动重试，遇余额或鉴权错误停止真实调用并如实记录。
- [日志遗漏问题细节] → 使用固定错误类别和 requestId 关联；需要排障时不临时打开正文、音频或上游响应日志。

## Migration Plan

1. 本地完成 OpenSpec、部署模板、健康/安全日志和测试；运行 check/build 并提交。
2. 只读记录 Lighthouse、DNS、Nginx、证书、端口、现有 release 与回滚目标；选择未占用的 3011/3012。
3. 创建 `suiyue.maicong.chat` A 记录，准备受限用户、目录、root-only 环境/认证文件；上传无秘密 release 并核对 SHA-256 和成员安全。
4. 在新 release 内 `npm ci`、`npm run build`，先通过回环端口验收；安装 systemd/Nginx 配置，签发证书，`nginx -t` 后原子启用并 reload。
5. 完成公网与重启验收，记录发布提交、真实调用次数、证书续期和未完成真机项。

回滚时将 `current` 指回记录的上一 release，`systemctl restart suiyue-web suiyue-gateway` 并验证健康；若首次部署无上一 release，则停止并禁用这两个服务、移除站点启用链接后 `nginx -t && reload`，保留 release、环境文件、证书和 DNS 供恢复。除非用户另行要求，不删除浏览器数据、服务器 release、证书或 DNS 记录。

## Open Questions

无阻塞问题。Basic Auth 的明文密码不会写入仓库或部署报告；最终通过既有私密渠道交付或由用户在服务器上轮换。真实手机麦克风和移动键盘需要用户持有设备完成，不能由桌面自动化替代。
