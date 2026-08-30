## ADDED Requirements

### Requirement: Keyboard-visible editor chrome
正式编辑器 SHALL 在系统键盘改变移动浏览器可视视口时按实际可见高度与顶部偏移约束应用画布；页头、正文滚动区和底部四项工具栏 MUST 保持在同一可视区域内，正文焦点和输入内容不得因适配丢失。不支持 Visual Viewport API 时 MUST 回退现有动态视口布局。

#### Scenario: Type with a mobile system keyboard
- **WHEN** 用户在文字模式聚焦标题或正文，系统键盘使可视视口高度缩小或顶部发生偏移
- **THEN** 页头和“语音 / 文字 / 聊天 / 优化”工具栏仍可见，正文在二者之间滚动且当前输入保持，不产生横向溢出

#### Scenario: Keyboard closes or browser lacks the API
- **WHEN** 系统键盘关闭、浏览器工具栏变化，或环境不提供 Visual Viewport API
- **THEN** 画布恢复当前可见高度或使用 `100dvh` 回退，焦点、滚动内容与保存状态保持，不加入模拟键盘

### Requirement: Collapsible article speech stage
正文语音模式 SHALL 默认展示明确的“收起语音输入”操作；收起 MUST 只压缩语音舞台并保留当前输入模式、已有正文和待确认转写，用户 MUST 能从压缩状态或已选中的“语音”工具重新展开。连接、录音或收尾活动期间 MUST 阻止隐藏关键状态。

#### Scenario: Collapse and reopen idle dictation
- **WHEN** 用户在默认展开的空闲语音面板点击“收起语音输入”，随后点击“展开语音输入”或已选中的“语音”工具
- **THEN** 语音舞台先压缩为不低于 48px 的展开入口，再恢复原麦克风、提示和固定网格；不请求麦克风、不新增转写或正文

#### Scenario: Preserve speech state and safety
- **WHEN** 用户已有待确认转写，或语音处于授权、连接、录音、收尾状态
- **THEN** 待确认文字继续保留并可清空/完成；活动状态下收起不可用，取消、页面隐藏和失败仍按既有规则释放资源
