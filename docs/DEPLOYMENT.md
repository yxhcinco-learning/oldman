# 受控公网测试部署

本说明只适用于用户已授权的少量同事临时体验，不表示正式开放。固定入口为 `https://suiyue.maicong.chat`；测试期网页继续使用 Nginx Basic Auth，小程序只绕过明确列出的在线接口并使用自身业务会话，应用仍无可见注册、云端文章或跨设备同步。

## 固定拓扑与文件

- Lighthouse：`lhins-pg6lbxtx`（`ap-guangzhou`），只保留公网 80/443；SSH/TAT 管理边界不由本项目扩大。
- Nginx：TLS、安全头、按 IP 限流；网页 `/`、原 `/api/ai/*`、`/api/health`、`/api/speech/status` 和原 `/api/speech` 保持 Basic Auth。仅精确 `/api/topics`、安全 ID 形状的 `/api/topics/<id>`、`/api/mini/auth/wechat`、`/api/mini/ai/turn`、`/api/mini/speech-ticket`、`/api/mini/speech` 关闭 Basic Auth并分别限流；未列出的 `/api/mini/*` 和其他 API 拒绝。
- systemd：`suiyue-web.service` 与 `suiyue-gateway.service`，专用无登录用户 `suiyue`，异常重启并响应 SIGTERM；网关在 `ProtectSystem=strict` 下只额外写入 `/var/lib/suiyue-yousheng`。
- release：`/opt/suiyue-yousheng/releases/<version>`；`current` 为活动版本，`previous` 为上次成功版本。
- 秘密：`/etc/suiyue-yousheng/runtime.env`，必须 `0600 root:root`；Basic Auth 文件 `/etc/nginx/suiyue-yousheng.htpasswd`，必须 `0640 root:www-data`。两者都不在 Git 或 release。
- 最小身份库：`/var/lib/suiyue-yousheng/auth.sqlite`，父目录 `0700 suiyue:suiyue`；迁移前备份和失败迁移隔离副本分别在 root-only 的 `backups/` 与 `failed/`，均不随 release 清理。

仓库模板位于 `deploy/`。`runtime.env.example` 只有字段形状；严禁填写后提交。Linux 固定 `ASR_CREDENTIAL_SOURCE=project`、`ASR_ALLOWED_ORIGIN=https://suiyue.maicong.chat`、`SUIYUE_AUTH_DB_PATH=/var/lib/suiyue-yousheng/auth.sqlite`，当前显式配置 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh` 以匹配体验包；以后切换模型只重启 `suiyue-gateway`。`WECHAT_MINIPROGRAM_APP_ID` 与 `WECHAT_MINIPROGRAM_APP_SECRET` 在仓库模板中保持空白，必须由用户手工写入服务器文件。运行账户不读取 Windows User 凭据。

## 发布顺序

1. 确认 Git 状态和固定提交，运行 `npm run check`、`npm run build`、敏感信息扫描与 `git diff --check`。
2. 用 `git archive` 从该提交生成单一压缩包；检查成员不得有绝对路径、`..`、`.git`、`.env.local`、密钥、node_modules、缓存、测试音频或用户数据，记录 SHA-256。
3. 通过专用 SFTP-only 账户上传；在 TAT 的 root 通道验证远端 SHA-256 后，先列成员再解压到新的 `/opt/suiyue-yousheng/releases/<version>`。不得覆盖现有 release。
4. 运行 `bash deploy/server/prepare-host.sh <release>`，建立隔离账户、`0700` 身份/备份/隔离目录和 HTTP/ACME 配置；脚本核对解析路径、所有者和权限。DNS 生效后使用现有 Certbot Nginx 账户为固定域名签发证书。
5. 通过不回显内容的本地脚本把完整 DeepSeek/腾讯云项目凭据和临时 Basic Auth 文件分别上传到 staging；TAT 只移动已知路径、设置 root 所有权与 0600/0640 权限，不在命令参数、输出或历史中出现明文。用户再自行编辑 `/etc/suiyue-yousheng/runtime.env`，填写 `WECHAT_MINIPROGRAM_APP_ID` 和 `WECHAT_MINIPROGRAM_APP_SECRET`，不得把值发到聊天或命令行。
6. 运行 `bash deploy/server/activate-release.sh <release>`。脚本先完成锁文件安装和生产构建，再停止网关，对已有身份库运行 `quick_check` 和 SQLite 备份；随后安装 systemd unit、切换 `current`、重启并要求健康信息为 `miniIdentityConfigured=true`。迁移、权限、健康或构建失败时恢复上一链接；若已尝试迁移，则先把失败库转入 root-only 隔离目录并恢复迁移前副本，不用空库覆盖旧会话。
7. 运行 `bash deploy/server/enable-https.sh`；脚本要求证书和认证文件存在，将 root-owned 静态认证恢复页安装到 `/var/www/suiyue-yousheng`，并在 `nginx -t` 成功后才 reload。
8. 运行 `bash deploy/server/verify-host.sh`：核对3011/3012只监听回环、网页401挑战、话题免Basic、四个小程序拒绝路径、未列出API、身份库完整性和网关重启持久性，并对最近服务日志做不回显的敏感标记扫描。该脚本不验证有效 Basic Auth，也不调用真实微信、DeepSeek、腾讯ASR或麦克风；这些仍从受控外部客户端单独完成。

不在构建阶段加载秘密。不要将密码、环境文件内容、签名 URL 或用户材料放进 TAT 命令；TAT 历史可能保留命令和输出。

## 访问凭据与轮换

测试期只建立有限的 `admin01`、`admin02` 类账号，每个账号使用不同的四位数字口令。明文只保存到本机 Git 忽略、ACL 仅当前 Windows 用户可读写的 `.env.deploy-access`，不得写入聊天、Git、TAT 命令、日志或验收文档；用户从本机读取后通过自己的私密渠道发给同事。四位数字安全性较弱，仅适用于当前少量同事的临时测试，现有 HTTPS、Nginx 按 IP 限流及应用侧限流保持不变。

轮换时在本机为每个有限账号生成互不相同的新四位数字和 htpasswd 文件，按同一 SFTP 流程替换服务器 `/etc/nginx/suiyue-yousheng.htpasswd`，保持 `0640 root:www-data`，再运行 `nginx -t && systemctl reload nginx`。不需要重新构建应用，也不会影响 IndexedDB。

移动浏览器在原生认证框期间切后台，可能把认证当作取消。前端页面路径的 401 因此由 Nginx 内部位置返回最小恢复页：响应仍为 401、保留 `WWW-Authenticate`、设置 `Cache-Control: no-store`，页面回到前台时至多自动重新请求一次，并保留至少 48px 的“重新登录”按钮。恢复页不包含账号密码输入，不读取或保存凭据，也不引入 Cookie 会话、产品账号或数据库；API/WebSocket 未认证仍使用原 401 拒绝响应。

## 健康、日志与证书

- 回环健康：`curl -fsS http://127.0.0.1:3012/api/health` 和 `curl -fsS http://127.0.0.1:3011/`。网关健康只报告 AI、ASR、微信身份是否配置，不能证明上游成功；小程序发布阶段必须看到 `miniIdentityConfigured=true`。公网 `/api/health` 仍受 Basic Auth。
- 进程：`systemctl status suiyue-web suiyue-gateway`；只重启这两个 unit，不重启主机或其他项目。
- 安全日志：`journalctl -u suiyue-web -u suiyue-gateway`。网关事件仅允许 requestId、action、status、durationMs、tokens、errorCategory；该 Nginx 站点 access log 关闭，小程序 ticket WSS 位置再次显式关闭，error log 使用 `/var/log/nginx/suiyue-yousheng-error.log` 并由现有 Nginx logrotate 处理；journald 使用服务器容量/轮转策略和 unit 级速率限制。检查脚本只报告是否命中禁止标记，不输出可疑原行。
- 证书：现有 `certbot.timer` 自动续期；部署后运行只读续期配置检查，并在不影响其他证书的前提下验证 dry-run 或现有计时器状态。

