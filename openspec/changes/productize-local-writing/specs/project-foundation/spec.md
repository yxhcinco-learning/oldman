## ADDED Requirements

### Requirement: Approved V2 interface fidelity
工程 SHALL 以 demo-approved-v2 为界面回归基准；除已批准的真实状态和数据能力外，不新增功能或常驻入口，不因产品化改变原卡片、编辑器及语音区域的布局。

#### Scenario: Open the real work library
- **WHEN** 用户查看真实作品首页
- **THEN** 卡片沿用 V2 的内边距、标题和右对齐时间/继续写，不展示卡片更多按钮或下方回收站、体验 AI 演示快捷入口；时间按真实本地日期显示，状态不虚构完成进度

#### Scenario: Access approved data tools
- **WHEN** 用户打开 V2 原有的首页更多入口
- **THEN** 可以备份、恢复、管理及回收作品；关闭后首页结构不改变，既有作品数据不删除

#### Scenario: Write or enter a demo
- **WHEN** 用户编辑正文、单段或进入聊天/优化演示
- **THEN** 编辑器不增加保存工具行，保存状态复用原控件与反馈；单段提示和字数沿用 V2，演示仅保留必要隔离标识，不影响真实内容

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
