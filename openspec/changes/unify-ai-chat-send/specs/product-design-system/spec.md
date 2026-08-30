## MODIFIED Requirements

### Requirement: Keep AI isolation visible
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、小文修改说明、待应用、已应用、失败与未开放能力；优化和改文反馈 SHALL 集中在文章会话中，修改说明与候选状态 MUST 分开显示。小文输入区 SHALL 只提供一个明确的主要发送操作，且 MUST 避免用常驻辅助文案重复解释相邻标题、按钮或状态；面向用户的记录名称、字数和时间 MUST 使用直白、适合长辈识别的措辞与精度。首次授权、错误补救、数据发送范围、事实核对及覆盖风险 MUST 保持可见。只有明确确认的候选或恢复版本 MUST 写入正文。从优化菜单进入的下级页面 MUST 保留入口上下文，关闭当前页面时返回优化菜单；直接聊天入口或优化菜单顶层关闭时才退出文章助手。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文会话入口；后三项待开放，菜单不直接编辑会话需求或展示分散的候选反馈，不提供与会话入口重复的“查看对话记录”

#### Scenario: Shortcut enters the conversation
- **WHEN** 用户选择常规优化、润色文笔或点击具有输入框外观的小文入口
- **THEN** 快捷优化进入会话并在其中显示生成过程和后续反馈；小文入口只导航到会话，实际输入框在会话中获得焦点，快捷优化的用户消息不得为空白

#### Scenario: Conversational action and result status
- **WHEN** 用户在会话输入文字，或一个候选从待应用变为已应用/未采用
- **THEN** 界面提供至少 48px 的单一“发送”操作；小文回答或修改说明保持独立，候选状态和查看结果位于独立区域，手机无横向溢出，候选不直接改变编辑器

#### Scenario: Modification record placement
- **WHEN** 用户需要从文章优化或会话查看修改记录
- **THEN** 优化菜单在会话入口之后只显示一个整行次级“修改记录”入口，会话顶部保留“查看修改记录”，不显示独立的对话记录按钮

#### Scenario: Remove repeated helper copy
- **WHEN** 标题、按钮或候选状态已经清楚表达当前操作
- **THEN** 界面不再用教学句重复解释相邻控件，空会话也不显示示例问法；必要的授权、错误、数据范围、事实核对和覆盖风险仍然可见

#### Scenario: Read modification records
- **WHEN** 用户打开文章的修改记录
- **THEN** 界面使用“修改记录”和“字”，时间显示到分钟，不展示正文为空的起始记录；字数、记录来源和恢复覆盖提示仍可见，底层会话记录不被删除

#### Scenario: Close according to the assistant entry
- **WHEN** 用户从文章优化进入会话或下级页面后点击关闭或按 Escape
- **THEN** 当前页面关闭并返回仍然打开的文章优化菜单，会话、候选和进行中的请求保持可用；用户在菜单再次关闭时才退出文章助手

#### Scenario: Close direct chat
- **WHEN** 用户从编辑器“聊天”直接进入小文会话后点击关闭或按 Escape
- **THEN** 文章助手退出并恢复编辑器入口焦点，不额外打开文章优化菜单
