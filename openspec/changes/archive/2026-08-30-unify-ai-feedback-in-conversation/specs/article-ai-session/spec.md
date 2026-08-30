## MODIFIED Requirements

### Requirement: Two constrained full article optimizations
系统 SHALL 提供常规优化和润色文笔；前者处理通顺、分段、错别字与标点，后者改善用词、描写和节奏；二者 MUST 保留事实、原意和文体，不新增事实，不自动改标题。快捷操作的生成进度、修改说明、候选状态和查看入口 SHALL 进入同篇文章会话。

#### Scenario: Generate a candidate
- **WHEN** 用户对已确认的非空正文选择任一优化
- **THEN** 界面进入文章会话，使用当前全文生成完整候选和修改说明；生成完成后停留会话并显示查看候选入口，当前正文不立即改变，用户进入全文预览后可查看原文并决定应用或放弃

#### Scenario: Invalid or incomplete result
- **WHEN** 上游失败、输出被截断、结果为空或格式无效
- **THEN** 会话中提供明确错误和显式重试入口，原文不变，不回退模拟文本

#### Scenario: Unchanged candidate
- **WHEN** 返回的候选与本轮原文完全一致
- **THEN** 会话显示保留原文、未产生正文修改，不采用模型声称已修改的说明

### Requirement: Explicit conversational rewrite
文章会话 SHALL 允许用户将文字作为本轮明确的改文要求，并与只读问答分开选择；改文 MUST 生成完整候选，经现有预览和确认流程后才可写入正文。模型返回的修改说明 MUST 作为小文回答独立显示，候选采纳状态 MUST 不覆盖或替代该说明。

#### Scenario: Rewrite from the conversation
- **WHEN** 用户输入“让第二段更温暖”并选择调整文章
- **THEN** 系统以当前全文、相关历史和该要求生成完整候选及本轮说明，停留在会话并显示说明、独立状态和查看结果入口；确认前正文不变，确认后追加可撤销的对话调整版本

#### Scenario: Ask without rewriting
- **WHEN** 用户输入关于文章或历史的问题并选择问小文
- **THEN** 系统只回答和引用，不生成可应用正文，也不自动猜测为改文

#### Scenario: Constrained changes
- **WHEN** 用户要求删除、重排、加入本轮明确给出的事实，或调整文风
- **THEN** 候选只在明确范围内执行；文风可合理改变修辞、情绪色彩和不影响核心事实的氛围表达，并在说明中披露，未授权的人物关系、具体动作、时间地点、数字、对话和事件结果保持；不得把文章/历史指令或外部知识当作事实来源，标题不自动改变

#### Scenario: Candidate state changes
- **WHEN** 候选处于待应用、已应用或未采用状态
- **THEN** 会话始终保留同一条小文修改说明，并在独立区域显示当前状态；应用或放弃只改变正文与状态，不把说明替换成状态文字

#### Scenario: Retry, stale and unchanged rewrite
- **WHEN** 对话改文失败后重试、候选生成后正文已变化，或候选与原文相同
- **THEN** 重试保留原改文要求；过期候选不可应用；相同候选明确显示未产生修改，任何情况均不自动写回或重试计费

#### Scenario: Persist and restore conversational edits
- **WHEN** 对话改文被采用、放弃、取消或刷新后重新打开文章
- **THEN** 本机会话保留用户原要求、修改说明、真实状态、输入版本和应用版本；JSON v2 可导出恢复这些关联，已有作品与旧备份无需迁移
