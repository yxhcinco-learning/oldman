## MODIFIED Requirements

### Requirement: Keep AI isolation visible
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、待采用、已采用、失败与未开放能力；小文输入区 SHALL 明确区分只读问答和对话式改文，只有明确确认的候选或恢复版本 MUST 写入正文。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文文字入口；后三项待开放，真实结果可预览、确认、撤销和追问

#### Scenario: Conversational actions
- **WHEN** 用户在小文输入区写下内容
- **THEN** 界面同时提供至少 48px 的“问小文”和“调整文章”操作并说明区别；手机无横向溢出，改文结果仍进入全文预览而不直接改变编辑器
