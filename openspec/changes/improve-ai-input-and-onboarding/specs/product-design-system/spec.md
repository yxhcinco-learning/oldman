## ADDED Requirements

### Requirement: Accessible AI composer and optimization discovery
正式文章会话 SHALL 让输入框的完整聚焦状态在支持宽度内可见，并提供复用现有腾讯云链路的语音转文字入口；识别文字 MUST 先进入可编辑的会话输入框，不得自动发送文章 AI 请求或修改正文。编辑器 SHALL 在当前浏览器首次达到 80 个非空白正文字符时，于“优化”操作附近显示一次简短、可关闭的功能提示，并 MUST 避免重复打扰。

#### Scenario: Focus the conversation input
- **WHEN** 用户点击会话输入框或用键盘将焦点移入输入框
- **THEN** 输入框四边的聚焦样式完整可见，不被滚动容器裁切，也不产生横向溢出或布局跳动

#### Scenario: Dictate a conversation request
- **WHEN** 用户同意现有腾讯云语音说明后按住会话中的语音按钮说话并松开
- **THEN** 实时识别文字追加到当前输入框且仍可编辑；系统不自动发送、调用 DeepSeek 或修改文章正文

#### Scenario: Cancel or fail conversation dictation
- **WHEN** 用户取消、关闭会话、拒绝麦克风，或语音配置、连接、识别失败
- **THEN** 录音尽力终止，录音前的输入保持可用，错误以简短文字显示，用户仍可继续文字输入

#### Scenario: Show the optimization hint once
- **WHEN** 当前浏览器尚未展示过提示且有效正文首次达到 80 个非空白字符
- **THEN** “优化”按钮附近显示“写好一段后，点‘优化’，小文可以帮您整理语句、分段和标点。”及至少 48px 的关闭操作；提示不抢走正文焦点，并立即记为已展示

#### Scenario: Dismiss or revisit the optimization hint
- **WHEN** 用户关闭提示、点击优化、刷新、重新打开文章，或继续输入更多正文
- **THEN** 当前提示隐藏且该浏览器不再重复展示；`localStorage` 不可用时至少在当前挂载期间不重复显示