## 验收与费用

公网依次验证无认证网页401仍带认证挑战和无缓存恢复页、有效认证首页、内部恢复地址不可直接访问、话题不弹Basic、登录无效载荷400、无效业务 token 的AI/语音票据401、无效 ticket 的WSS 401、未列出API 404、HTTPS/证书/安全头、两个 status、身份库重启后 inode/完整性、文字新建保存刷新及JSON备份。有效微信换码只允许一次非敏感体验账号并且输出不得出现 OpenID/code/token。浏览器尺寸覆盖 360×640、390×844、430×932 和桌面，并检查焦点与横向溢出。

DeepSeek 的常规优化、润色和文字追问各最多一次非敏感短样本；不测试精简、扩写、配图。ASR 只有在准备了短的非敏感 PCM 时最多一次真实合成音频；状态成功或 WebSocket Upgrade 不等于真实转写。遇鉴权、余额或网络错误停止重复调用，不自动充值或购买。真实 iOS/安卓麦克风、系统键盘、后台和网络切换必须由持有设备的用户另行记录。

## 数据与回滚

域名、协议和端口是 IndexedDB Origin 的一部分；微信用户、AppID 和设备共同决定小程序本地文件空间。公网或临时 AppID 首次访问是空库，其他位置文章不会自动迁移，需用户手工导出 JSON 并恢复为副本。服务器不接收文章库、备份、聊天或原音，只保存最小身份与会话哈希。

回滚前记录当前与 previous 的解析路径。正常回滚运行 `bash deploy/server/rollback.sh /opt/suiyue-yousheng/releases/<verified-version>`：先校验身份库，再切换 `current`、重启两个服务并复查库；若旧代码无法启动则自动切回原 release，身份库保持原样。激活期间发生迁移失败时使用本次 root-only 备份恢复，失败迁移文件留在 `failed/` 供诊断。首次部署没有上一版本时，停止并禁用两个岁月有声服务、恢复该站点部署前 Nginx 状态并在 `nginx -t` 后 reload；保留 release、身份库/备份、秘密、证书和 DNS 供恢复，除非用户另行授权删除。
