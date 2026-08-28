# isolated-design-preview Specification

## Purpose

约定基于原版交互制作独立设计预览的范围、视觉一致性、模拟行为和本地交付边界。用于评审新设计，不替换正式应用或宣告正式设计验收。

## Requirements

### Requirement: Independent design preview
原型 SHALL 独立于正式应用，使用原版 mock 和内存状态，MUST 不导入真实存储、语音或服务端配置。

#### Scenario: Review without changing the product
- **WHEN** 用户写作、保存、聊天、优化或刷新原型
- **THEN** 只改变或重置预览内存，正式作品、配置、样式及线上站点均不改变

### Requirement: Consistent Echoes design
全部原型页面 SHALL 采用提供的统一色板、衬线标题、无衬线18px正文、柔和纸面、圆角及间距体系；移动端与最大800px桌面布局 MUST 可阅读操作。

#### Scenario: Navigate through primary screens
- **WHEN** 查看作品、文字/语音编辑、单段、聊天及全部优化弹层
- **THEN** 各页面视觉规则一致，主要操作不低于56px，焦点与减少动画模式可用

### Requirement: Preserve mock workflows
原型 SHALL 保留原版文字编辑、长按模拟转写、单段修改、聊天整理、各类优化、配图、撤销和内存保存。

#### Scenario: Record and confirm
- **WHEN** 按住约180ms并松开，或取消本次输入
- **THEN** 正常结束生成可修改的待确认文本，取消不写正文；转写区至少容纳3行，麦克风中心在状态间保持不变

#### Scenario: Edit and optimize
- **WHEN** 编辑正文或单段、完成聊天、应用或撤销模拟优化
- **THEN** 对应状态和内容可操作，不调用真实 AI 或麦克风；刷新恢复初始示例

### Requirement: Local preview delivery
预览 SHALL 仅在回环地址固定3004端口运行，不读取环境文件或暴露任意本机文件，并提供独立HTML产物及页面截图。

#### Scenario: Port or route is unavailable
- **WHEN** 端口被占用或请求未提供的资源路径
- **THEN** 明确启动失败或返回404，不自动切换端口、不开放目录读取或绑定外部地址
