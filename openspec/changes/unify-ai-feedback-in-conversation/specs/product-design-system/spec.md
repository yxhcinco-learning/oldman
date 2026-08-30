## MODIFIED Requirements

### Requirement: Keep AI isolation visible
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、小文修改说明、待应用、已应用、失败与未开放能力；优化和改文反馈 SHALL 集中在文章会话中，修改说明与候选状态 MUST 分开显示。小文输入区 SHALL 明确区分只读问答和对话式改文，只有明确确认的候选或恢复版本 MUST 写入正文。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文会话入口；后三项待开放，菜单不直接编辑会话需求或展示分散的候选反馈

#### Scenario: Shortcut enters the conversation
- **WHEN** 用户选择常规优化、润色文笔或点击具有输入框外观的小文入口
- **THEN** 快捷优化进入会话并在其中显示生成过程和后续反馈；小文入口只导航到会话，实际输入框在会话中获得焦点，快捷优化的用户消息不得为空白

#### Scenario: Conversational actions and result status
- **WHEN** 用户在会话输入区写下内容，或一个候选从待应用变为已应用/未采用
- **THEN** 界面同时提供至少 48px 的“问小文”和“调整文章”操作并说明区别；小文修改说明保持为独立回答，状态和查看结果操作位于独立区域，手机无横向溢出，候选不直接改变编辑器
