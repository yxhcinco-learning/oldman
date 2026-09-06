> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

## MODIFIED Requirements

### Requirement: Versioned private application runtime
系统 MUST 将固定提交构建为独立 release，并以专用非登录用户和两个受 systemd 托管的回环进程运行运营网页与 Fastify 网关；进程 MUST 支持开机启动、异常重启、SIGTERM 优雅停止、健康检查和上一 release 回滚。持久化微信身份库、话题库与匿名用量库 MUST 位于 release 外并在迁移前分别检查和备份，部署不得停止或复用其他项目的服务、端口、目录或数据库。

#### Scenario: Activate a verified release
- **WHEN** 用户授权整体更新且新 release 通过哈希、依赖、构建、三份数据库备份/迁移和回环健康检查
- **THEN** `current` 原子指向该 release，仅重启授权的岁月有声网页和网关，两个进程只监听未占用的 `127.0.0.1` 端口并在异常后受限重启

#### Scenario: Activate only the gateway
- **WHEN** 用户仅授权后端网关更新
- **THEN** 使用独立已验证release与固定网关unit路径，备份旧unit/运行配置和三库，失败恢复旧网关；不切换网页current、不改网页unit或进程、不触发网页部署和小程序上传。分别记录两服务实际版本，回滚仅恢复网关且不回退已消费用量

#### Scenario: Release fails before or after activation
- **WHEN** 构建、任一数据库检查或迁移、健康检查、systemd 启动或公网验证失败
- **THEN** 不覆盖上一 release；恢复授权范围的版本指向、服务及同轮失败迁移前三份数据库，其他站点与数据保持不变，并分别隔离失败副本供排查

#### Scenario: Roll back code after successful data migration
- **WHEN** 已成功激活的新代码需要普通代码回滚
- **THEN** 回滚只切代码版本而不删除、覆盖或降级微信身份库、话题库与用量库，数据库恢复只用于失败迁移的同轮补救，已消费额度不得因回滚恢复

### Requirement: Fixed protected same-origin HTTPS
公网服务 MUST 只使用固定的 `https://suiyue.maicong.chat` 与对应 WSS，由 Nginx 在 80/443 提供 TLS、反向代理和分层访问保护；网页 `/`、原 `/api/ai/*` 与原 `/api/speech` MUST 继续受 Basic Auth 和精确浏览器 Origin 保护，小程序只能访问明确列出的只读话题、登录及 `/api/mini/*` 路由，其中在线业务 MUST 由 Fastify 验证 Bearer 会话或单次语音 ticket。应用端口不得通过云防火墙或公网地址开放。

#### Scenario: Authorized same-origin web use
- **WHEN** 体验者通过有效测试凭据打开 HTTPS 网页并调用原 AI 或语音路由
- **THEN** 页面、静态资源、API 和 WSS 均保持同一 Origin，网关看到精确允许的 Origin且浏览器不需要跨域配置

#### Scenario: Authenticated mini-program use
- **WHEN** 小程序通过已配置的 request/socket 合法域名调用登录、话题或 `/api/mini/*`
- **THEN** Nginx 只对这些精确位置关闭 Basic Auth，Fastify 在付费上游前验证业务会话或单次 ticket，不要求或伪造浏览器 Origin

#### Scenario: Missing credentials or untrusted request
- **WHEN** 网页缺少有效 Basic Auth、浏览器 Origin 不可信，或小程序受保护路由缺少有效业务会话/ticket
- **THEN** Nginx 或网关在连接上游前拒绝，不返回服务秘密、正文、音频、身份标识或详细上游响应

#### Scenario: HTTP or internal port request
- **WHEN** 访问测试域名的 HTTP 地址或尝试通过公网连接应用端口
- **THEN** HTTP 跳转至相同 HTTPS 域名，公网仅 80/443 可达，3011/3012 仍只在服务器回环监听

