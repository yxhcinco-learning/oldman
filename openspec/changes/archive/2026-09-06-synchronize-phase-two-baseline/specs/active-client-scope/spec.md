## MODIFIED Requirements

### Requirement: Separate current tasks from historical evidence
项目 SHALL 以 docs/STATUS.md 提供带核对日期的当前接手入口，链接技术证据、部署记录、发布清单与活跃 OpenSpec；历史验收和退役规格 MUST 明确归档，不将已关闭任务或旧原型布局作为当前要求。OpenSpec context SHALL 引用该入口，不复制容易滞后的 AppID 或阶段待办。

#### Scenario: Start phase two in a new conversation
- **WHEN** 新会话准备规划账号、云端作品与跨设备同步
- **THEN** 先核对当前状态与实际活跃变更，区分已完成技术收尾、未实施功能及独立发布待办；不重复索要已配置身份、不恢复 H5 或借用 AppID 依赖

#### Scenario: Preserve honest evidence
- **WHEN** 归档旧检查、取消的 H5 任务或未验证设备记录
- **THEN** 保留原证据及历史范围，未测 iOS、平台材料不标为通过；本地构建不冒充本轮线上或真机验收

## ADDED Requirements

### Requirement: Isolate local verification artifacts
正式类型、Lint、测试和依赖扫描 SHALL 排除退役归档、临时验收文件及生成运行包；保留活跃源码和正式验收脚本检查。清理 MUST NOT 删除临时目录中可能存在的用户备份、作品、身份或凭据。

#### Scenario: Run checks with local QA files present
- **WHEN** .tmp 或输出目录中留有一次性验收脚本
- **THEN** 完整检查只覆盖正式工程，临时脚本不进入正式类型/Lint，生成运行包仍由小程序专用构建校验验证

#### Scenario: Review retained compatibility
- **WHEN** 发现旧 JSON 导入、线上兼容 AI/语音/事件接口或回滚备份
- **THEN** 记录保留理由，不因 H5 退役移除接口、削弱鉴权或清空数据；删除须另行确认调用方与授权
