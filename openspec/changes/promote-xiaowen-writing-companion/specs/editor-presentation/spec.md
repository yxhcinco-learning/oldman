## MODIFIED Requirements

### Requirement: Keep speech and layout boundaries
底部工具 SHALL 把“语音 / 文字”作为互斥输入方式，并通过分隔和单一“小文”操作表达文章级写作伙伴；三项均 MUST 采用设计规范图标、短标签、至少 48px 触控目标和完整可访问名称。工具栏 MUST 不再显示独立“聊天 / 优化”操作或未开放聊天提示。麦克风保持固定网格；小文接入 MUST 不改变语音录制/取消/待确认状态和本机访问边界，未确认 AI 结果与正文分离。

#### Scenario: Use the unified XiaoWen entry
- **WHEN** 用户查看编辑器底部工具栏并点击“小文”
- **THEN** 工具栏显示“语音 / 文字”输入分组和带叶片图标的“小文”操作，直接打开同篇文章会话；不显示“聊天”“优化”或“聊天功能暂未开放”，点击本身不发送请求或修改正文

#### Scenario: Pending or cancelled recording
- **WHEN** 语音仍待确认或用户取消本次录音
- **THEN** 已确认正文不被提前追加或替换，原待确认与取消流程继续生效；点击小文仍由文章 AI 的既有本地校验阻止请求，不隐藏或清空待确认内容

#### Scenario: Responsive editor
- **WHEN** 在 360×640、390×844、430×932 和桌面查看空白或长文编辑器
- **THEN** 正文无横向溢出，桌面画布最大 800px，语音/文字与小文入口、麦克风和安全区可见；三项布局不依赖缩小标签或触控目标，桌面回归不冒充真机录音或键盘验收

### Requirement: Keyboard-visible editor chrome
正式编辑器 SHALL 在系统键盘改变移动浏览器可视视口时按实际可见高度与顶部偏移约束应用画布；页头、正文滚动区、底部“语音 / 文字”输入方式与“小文”入口 MUST 保持在同一可视区域内，正文焦点和输入内容不得因适配丢失。不支持 Visual Viewport API 时 MUST 回退现有动态视口布局。

#### Scenario: Type with a mobile system keyboard
- **WHEN** 用户在文字模式聚焦标题或正文，系统键盘使可视视口高度缩小或顶部发生偏移
- **THEN** 页头和“语音 / 文字 / 小文”工具仍可见，正文在二者之间滚动且当前输入保持，不产生横向溢出；小文入口不因键盘状态自动打开或发送文章

#### Scenario: Keyboard closes or browser lacks the API
- **WHEN** 系统键盘关闭、浏览器工具栏变化，或环境不提供 Visual Viewport API
- **THEN** 画布恢复当前可见高度或使用 `100dvh` 回退，焦点、滚动内容、保存状态和小文入口状态保持，不加入模拟键盘