### Requirement: Proxy-layer temporary controls
网页测试期 Basic Auth MUST 继续位于反向代理层，并对普通请求及原 AI/语音入口提供简单按 IP 限流；小程序精确豁免路由 MUST 另有按 IP、业务用户、会话或 ticket 的相称限流。应用现有 AI 并发、频率、超时和 ASR 连接/时长/字节限制 MUST 保留。网页临时认证 SHALL 只创建有限的 `admin01`、`admin02` 类测试条目和各不相同的四位数字口令，明文只保存在本机受限私密交付文件中，服务器只保存 htpasswd 哈希；小程序不得复用这些口令，也不得新增可见账号、邀请码或密码流程。

独立 `/admin/topics` 与 `/api/admin/*` MUST 由应用管理员会话、Origin、CSRF 和登录限流保护，不得使用体验者 Basic Auth 或小程序业务会话作为后台授权。

#### Scenario: Access the independent editorial console
- **WHEN** 访问者打开后台页面或管理 API
- **THEN** Nginx转发且不使用体验者Basic Auth；任何管理读取、写入或AI调用前，应用验证独立后台身份和对应安全条件

#### Scenario: Request bursts exceed a bound
- **WHEN** 单一 IP、网页凭据、小程序用户或会话短时间超过代理或应用限制
- **THEN** 请求以 429 或连接拒绝结束，不自动调用外部服务、放宽限制或进入无上限重试

#### Scenario: Rotate temporary web access
- **WHEN** 网页测试凭据疑似泄露或体验人员发生变化
- **THEN** 管理者可只轮换服务器认证文件并验证 Nginx，无需发布新前端、迁移浏览器 IndexedDB、修改小程序 token 或改产品代码

#### Scenario: Validate simplified web test entries
- **WHEN** 部署者轮换为有限的易输入网页测试条目
- **THEN** 每个预期账号分别通过 HTTPS 认证，无效账号或口令仍返回 401，验证输出和验收记录不得包含四位数字明文

#### Scenario: Recover after mobile web authentication is cancelled
- **WHEN** 移动浏览器在原生 Basic Auth 对话框期间切到后台并把认证当作取消
- **THEN** 401 响应保留认证挑战并显示同源、无缓存的最小恢复页；页面回到前台至多自动重试一次，用户也可通过至少 48px 的“重新登录”操作再次触发原生认证框，且页面不得读取、保存或传输凭据到产品应用

#### Scenario: Use the mini program without Basic Auth
- **WHEN** 微信小程序调用一个被明确列入的 mini 路由
- **THEN** 请求不出现 Basic Auth 对话框，但登录路由受换码限流，AI 必须有 Bearer 会话，语音必须有已消费 ticket，未列出的 `/api/*` 仍拒绝

### Requirement: Server-only secrets and safe operations logs
Linux 网关 MUST 使用 `ASR_CREDENTIAL_SOURCE=project` 从 root-only 服务端环境文件加载腾讯云 ASR 凭据，并从同一文件加载 DeepSeek Key、微信小程序 AppID/AppSecret 和身份库路径；秘密不得进入 Git、网页或小程序客户端、构建包、release、命令输出或日志。操作日志 MUST 只记录 requestId、action、status、durationMs、可用的 tokens 和固定 errorCategory，不得记录正文、会话内容、音频、Key、AppSecret、OpenID、业务 token、Authorization、Cookie、语音 ticket、签名 URL 或上游私密响应。

独立后台审计 MAY 保存授权编辑actor及内容entity、动作、修订与时间，但不得保存密码、Cookie、CSRF、模型reasoning或上游私密响应；不把后台审计扩展为用户对话日志。

#### Scenario: Start with valid protected configuration
- **WHEN** root-only 环境文件包含完整项目来源 ASR 凭据、精确网页 Origin、有效 DeepSeek 配置、微信 AppID/AppSecret 和可写身份库路径
- **THEN** 健康及各 status 只报告非秘密运行/配置状态，网关能够按用户动作调用相应上游且日志只含允许字段

#### Scenario: WeChat configuration is absent
- **WHEN** 微信 AppID、AppSecret 或身份库路径缺失/无效但网页已有服务配置仍有效
- **THEN** 小程序换码端点失败关闭并返回非秘密配置错误，网页本地写作和已配置的原有能力不因假身份或 mock 继续，启动/健康状态不回显配置值

