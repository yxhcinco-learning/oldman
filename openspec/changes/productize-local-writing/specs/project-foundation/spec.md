## ADDED Requirements

### Requirement: Reversible scoped development
工程 SHALL 保留 demo-approved-v2 基线，仅修改 V2，遵循 AGENTS 和 OpenSpec，源码不包含缓存、密钥、原音或私密正文。

#### Scenario: Cleanup and verification
- **WHEN** 清理或重构 Demo
- **THEN** 每个验证小阶段主动本地提交；原 Demo 仅在备份验证后清理，线上站点不改变

### Requirement: Honest local delivery
工程 SHALL 固定 localhost:3001，并提供类型、Lint、单元、流程、构建和规范检查，外部验收不得自动宣称通过。

#### Scenario: Port conflict
- **WHEN** 3001 已被其他服务占用
- **THEN** 启动失败并报错，而非自动切换端口

#### Scenario: Missing external access
- **WHEN** 缺少 GitHub 权限或腾讯云凭据
- **THEN** 保留可交付的本地实现并将对应远程任务标记待办
