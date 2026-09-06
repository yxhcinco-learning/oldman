## ADDED Requirements

### Requirement: Controlled publication ingress and schema compatibility
代理 SHALL 为发表设置、投稿、文章阅读及图片设置精确路径、方法和请求大小白名单，保留独立后台保护；账号库升级 schema 3 MUST 事务迁移并保持已有用户作品，更新备份和发行版本兼容检查。

#### Scenario: Old release targets upgraded database
- **WHEN** 旧版服务试图读取不支持的 schema 3
- **THEN** 兼容检查拒绝启动或回滚，不使用旧库覆盖新数据；本地构建及验证不代表授权部署
