## MODIFIED Requirements

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
