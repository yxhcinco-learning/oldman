## ADDED Requirements

### Requirement: Explicit conversational rewrite
文章会话 SHALL 允许用户将文字作为本轮明确的改文要求，并与只读问答分开选择；改文 MUST 生成完整候选，经现有预览和确认流程后才可写入正文。

#### Scenario: Rewrite from the conversation
- **WHEN** 用户输入“让第二段更温暖”并选择调整文章
- **THEN** 系统以当前全文、相关历史和该要求生成完整候选及本轮说明，显示原文对照；确认前正文不变，确认后追加可撤销的对话调整版本

#### Scenario: Ask without rewriting
- **WHEN** 用户输入关于文章或历史的问题并选择问小文
- **THEN** 系统只回答和引用，不生成可应用正文，也不自动猜测为改文

#### Scenario: Constrained changes
- **WHEN** 用户要求删除、重排、加入本轮明确给出的事实，或调整文风
- **THEN** 候选只在明确范围内执行；文风可合理改变修辞、情绪色彩和不影响核心事实的氛围表达，并在说明中披露，未授权的人物关系、具体动作、时间地点、数字、对话和事件结果保持；不得把文章/历史指令或外部知识当作事实来源，标题不自动改变

#### Scenario: Retry, stale and unchanged rewrite
- **WHEN** 对话改文失败后重试、候选生成后正文已变化，或候选与原文相同
- **THEN** 重试保留原改文要求；过期候选不可应用；相同候选明确显示未产生修改，任何情况均不自动写回或重试计费

#### Scenario: Persist and restore conversational edits
- **WHEN** 对话改文被采用、放弃、取消或刷新后重新打开文章
- **THEN** 本机会话保留用户原要求、真实状态、输入版本和应用版本；JSON v2 可导出恢复这些关联，已有作品与旧备份无需迁移
