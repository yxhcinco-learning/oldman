## ADDED Requirements

### Requirement: Compact mobile optimization and conversation surfaces
文章优化菜单 SHALL 通过紧凑页头与清晰卡片层级尽量在常见手机的一屏弹窗内展示常规优化、四项按需修改和小文入口，同时 MUST 在主卡、分区、功能卡和会话入口之间保留可辨识的舒适留白，并保留设计规范字号、未开放状态、修改记录、至少 48px 触控目标与短高度内部滚动。小文会话输入区 SHALL 采用紧凑消息输入布局，空值 MUST 固定单行高度且不因提示词换行增高，真实输入随内容自适应增长至限定高度，超过上限后自身滚动；语音和发送操作 MUST 易达且不得遮挡文字。

#### Scenario: Open the full optimization menu on a phone
- **WHEN** 用户在 360×640、390×844 或 430×932 打开文章优化且系统键盘未弹出
- **THEN** 菜单优先完整展示常规优化、润色文笔、精简内容、扩写内容、添加配图和小文入口；卡片不贴挤、分区关系清楚、入口文案不因过长产生额外行，没有横向溢出，极短高度仍可内部滚动到全部入口

#### Scenario: Type a short or long conversation request
- **WHEN** 用户打开空的小文会话输入框，或输入一行及多行要求
- **THEN** 空输入框使用精简提示词并固定 52px，不因提示词测量增高；真实文字使输入框平滑增高，达到限定行数后内部滚动，语音按钮、发送按钮、焦点边框和已输入文字持续可见；输入条下方只保留8px基础间距或更大的系统安全区，不叠加固定大块留白

#### Scenario: Dictate and send from the compact composer
- **WHEN** 用户点按小文语音按钮开始转写，再次点按取消采集后检查文字并点击发送，或语音配置/授权失败后改用文字
- **THEN** 麦克风会话被释放，已显示的识别文字保留在同一自适应输入框且不会自动发送；发送仍为单一明确操作，失败提示不遮住输入或造成内容丢失

### Requirement: Reserved toolbar chat entry
正式编辑器工具栏的“聊天”入口 SHALL 保持可识别但不得复用当前小文会话。用户点击后 MUST 显示“聊天功能暂未开放”的短暂状态提示，且 MUST NOT 打开对话窗口、创建会话或发起 AI 请求。优化弹窗内的小文入口 SHALL 继续按既有行为打开会话。

#### Scenario: Tap toolbar chat before the feature is available
- **WHEN** 用户点击编辑器底部工具栏“聊天”
- **THEN** 当前页面显示“聊天功能暂未开放”，编辑器内容与焦点保持，不打开小文会话且不产生网络请求

#### Scenario: Enter XiaoWen from optimization
- **WHEN** 用户打开“优化”并点击小文入口
- **THEN** 系统仍进入现有小文会话，允许文字输入、点按语音转写和显式发送

### Requirement: Distinct keyboard icon for text mode
编辑器工具栏“文字”页签 SHALL 使用键盘轮廓图标，MUST 保持“文字”标签、选中状态、点击行为和“文字输入”可访问名称不变，不得与待确认内容使用的铅笔修改图标混淆。

#### Scenario: Inspect or select text mode
- **WHEN** 用户查看编辑器工具栏或点击“文字”页签
- **THEN** 页签显示键盘图标并切换到现有当前页全文输入；语音、聊天和优化图标及行为不变
