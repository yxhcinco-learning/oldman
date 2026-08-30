# 受控公网测试部署

本说明只适用于用户已授权的少量同事临时体验，不表示正式开放。固定入口为 `https://suiyue.maicong.chat`；测试期使用 Nginx Basic Auth，应用仍无账号、云端文章或跨设备同步。

## 固定拓扑与文件

- Lighthouse：`lhins-pg6lbxtx`（`ap-guangzhou`），只保留公网 80/443；SSH/TAT 管理边界不由本项目扩大。
- Nginx：TLS、Basic Auth、安全头、按 IP 限流；`/` → `127.0.0.1:3011`，`/api/ai/*`、`/api/health`、`/api/speech/status` 和 `/api/speech` → `127.0.0.1:3012`。
- systemd：`suiyue-web.service` 与 `suiyue-gateway.service`，专用无登录用户 `suiyue`，异常重启并响应 SIGTERM。
- release：`/opt/suiyue-yousheng/releases/<version>`；`current` 为活动版本，`previous` 为上次成功版本。
- 秘密：`/etc/suiyue-yousheng/runtime.env`，必须 `0600 root:root`；Basic Auth 文件 `/etc/nginx/suiyue-yousheng.htpasswd`，必须 `0640 root:www-data`。两者都不在 Git 或 release。

仓库模板位于 `deploy/`。`runtime.env.example` 只有字段形状；严禁填写后提交。Linux 固定 `ASR_CREDENTIAL_SOURCE=project` 和 `ASR_ALLOWED_ORIGIN=https://suiyue.maicong.chat`。运行账户不读取 Windows User 凭据。

## 发布顺序

1. 确认 Git 状态和固定提交，运行 `npm run check`、`npm run build`、敏感信息扫描与 `git diff --check`。
2. 用 `git archive` 从该提交生成单一压缩包；检查成员不得有绝对路径、`..`、`.git`、`.env.local`、密钥、node_modules、缓存、测试音频或用户数据，记录 SHA-256。
3. 通过专用 SFTP-only 账户上传；在 TAT 的 root 通道验证远端 SHA-256 后，先列成员再解压到新的 `/opt/suiyue-yousheng/releases/<version>`。不得覆盖现有 release。
4. 运行 `bash deploy/server/prepare-host.sh <release>`，只建立隔离账户/目录和 HTTP/ACME 配置。DNS 生效后使用现有 Certbot Nginx 账户为固定域名签发证书。
5. 通过不回显内容的本地脚本把完整 DeepSeek/腾讯云项目凭据和临时 Basic Auth 文件分别上传到 staging；TAT 只移动已知路径、设置 root 所有权与 0600/0640 权限，不在命令参数、输出或历史中出现明文。
6. 运行 `bash deploy/server/activate-release.sh <release>`。脚本在新目录执行锁文件安装和生产构建，安装/启用两个 systemd unit，切换 `current`，重启并检查 3011 首页和 3012 `/api/health`；失败时恢复上一个链接。
7. 运行 `bash deploy/server/enable-https.sh`；脚本要求证书和认证文件存在，`nginx -t` 成功后才 reload。

不在构建阶段加载秘密。不要将密码、环境文件内容、签名 URL 或用户材料放进 TAT 命令；TAT 历史可能保留命令和输出。

## 访问凭据与轮换

测试期只建立有限的 `admin01`、`admin02` 类账号，每个账号使用不同的四位数字口令。明文只保存到本机 Git 忽略、ACL 仅当前 Windows 用户可读写的 `.env.deploy-access`，不得写入聊天、Git、TAT 命令、日志或验收文档；用户从本机读取后通过自己的私密渠道发给同事。四位数字安全性较弱，仅适用于当前少量同事的临时测试，现有 HTTPS、Nginx 按 IP 限流及应用侧限流保持不变。

轮换时在本机为每个有限账号生成互不相同的新四位数字和 htpasswd 文件，按同一 SFTP 流程替换服务器 `/etc/nginx/suiyue-yousheng.htpasswd`，保持 `0640 root:www-data`，再运行 `nginx -t && systemctl reload nginx`。不需要重新构建应用，也不会影响 IndexedDB。产品不为临时测试增加登录页、Cookie 会话或专门的 401 页面；易记凭据避免首次输入时切后台复制，若主动取消浏览器原生认证框，刷新页面即可按标准 Basic Auth 流程重新触发认证。

## 健康、日志与证书

- 回环健康：`curl -fsS http://127.0.0.1:3012/api/health` 和 `curl -fsS http://127.0.0.1:3011/`。公网 `/api/health` 同样受 Basic Auth。
- 进程：`systemctl status suiyue-web suiyue-gateway`；只重启这两个 unit，不重启主机或其他项目。
- 安全日志：`journalctl -u suiyue-web -u suiyue-gateway`。网关事件仅允许 requestId、action、status、durationMs、tokens、errorCategory；该 Nginx 站点 access log 关闭，error log 使用 `/var/log/nginx/suiyue-yousheng-error.log` 并由现有 Nginx logrotate 处理；journald 使用服务器容量/轮转策略和 unit 级速率限制。
- 证书：现有 `certbot.timer` 自动续期；部署后运行只读续期配置检查，并在不影响其他证书的前提下验证 dry-run 或现有计时器状态。

## 验收与费用

公网依次验证无认证 401、有效认证首页、HTTPS/证书/静态资源/安全头、两个 status、WebSocket Upgrade、文字新建保存刷新、JSON 备份、AI 成功与失败、服务重启。浏览器尺寸覆盖 360×640、390×844、430×932 和桌面，并检查焦点与横向溢出。

DeepSeek 的常规优化、润色和文字追问各最多一次非敏感短样本；不测试精简、扩写、配图。ASR 只有在准备了短的非敏感 PCM 时最多一次真实合成音频；状态成功或 WebSocket Upgrade 不等于真实转写。遇鉴权、余额或网络错误停止重复调用，不自动充值或购买。真实 iOS/安卓麦克风、系统键盘、后台和网络切换必须由持有设备的用户另行记录。

## 数据与回滚

域名、协议和端口是 IndexedDB Origin 的一部分。公网测试首次访问是空库；localhost 或其他设备文章不会自动迁移，需用户手工导出 JSON 并在目标浏览器恢复为副本。服务器不接收文章库、备份、聊天或原音。

回滚前记录当前与 previous 的解析路径。正常回滚运行 `bash deploy/server/rollback.sh /opt/suiyue-yousheng/releases/<verified-version>`，只切换 `current`、重启两个服务并检查回环健康。首次部署没有上一版本时，停止并禁用两个岁月有声服务、恢复该站点部署前 Nginx 状态并在 `nginx -t` 后 reload；保留 release、秘密、证书和 DNS 供恢复，除非用户另行授权删除。
