## ADDED Requirements

### Requirement: Mini-program is the only active user client
项目 SHALL 只将原生微信小程序作为活跃用户客户端。H5 为退役试验端，独有 UI、账号互通、跨 H5 同步、四尺寸用户体验验收不再是后续产品目标；内部网页话题管理台、服务端和共享核心继续维护。

#### Scenario: Start a new development conversation
- **WHEN** 新会话读取 README、产品文档或 OpenSpec 上下文并制定计划
- **THEN** 以小程序为用户端，不能因为存有 React/H5 源码或旧双端条款而恢复 H5 开发与验收任务

#### Scenario: Plan cloud works and identity
- **WHEN** 后续规划账号、云端作品和跨设备同步
- **THEN** 面向同一账号的小程序设备，H5 登录绑定与账号同步不纳入范围；功能仍须独立规格与实施，不把规划视为已经上线

### Requirement: Archive history without retiring shared services
项目 SHALL 将 H5 专属源码、资源、测试、说明与验收归档，保留来源和可解析引用；活跃代码、构建和测试不得依赖或加载归档。管理台、服务端与小程序直接依赖共享核心，不经 H5 兼容层。H5 退役不授权停止服务器、删除后端兼容 API、数据、备份或身份，也不放宽鉴权。

#### Scenario: Encounter an H5 dependency
- **WHEN** 共享核心、后端或内部管理台仍依赖网页工程文件
- **THEN** 将依赖改为共享核心或独立管理台实现，验证后归档 H5 独有部分；归档不创建第二套活跃工程

#### Scenario: Build the active product
- **WHEN** 执行完整检查、测试和构建
- **THEN** 只编译运营后台、小程序及共享服务；H5 归档不被类型检查、Lint、测试发现或网页入口加载，根网页入口进入运营后台

#### Scenario: Recover an old local work
- **WHEN** 用户持有旧 H5 的 JSON 备份
- **THEN** 保留现有显式校验和导入副本兼容，不自动上传、迁移身份或清空原浏览器数据

### Requirement: Separate current tasks from historical evidence
项目 SHALL 修订活跃变更中的双端目标，将 H5 专属剩余任务记录为用户决定退役而取消，不能标为测试通过；保留小程序、共享、后端及真实设备待办，历史记录不能覆盖现行维护范围。

#### Scenario: Review unfinished work
- **WHEN** 审查统一会话或小程序变更的剩余任务
- **THEN** 不把 H5 体验缺口作为小程序交付门槛，也不因 H5 退役而假称保存安全、模型或新 AppID 的待验项完成