#### Scenario: Configuration or upstream failure
- **WHEN** 凭据缺失、网页 Origin 不匹配、小程序会话无效、上游鉴权/余额/网络/格式失败或请求超时
- **THEN** 请求返回不含秘密、身份与正文的受控错误，日志仅记录固定错误类别和状态，不回退 mock、不自动重试计费调用

### Requirement: Local-only article persistence across public testing
公网测试 MUST 继续把网页作品、会话和历史只保存在每位体验者当前 HTTPS Origin 的浏览器 IndexedDB，并 MUST 把小程序对应数据只保存在当前微信用户、AppID 和设备的本地用户文件；服务端只可保存最小微信身份与业务会话，不得接收用于同步或迁移的文章、聊天、素材、原音或备份。JSON 备份/恢复 MUST 继续作为显式人工迁移与恢复方式，不得自动上传 localhost、网页或临时 AppID 数据。

#### Scenario: First web visit from a new origin or device
- **WHEN** 同事首次打开固定测试网页域名
- **THEN** 其作品库从该 Origin 的空 IndexedDB 开始，看不到 localhost、其他域名、协议、端口或其他同事浏览器中的文章

#### Scenario: First mini-program visit under an AppID
- **WHEN** 用户首次以当前微信身份打开某个 AppID 的小程序
- **THEN** 作品库从该微信用户/AppID 隔离的本地空间开始，看不到网页、其他微信用户、其他 AppID 或设备中的文章，即使服务端识别到同一内部用户也不自动同步

#### Scenario: Save, refresh and back up
- **WHEN** 体验者在任一客户端新建文字、保存、重新打开并导出 JSON 备份
- **THEN** 内容只在该客户端本地恢复，备份由客户端显式交给用户；服务器不创建文章、聊天、音频或备份副本

### Requirement: Evidence-based controlled public verification
部署 MUST 在激活前确认回滚路径并运行相应 check/build；激活后 MUST 分别验证网页访问控制与同源能力、小程序换码与业务鉴权、TLS、静态资源、健康/status、两类 WebSocket、文字保存/恢复/备份、服务重启和失败路径。真实微信换码、DeepSeek/ASR 调用 MUST 使用少量非敏感短样本并记录次数；测试替身、配置状态、开发者工具或 WebSocket 握手不得冒充公网真实上游或真实 Android 微信成功，未执行的 iOS 验证不得冒充通过。

#### Scenario: Complete automated and bounded live checks
- **WHEN** 公网入口和服务已启动且外部账户可用并已授权低成本联调
- **THEN** 自动检查覆盖成功与拒绝路径，微信换码使用限定测试账号，AI 各代表性动作至多使用一次短样本，ASR 在当前纳入验收的平台仅使用必要短音频，并记录实际调用次数、结果和费用边界

#### Scenario: Provider or device check cannot complete
- **WHEN** 微信后台配置、外部服务余额/权限/网络失败，或当前验收需要的真实 Android 微信麦克风、系统键盘和后台切换无法完成
- **THEN** 停止重复付费调用，保持服务可回滚并将项目列为未完成，不以 mock、桌面尺寸、开发者工具或合成音频替代

#### Scenario: iOS device is outside the current acceptance gate
- **WHEN** 当前没有可用 iOS 设备且产品负责人明确只要求记录未验证状态
- **THEN** 验收记录 MUST 明确 iOS 未验证，不得声称 iOS 兼容性通过，也不得仅因缺少 iOS 设备阻塞当前 Android 范围的归档

#### Scenario: Upload or submission was not authorized
- **WHEN** 本地实现与体验版检查完成但用户没有明确授权上传、提审或发布
- **THEN** 只保留本地/验收证据和待办，不调用微信 upload、submit 或 release 能力，也不把临时 AppID 版本描述为已上线

## ADDED Requirements

### Requirement: Durable minimal identity state outside releases
服务端 SHALL 在 `/var/lib/suiyue-yousheng/auth.sqlite` 或显式配置的同类受限路径保存最小身份数据库，运行用户只能访问该项目目录；数据库 MUST 使用事务迁移、WAL/完整性检查和部署前备份，release 激活、回滚或清理不得删除或覆盖身份文件。

