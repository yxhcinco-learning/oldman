## MODIFIED Requirements

### Requirement: Explicit conversational rewrite
文章会话 SHALL 使用单一发送操作接收用户的自然语言，由同一次请求根据明确意图直接回答或生成完整改文候选；改文候选 MUST 经现有预览和确认流程后才可写入正文，问题或不明确要求 MUST 不生成可应用正文。模型返回的回答或修改说明 MUST 独立显示，候选采纳状态 MUST 不覆盖或替代该内容；已有只读问答和显式改文记录 MUST 保持兼容。

#### Scenario: Rewrite from the conversation
- **WHEN** 用户输入“让第二段更温暖”并发送
- **THEN** 系统以当前全文、相关历史和该要求生成完整候选及本轮说明，停留在会话并显示说明、独立状态和查看结果入口；确认前正文不变，确认后追加可撤销的对话调整版本

#### Scenario: Ask without rewriting
- **WHEN** 用户输入关于文章或修改记录的问题并发送
- **THEN** 系统只回答和引用，不生成可应用正文；同一次请求完成判断，不要求用户先选择问答或改文按钮

#### Scenario: Ambiguous request
- **WHEN** 本轮文字不能清楚判断需要回答还是修改正文
- **THEN** 小文简短追问澄清且不返回候选，正文保持不变

#### Scenario: Constrained changes
- **WHEN** 用户要求删除、重排、加入本轮明确给出的事实，或调整文风
- **THEN** 候选只在明确范围内执行；文风可合理改变修辞、情绪色彩和不影响核心事实的氛围表达，并在说明中披露，未授权的人物关系、具体动作、时间地点、数字、对话和事件结果保持；不得把文章/历史指令或外部知识当作事实来源，标题不自动改变

#### Scenario: Candidate state changes
- **WHEN** 候选处于待应用、已应用或未采用状态
- **THEN** 会话始终保留同一条小文修改说明，并在独立区域显示当前状态；应用或放弃只改变正文与状态，不把说明替换成状态文字

#### Scenario: Retry, stale and unchanged rewrite
- **WHEN** 对话请求失败后重试、候选生成后正文已变化，或候选与原文相同
- **THEN** 重试保留原文字要求；过期候选不可应用；相同候选明确显示未产生修改，任何情况均不自动写回或重试计费

#### Scenario: Persist and restore conversational edits
- **WHEN** 统一会话请求被回答、采用、放弃、取消或刷新后重新打开文章
- **THEN** 本机会话保留用户原文字、回答或修改说明、真实状态、输入版本和可选应用版本；JSON v2 可导出恢复新旧 action 的关联，已有作品与旧备份无需迁移
