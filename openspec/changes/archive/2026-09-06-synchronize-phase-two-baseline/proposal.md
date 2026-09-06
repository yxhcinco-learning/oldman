# Why

第一阶段技术收尾已完成，但入口文档、OpenSpec 注入上下文和部分旧规范仍描述待提供 AppID、活跃旧任务、暂停采访及 H5 演示。临时验收脚本也未完全排除于正式检查。第二阶段前需要准确、可接手的基线，避免新会话恢复退役需求或重复已完成任务。

# What Changes

- 建立当前状态与新会话接手入口，区分程序验收、线上版本、平台发布与未验证设备。
- 归档旧清理说明及退役演示规格；同步正式会话、话题、工程规范中的冲突条款和空 Purpose。
- 隔离临时文件与生成包的检查范围，补充文档引用及维护边界回归。
- 不改产品运行逻辑，不推进账号/云端作品/同步，不部署、不调用付费服务、不清理用户数据或凭据；保留旧备份和线上服务兼容接口。

# Capabilities

## New Capabilities

无。

## Modified Capabilities

- `active-client-scope`: 当前状态入口、历史规格退役和临时工具隔离规则。
- `article-ai-session`: 对齐统一会话、空正文输入、收起和 JSON v5 的已实现边界。
- `topic-guided-writing`: 对齐原始消息、访谈开关和收起保留行为。
- `project-foundation`: 用现行设计和正式配置替换原型/借用身份的陈旧要求。
- `local-writing`: 本机文件与旧备份兼容，已保存访谈不作为空稿清除。
- `product-design-system`、`editor-presentation`、`wechat-miniprogram-client`: 对齐长按语音、标题/全文编辑及原生键盘，不再要求 H5 样式依赖。

# Impact

影响文档、OpenSpec、检查配置及边界测试；无数据迁移、网络协议或依赖升级。完整 check/build 和文档引用检查提供本次证据，不把既有真机或线上记录当作本轮重测。
