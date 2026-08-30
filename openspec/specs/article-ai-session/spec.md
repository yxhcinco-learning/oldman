# article-ai-session Specification

## Purpose

规定每篇文章共享持久会话和历史版本的行为，涵盖 DeepSeek 常规优化、润色文笔、只读文字追问、全文预览确认、恢复、服务边界与兼容备份。
## Requirements
### Requirement: Article scoped persistent context
系统 SHALL 为每篇作品保存独立会话、操作状态和不可变正文版本；手动编辑和 AI 操作共享同一上下文，未采用建议 MUST 与实际正文区分。

#### Scenario: Edit then optimize and ask
- **WHEN** 用户手写、常规优化并应用、手改、润色并追问
- **THEN** 当前正文、相关历史和真实采纳状态共同输入 AI，其他作品不混入；刷新仍可查看会话与版本

#### Scenario: Interrupted and missing history
- **WHEN** 请求中刷新，或查询接入前丢失/本次未提供的历史
- **THEN** 中断请求不自动重发；无证据内容不得声称已找到，完整已保存版本可本机查看

### Requirement: Two constrained full article optimizations
系统 SHALL 提供常规优化和润色文笔；前者处理通顺、分段、错别字与标点，并将不承担事实、强调或情感作用的口语填充、重复连接和松散句式整理为自然书面表达，后者改善用词、描写和节奏；二者 MUST 保留事实、原意、叙述视角和文体，不新增事实，不自动改标题。常规优化 MUST 允许为书面化替换必要措辞和调整句式，同时保留有意义的方言、直接引语、情感和叙述者个性，不得机械删除所有口语特征。快捷操作的生成进度、修改说明、候选状态和查看入口 SHALL 进入同篇文章会话。

#### Scenario: Generate a candidate
- **WHEN** 用户对已确认的非空正文选择任一优化
- **THEN** 界面进入文章会话，使用当前全文生成完整候选和修改说明；生成完成后停留会话并显示查看候选入口，当前正文不立即改变，用户进入全文预览后可查看原文并决定应用或放弃

#### Scenario: Turn spoken narration into natural written expression
- **WHEN** 用户选择常规优化，正文包含无实际语义的“嗯、啊、吧”等填充词、连续重复的“然后”或口头化松散句式
- **THEN** 候选删除或改写不必要的填充与重复，补足自然书面句式；事实、否定、程度、情感和叙述者原意保持，有意义的直接引语、方言或口吻不被机械抹除

#### Scenario: Invalid or incomplete result
- **WHEN** 上游失败、输出被截断、结果为空或格式无效
- **THEN** 会话中提供明确错误和显式重试入口，原文不变，不回退模拟文本

#### Scenario: Unchanged candidate
- **WHEN** 返回的候选与本轮原文完全一致
- **THEN** 会话显示保留原文、未产生正文修改，不采用模型声称已修改的说明

### Requirement: Safe application and restoration
应用和恢复 SHALL 检查当前作品和正文基准并通过本机事务保存；旧响应、过期候选和多标签冲突 MUST 不覆盖较新的内容。

#### Scenario: Apply and undo
- **WHEN** 用户确认应用有效候选并随后撤销
- **THEN** 正文与会话采纳记录同时保存，原版本仍存在；撤销创建恢复版本而非删除历史

#### Scenario: Edit while a candidate exists
- **WHEN** 候选生成后正文又被手改或在另一页保存
- **THEN** 旧候选不可直接应用；后续手改不得被撤销功能静默清除

#### Scenario: Storage fails
- **WHEN** 应用或保存会话时 IndexedDB 写入失败
- **THEN** 不声称成功；保留原存储、候选和内存补救备份，重试与导出可达

### Requirement: Read only textual follow up
文字追问 SHALL 支持关于文章和修改历史的问题，回答能引用所提供版本；问题本身 MUST 不触发自由改文或自动恢复。

#### Scenario: Locate removed material
- **WHEN** 用户询问某段去了哪里
- **THEN** 根据实际提供的版本说明可观察的变更并允许查看原文；可复制或确认恢复历史版本，不杜撰修改原因

### Requirement: Server side privacy and bounded usage
Key SHALL 仅由服务端读取；首次发送前说明数据去向；请求 MUST 受来源、体积、时限、并发和用量频率限制，不记录凭据或用户内容。

#### Scenario: Consent and pending input
- **WHEN** 未同意数据发送、正文为空/超长，或有待确认语音/段落
- **THEN** 不发送付费请求，提示用户处理后再试

#### Scenario: Cancel and configuration failure
- **WHEN** 用户取消/关闭请求，或配置无效、网络超时、额度不足
- **THEN** 尽力终止上游并显示真实状态，迟到回复不应用；语音与本机编辑仍可使用

### Requirement: Compatible local backup and migration
数据库 SHALL 以非破坏升级增加会话存储；JSON v2 SHALL 包含版本与会话并继续接受 v1，导入 MUST 先完整校验再创建关联独立的新副本。

#### Scenario: Upgrade and restore
- **WHEN** 打开 v1 数据库或导入 v1/v2 备份
- **THEN** 已有正文与草稿保持；v2 的会话、版本和引用随新副本正确映射，回收站恢复保留历史

#### Scenario: Invalid associations or future schema
- **WHEN** 备份包含不匹配的作品/版本引用、损坏内容或未知版本
- **THEN** 整批拒绝而不部分导入，不删库修复

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