#### Scenario: Prepare the host for identity persistence
- **WHEN** 部署脚本首次启用小程序身份服务
- **THEN** 脚本创建并验证解析后的项目专用持久目录、所有者和权限，不把数据库放进 `/opt/suiyue-yousheng/releases/<version>` 或其他项目目录

#### Scenario: Migration fails
- **WHEN** 身份 schema 迁移、完整性检查、目录权限或备份失败
- **THEN** 新 release 不接流量且保持上一服务与数据库可恢复，不删除现有会话库或用空库替换

### Requirement: Manual WeChat secret handoff
仓库 SHALL 只在 `deploy/runtime.env.example` 提交空的 `WECHAT_MINIPROGRAM_APP_ID`、`WECHAT_MINIPROGRAM_APP_SECRET` 和安全的 `SUIYUE_AUTH_DB_PATH` 示例；真实 AppSecret 默认由用户手工写入服务器 `/etc/suiyue-yousheng/runtime.env`。用户明确授权代配置时，MAY 经受限临时文件和专用 SFTP 写入同一位置，保持 `0600 root:root`，备份旧配置并清理传输临时文件；不得将秘密放进客户端、Git、TAT 命令或日志，任何检查只能报告是否配置，不得读取后回显。

#### Scenario: Explicitly delegated credential setup
- **WHEN** 用户明确提供正式凭据并授权代理代配置及联调
- **THEN** 只切换本产品客户端 AppID 与服务端对应配置，保留旧配置及作品恢复路径；不回显秘密、不迁移身份、不隐含授权上传、提审或发布；聊天中已暴露的凭据应提示用户后续轮换

#### Scenario: Hand off implementation for manual secret entry
- **WHEN** 代码、模板和部署检查已经就绪
- **THEN** 交付说明明确给出 `/etc/suiyue-yousheng/runtime.env` 及待填变量名，仓库、本机 private config、命令历史和聊天内容中均没有真实 AppSecret

#### Scenario: Restart after secret entry
- **WHEN** 用户手工填入正确 AppID/AppSecret并按受控部署流程重启网关
- **THEN** 健康检查只显示微信换码“已配置/未配置”，随后以一次非敏感 code 验证真实换码且不输出秘密或 OpenID

### Requirement: Mini-program platform configuration and release gate
小程序体验或正式运行前 MUST 在对应微信公众平台配置精确 request/socket 合法域名、用户隐私保护指引、麦克风用途、AI 生成服务说明及所需备案/类目；临时 AppID MUST 只用于开发/体验版，正式 AppID 到位后 MUST 重新核对全部配置。上传、提审和发布分别需要用户明确授权。

#### Scenario: Domain or privacy configuration is incomplete
- **WHEN** 体验版无法调用 HTTPS/WSS、麦克风隐私接口被禁用或平台信息不完整
- **THEN** 系统和验收记录指出缺失的平台配置，不关闭校验、不把 AppSecret放入客户端、不通过未授权后台改动绕过

#### Scenario: Prepare the final AppID
- **WHEN** 用户提供正式 AppID、主体、类目与备案信息
- **THEN** 开发配置、服务器 AppID/AppSecret、合法域名、隐私与 AI 材料作为一组重新验证，临时 AppID 的 OpenID、体验版和本地数据不被当作正式环境证据

#### Scenario: Request a formal release
- **WHEN** 用户明确授权提审或发布且全部自动、平台与真机证据通过
- **THEN** 只上传已验证提交，记录版本和审核结果，不修改 `ask_job` 代码或发布其业务版本；任一必要证据缺失则保持待办

#### Scenario: Close the technical implementation separately
- **WHEN** 用户明确只要求本阶段完成程序，并自行负责主体、备案、类目和平台材料，且程序/接口及已约定真机验收已通过
- **THEN** 技术变更可同步归档，外部材料转入独立发布清单，不标记为合规或审核通过；上传、提审和发布仍需单独授权及当时完整核对
