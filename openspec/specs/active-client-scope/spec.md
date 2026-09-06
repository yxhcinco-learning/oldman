# active-client-scope Specification

## Purpose
定义小程序唯一用户端、运营后台独立维护、共享服务与退役资料边界，以及当前状态与历史证据的分离规则；防止新会话恢复已退役需求或将未验证事项误记为完成。
## Requirements
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
项目 SHALL 以 docs/STATUS.md 提供带核对日期的当前接手入口，链接技术证据、部署记录、发布清单与活跃 OpenSpec；历史验收和退役规格 MUST 明确归档，不将已关闭任务或旧原型布局作为当前要求。OpenSpec context SHALL 引用该入口，不复制容易滞后的 AppID 或阶段待办。

#### Scenario: Start phase two in a new conversation
- **WHEN** 新会话准备规划账号、云端作品与跨设备同步
- **THEN** 先核对当前状态与实际活跃变更，区分已完成技术收尾、未实施功能及独立发布待办；不重复索要已配置身份、不恢复 H5 或借用 AppID 依赖

#### Scenario: Preserve honest evidence
- **WHEN** 归档旧检查、取消的 H5 任务或未验证设备记录
- **THEN** 保留原证据及历史范围，未测 iOS、平台材料不标为通过；本地构建不冒充本轮线上或真机验收

### Requirement: Isolate local verification artifacts
正式类型、Lint、测试和依赖扫描 SHALL 排除退役归档、临时验收文件及生成运行包；保留活跃源码和正式验收脚本检查。清理 MUST NOT 删除临时目录中可能存在的用户备份、作品、身份或凭据。

#### Scenario: Run checks with local QA files present
- **WHEN** .tmp 或输出目录中留有一次性验收脚本
- **THEN** 完整检查只覆盖正式工程，临时脚本不进入正式类型/Lint，生成运行包仍由小程序专用构建校验验证

#### Scenario: Review retained compatibility
- **WHEN** 发现旧 JSON 导入、线上兼容 AI/语音/事件接口或回滚备份
- **THEN** 记录保留理由，不因 H5 退役移除接口、削弱鉴权或清空数据；删除须另行确认调用方与授权
