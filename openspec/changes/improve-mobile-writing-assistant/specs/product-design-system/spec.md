## ADDED Requirements

### Requirement: Compact mobile optimization and conversation surfaces
文章优化菜单 SHALL 通过紧凑页头、间距和卡片层级尽量在常见手机的一屏弹窗内展示常规优化、四项按需修改和小文入口，同时 MUST 保留设计规范字号、未开放状态、修改记录、至少 48px 触控目标与短高度内部滚动。小文会话输入区 SHALL 采用紧凑消息输入布局，文本框从单行起随内容自适应增长至限定高度，超过上限后自身滚动；语音和发送操作 MUST 易达且不得遮挡文字。

#### Scenario: Open the full optimization menu on a phone
- **WHEN** 用户在 360×640、390×844 或 430×932 打开文章优化且系统键盘未弹出
- **THEN** 菜单优先完整展示常规优化、润色文笔、精简内容、扩写内容、添加配图和小文入口；没有重复教学文案或横向溢出，极短高度仍可内部滚动到全部入口

#### Scenario: Type a short or long conversation request
- **WHEN** 用户在小文会话输入一行或多行要求
- **THEN** 输入框初始只占紧凑高度并随文字平滑增高，达到限定行数后内部滚动；语音按钮、发送按钮、焦点边框和已输入文字持续可见

#### Scenario: Dictate and send from the compact composer
- **WHEN** 用户按住语音按钮完成转写后检查文字并点击发送，或语音配置/授权失败后改用文字
- **THEN** 识别文字只进入同一自适应输入框，不自动发送；发送仍为单一明确操作，失败提示不遮住输入或造成内容丢失
