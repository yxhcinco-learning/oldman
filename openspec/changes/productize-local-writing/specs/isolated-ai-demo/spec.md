## Scope

本能力记录产品化阶段的历史模拟实现，`isolated-ai-demo` 是既有规范标识，不将项目定位为 Demo。2026-08-28 用户确认的 `add-article-ai-session` 已将正式聊天/优化入口替换为真实文章会话与预览确认写回；以下要求仅适用于保留的旧模拟组件与独立测试，不限制新的正式入口，当前行为见 article-ai-session 规范。

## ADDED Requirements

### Requirement: Preserve mock interactions in a sandbox
系统 SHALL 保留聊天引导、模拟语音、聊天整理、优化各分类、配图、自定义要求及撤销，使用当前作品深副本并持续标注演示模式。

#### Scenario: Apply and undo in demo
- **WHEN** 演示中完成聊天或应用优化、配图并撤销
- **THEN** 只更新演示副本，不调用作品存储接口或真实 AI 服务

### Requirement: Exit restores real editing context
演示 SHALL 提供退出入口，保存动作必须为结束演示，真实作品和进入前编辑状态保持不变。

#### Scenario: Leave after changing demo content
- **WHEN** 演示中改写内容后退出或刷新
- **THEN** 真实内容仍是进入前的状态，模拟段落从未落入真实作品库
