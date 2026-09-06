# 受控公网测试部署

本说明只适用于用户另行授权后的少量同事临时体验，不表示正式开放。固定入口为 `https://suiyue.maicong.chat`；测试期用户网页继续使用 Nginx Basic Auth，小程序只绕过明确列出的在线接口并使用自身业务会话，内部话题后台使用独立应用会话。应用仍无用户端可见注册、云端文章或跨设备同步。`build-topic-editorial-backend` 最初仅更新模板；2026-09-06 用户另行授权后，受控环境已激活 `00f8a46` 并补齐话题后台及用量保护配置，真实会话结果与未通过项见[统一会话验收](XIAOWEN-CONVERSATION-ACCEPTANCE.md)。

2026-09-06 18:36（Asia/Shanghai）受控测试站点更新至 `483d8f4`，回滚版本为 `fc9cdc0`。仅更新既有站点及共享服务，小程序未上传；发布验证与限制见[统一会话验收](XIAOWEN-CONVERSATION-ACCEPTANCE.md#受控测试站点更新2026-09-06-1836)。

## 固定拓扑与文件

- Lighthouse：`lhins-pg6lbxtx`（`ap-guangzhou`），只保留公网 80/443；SSH/TAT 管理边界不由本项目扩大。
- Nginx：TLS、安全头、按 IP 限流；用户网页 `/`、原 `/api/ai/*`、`/api/health`、`/api/speech/status`、原 `/api/speech` 和精确 `/api/operations/events` 保持 Basic Auth。匿名事件位置关闭 access log、保留 Origin 并使用独立 IP 限流；精确 `/api/topics`、安全 ID 形状的 `/api/topics/<id>`、已列出的小程序接口关闭 Basic Auth。`/admin/topics`、`/_next/static/*` 和 `/api/admin/*` 也关闭 Basic Auth，但后台页面由应用登录保护，管理 API 继续校验会话、精确 Origin、CSRF 和 JSON。未列出的 `/api/mini/*` 和其他 API 拒绝。
- systemd：`suiyue-web.service` 与 `suiyue-gateway.service`，专用无登录用户 `suiyue`，异常重启并响应 SIGTERM；网关在 `ProtectSystem=strict` 下只额外写入 `/var/lib/suiyue-yousheng`。
- release：`/opt/suiyue-yousheng/releases/<version>`；`current` 为活动版本，`previous` 为上次成功版本。
- 秘密：`/etc/suiyue-yousheng/runtime.env`，必须 `0600 root:root`；Basic Auth 文件 `/etc/nginx/suiyue-yousheng.htpasswd`，必须 `0640 root:www-data`。两者都不在 Git 或 release。
- release 外数据库：最小微信身份库 `/var/lib/suiyue-yousheng/auth.sqlite`、话题编辑库 `/var/lib/suiyue-yousheng/topics.sqlite` 与匿名付费用量库 `/var/lib/suiyue-yousheng/usage.sqlite`，父目录 `0700 suiyue:suiyue`；迁移前备份和失败迁移隔离副本分别在 root-only 的 `backups/` 与 `failed/`，均不随 release 清理。备份文件名用 `-auth` / `-topics` / `-usage` 区分。

仓库模板位于 `deploy/`。`runtime.env.example` 只有字段形状；严禁填写后提交。Linux 固定 `ASR_CREDENTIAL_SOURCE=project`、`ASR_ALLOWED_ORIGIN=https://suiyue.maicong.chat`，三库路径分别为 `/var/lib/suiyue-yousheng/auth.sqlite`、`topics.sqlite`、`usage.sqlite`；当前显式配置 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh` 以匹配体验包。付费用量按上海自然日使用文章 AI 1,000,000 token、话题 AI 1,100,000 token、语音 7,200 秒的默认上限；上线前应按实际预算复核，0 表示停用。三项估算单价可留空。微信凭据、`TOPIC_ADMIN_USERNAME`、`TOPIC_ADMIN_PASSWORD_HASH` 和 DeepSeek Key 在仓库模板中保持空白，必须由用户写入 root-only 服务器文件。管理员散列只用 `npm run admin:hash-password` 在交互式终端生成，不把明文放入命令参数。运行账户不读取 Windows User 凭据。

## 发布顺序

1. 确认 Git 状态和固定提交，运行 `npm run check`、`npm run build`、敏感信息扫描与 `git diff --check`。
2. 用 `git archive` 从该提交生成单一压缩包；检查成员不得有绝对路径、`..`、`.git`、`.env.local`、密钥、node_modules、缓存、测试音频或用户数据，记录 SHA-256。
3. 通过专用 SFTP-only 账户上传；在 TAT 的 root 通道验证远端 SHA-256 后，先列成员再解压到新的 `/opt/suiyue-yousheng/releases/<version>`。不得覆盖现有 release。
4. 运行 `bash deploy/server/prepare-host.sh <release>`，建立隔离账户、`0700` 数据/备份/隔离目录和 HTTP/ACME 配置；脚本核对解析路径、所有者和权限。DNS 生效后使用现有 Certbot Nginx 账户为固定域名签发证书。
5. 通过不回显内容的本地脚本把完整 DeepSeek/腾讯云项目凭据和临时 Basic Auth 文件分别上传到 staging；TAT 只移动已知路径、设置 root 所有权与 0600/0640 权限，不在命令参数、输出或历史中出现明文。用户再自行编辑 `/etc/suiyue-yousheng/runtime.env`，填写微信凭据、三库路径、三项每日上限、管理员用户名和 scrypt 散列；可选估算单价必须以当前供应商页面为依据，不确定时留空。不得把值发到聊天或命令行。密码轮换后现有后台会话会自动失效。
6. 运行 `bash deploy/server/activate-release.sh <release>`。脚本先完成锁文件安装和生产构建，再停止网关，对已有身份库、话题库与用量库分别运行 `quick_check`、schema 上限检查和 SQLite 在线备份；随后安装 systemd unit、切换 `current`、重启，并要求身份/话题及 `costGovernanceConfigured` 健康布尔值为 true。迁移、权限、健康或构建失败时恢复上一链接；若已尝试迁移，则把三库的失败态分别转入 root-only 隔离目录并恢复各自迁移前副本，不用空库覆盖旧数据。
7. 运行 `bash deploy/server/enable-https.sh`；脚本要求证书和认证文件存在，将 root-owned 静态认证恢复页安装到 `/var/www/suiyue-yousheng`，并在 `nginx -t` 成功后才 reload。
8. 运行 `bash deploy/server/verify-host.sh`：核对3011/3012只监听回环、用户网页401挑战、公开话题免 Basic、后台页面可加载但未登录管理 API 为401、空登录失败、四个小程序拒绝路径、未列出API、三库完整性和网关重启 inode 持久性，并对最近服务日志做不回显的敏感标记扫描。该脚本不验证有效 Basic Auth 或有效后台密码，也不调用真实微信、DeepSeek、腾讯ASR或麦克风；这些仍从受控外部客户端单独完成。

不在构建阶段加载秘密。不要将密码、环境文件内容、签名 URL 或用户材料放进 TAT 命令；TAT 历史可能保留命令和输出。

## 访问凭据与轮换

测试期只建立有限的 `admin01`、`admin02` 类账号，每个账号使用不同的四位数字口令。明文只保存到本机 Git 忽略、ACL 仅当前 Windows 用户可读写的 `.env.deploy-access`，不得写入聊天、Git、TAT 命令、日志或验收文档；用户从本机读取后通过自己的私密渠道发给同事。四位数字安全性较弱，仅适用于当前少量同事的临时测试，现有 HTTPS、Nginx 按 IP 限流及应用侧限流保持不变。

轮换时在本机为每个有限账号生成互不相同的新四位数字和 htpasswd 文件，按同一 SFTP 流程替换服务器 `/etc/nginx/suiyue-yousheng.htpasswd`，保持 `0640 root:www-data`，再运行 `nginx -t && systemctl reload nginx`。不需要重新构建应用，也不会影响 IndexedDB。

移动浏览器在原生认证框期间切后台，可能把认证当作取消。前端页面路径的 401 因此由 Nginx 内部位置返回最小恢复页：响应仍为 401、保留 `WWW-Authenticate`、设置 `Cache-Control: no-store`，页面回到前台时至多自动重新请求一次，并保留至少 48px 的“重新登录”按钮。恢复页不包含账号密码输入，不读取或保存凭据，也不引入 Cookie 会话、产品账号或数据库；API/WebSocket 未认证仍使用原 401 拒绝响应。

话题后台账号与上述用户网页 Basic Auth 完全独立，只配置一名编辑。登录成功签发 HttpOnly、SameSite、生产 Secure 的随机 Cookie，服务端只保存散列；退出、到期或更换用户名/密码散列会让旧会话失效。后台密码不得复用四位体验口令，也不得写入 `.env.deploy-access`；只保留 scrypt 散列。Nginx 不读取后台凭据，不能用 Basic Auth 成功冒充后台登录。

## 健康、日志与证书

- 回环健康：`curl -fsS http://127.0.0.1:3012/api/health` 和 `curl -fsS http://127.0.0.1:3011/`。网关健康只报告 AI、ASR、微信身份、话题与用量保护是否配置，不能证明上游成功；激活话题后台必须看到 `miniIdentityConfigured`、`topicsConfigured`、`topicAiConfigured`、`topicAdminConfigured`、`costGovernanceConfigured` 均为 true。公网 `/api/health` 仍受 Basic Auth，响应不包含路径、账号、限额或秘密。
- 进程：`systemctl status suiyue-web suiyue-gateway`；只重启这两个 unit，不重启主机或其他项目。
- 安全日志与监控：`journalctl -u suiyue-web -u suiyue-gateway`。单条网关日志仅允许 requestId、action、status、durationMs、tokens、errorCategory；后台“运行监控”的15/60分钟与生命周期运营聚合仍随重启清空，付费用量区则从 `usage.sqlite` 读取匿名日汇总并跨重启保留。该库不保存用户标识、正文、引子、链接、音频或转写。该 Nginx 站点 access log 关闭，小程序 ticket WSS 与匿名事件位置再次显式关闭，error log 使用 `/var/log/nginx/suiyue-yousheng-error.log` 并由现有 Nginx logrotate 处理；journald 使用服务器容量/轮转策略和 unit 级速率限制。检查脚本只报告是否命中禁止标记，不输出可疑原行。
- 证书：现有 `certbot.timer` 自动续期；部署后运行只读续期配置检查，并在不影响其他证书的前提下验证 dry-run 或现有计时器状态。

## 验收与费用

公网依次验证无认证用户网页401仍带认证挑战和无缓存恢复页、有效认证首页、匿名事件无 Basic Auth 时 401/带认证后严格 schema 与限流、内部恢复地址不可直接访问、公开话题不弹 Basic、后台页面可加载但管理数据和运行监控必须登录、错误后台密码/Origin/CSRF/JSON 拒绝、有效后台登录和退出、无效业务 token 的AI/语音票据401、无效 ticket 的WSS 401、未列出API 404、HTTPS/证书/安全头、状态接口、三库重启后 inode/完整性、文字新建保存刷新及JSON备份。有效微信换码只允许一次非敏感体验账号并且输出不得出现 OpenID/code/token。用户端浏览器覆盖 360×640、390×844、430×932 和桌面；后台覆盖1280×900、1440×900和390×844，并检查焦点与横向溢出。

DeepSeek 的常规优化、润色和文字追问各最多一次非敏感短样本；话题候选只允许一次明确开启的 Responses + web search 样本，并记录顶层请求数、搜索调用数、token 和估算费用。不测试精简、扩写、配图。ASR 只有在准备了短的非敏感 PCM 时最多一次真实合成音频；状态成功或 WebSocket Upgrade 不等于真实转写。遇鉴权、余额或网络错误停止重复调用，不自动充值或购买。真实 iOS/安卓麦克风、系统键盘、后台和网络切换必须由持有设备的用户另行记录。

## 数据与回滚

域名、协议和端口是 IndexedDB Origin 的一部分；微信用户、AppID 和设备共同决定小程序本地文件空间。公网或临时 AppID 首次访问是空库，其他位置文章不会自动迁移，需用户手工导出 JSON 并恢复为副本。服务器不接收文章库、备份、聊天或原音；身份库只保存最小微信身份与会话哈希，话题库保存编辑内容、修订、生成元数据、席位、后台会话散列和审计，用量库只保存三类匿名日汇总与活动预留。七类匿名运营事件仍只形成当前网关进程内的有界计数，不写入数据库或 release。

回滚前记录当前与 previous 的解析路径。正常回滚运行 `bash deploy/server/rollback.sh /opt/suiyue-yousheng/releases/<verified-version>`：先对身份库、话题库和用量库做完整性/schema 上限检查，再切换 `current`、重启两个服务并复查；脚本不恢复、不删除也不覆盖数据。若旧代码无法启动则自动切回原 release，三库保持原样。激活期间发生迁移失败时才使用本次三个 root-only 备份分别恢复，失败迁移文件留在 `failed/` 供诊断。首次部署没有上一版本时，停止并禁用两个岁月有声服务、恢复该站点部署前 Nginx 状态并在 `nginx -t` 后 reload；保留 release、三库及备份、秘密、证书和 DNS 供恢复，除非用户另行授权删除。
