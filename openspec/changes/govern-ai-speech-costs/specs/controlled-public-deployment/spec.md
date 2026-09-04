## MODIFIED Requirements

### Requirement: Versioned private application runtime
系统 MUST 将固定提交构建为独立 release，并以专用非登录用户和两个受 systemd 托管的回环进程运行 Vinext 前端与 Fastify 网关；进程 MUST 支持开机启动、异常重启、SIGTERM 优雅停止、健康检查和上一 release 回滚。持久化微信身份库、话题库与匿名用量库 MUST 位于 release 外并在迁移前分别检查和备份，部署不得停止或复用其他项目的服务、端口、目录或数据库。

#### Scenario: Activate a verified release
- **WHEN** 新 release 通过哈希、依赖、构建、三份数据库备份/迁移和回环健康检查
- **THEN** `current` 原子指向该 release，仅重启岁月有声前端和网关，两个进程只监听未占用的 `127.0.0.1` 端口并在异常后受限重启

#### Scenario: Release fails before or after activation
- **WHEN** 构建、任一数据库检查或迁移、健康检查、systemd 启动或公网验证失败
- **THEN** 不覆盖上一 release；恢复 `current`、服务及同轮迁移前三份数据库到记录的前一状态，其他站点与数据保持不变，并分别隔离失败副本供排查

#### Scenario: Roll back code after successful data migration
- **WHEN** 已成功激活的新代码需要普通代码回滚
- **THEN** 回滚脚本切换 release 而不删除、覆盖或降级微信身份库、话题库与用量库，数据库恢复只用于失败迁移的同轮补救，已消费额度不得因回滚恢复

## ADDED Requirements

### Requirement: Protected production cost configuration
生产网关 MUST 从 root-only 环境文件读取绝对用量库路径、三类每日上限及可选估算单价；配置值 MUST 在启动时校验且不得进入普通健康响应、日志或前端公开状态，`/api/health` SHALL 只增加 `costGovernanceConfigured` 布尔值。

#### Scenario: Start with valid cost governance
- **WHEN** 生产环境配置 `/var/lib/suiyue-yousheng/usage.sqlite` 和合法的三类上限
- **THEN** 健康接口报告成本治理已配置，付费能力按各自凭据与预算共同开放，后台认证后可读取匿名当日快照

#### Scenario: Start without valid cost governance
- **WHEN** 用量路径为相对路径、任一必需上限缺失/非法或数据库不可用
- **THEN** 健康接口只报告成本治理未配置，DeepSeek 与腾讯调用失败关闭且不打印具体路径、阈值、单价或凭据，其他独立能力继续运行

