# isolated-ai-demo Specification

## Purpose
定义产品化阶段保留的历史模拟组件与正式作品之间的副本隔离和退出恢复边界；正式文章助手行为由 `article-ai-session` 规范管理。
## Requirements
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
