## MODIFIED Requirements

### Requirement: Safe application and restoration
应用和恢复 SHALL 检查当前作品和正文基准并通过本机事务保存；旧响应、过期候选和多标签冲突 MUST 不覆盖较新的内容。

#### Scenario: Apply and undo
- **WHEN** 用户确认应用有效候选并随后撤销
- **THEN** 正文与会话采纳记录同时保存，原版本仍存在；撤销创建恢复版本而非删除历史

#### Scenario: Edit while a candidate exists
- **WHEN** 候选生成后正文又被手改或在另一页保存
- **THEN** 旧候选不可直接应用；后续手改不得被撤销功能静默清除

#### Scenario: Storage fails
- **WHEN** 应用或保存会话时本机聚合写入失败
- **THEN** 不声称成功；保留原存储、候选和内存补救备份，重试与导出可达

### Requirement: Server side privacy and bounded usage
Key SHALL 仅由服务端读取；首次发送前说明数据去向；请求 MUST 受来源、体积、时限、并发和用量频率限制，不记录凭据或用户内容。

#### Scenario: Consent and pending input
- **WHEN** 未同意数据发送、请求超限，或正文编辑类兼容 action 遇到空正文、待确认语音/段落
- **THEN** 不发送付费请求，提示用户处理后再试；统一 dialogue 允许空正文交流，正文待确认语音独立保留且不进入请求，采用仍受保护

#### Scenario: Cancel and configuration failure
- **WHEN** 用户明确停止请求，或配置无效、网络超时、额度不足
- **THEN** 尽力终止上游并显示真实状态，迟到回复不应用；语音与本机编辑仍可使用；只收起小文不取消请求

### Requirement: Compatible local backup and migration
本机存储 SHALL 以非破坏升级保留会话；当前 JSON v5 SHALL 包含版本、连续消息、素材与来源并继续接受 v1–v4，导入 MUST 先完整校验再创建关联独立的新副本。

#### Scenario: Upgrade and restore
- **WHEN** 打开旧本机聚合或导入 v1–v5 备份
- **THEN** 已有正文与草稿保持；新版中的会话、版本和引用随新副本正确映射，回收站恢复保留历史

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
- **THEN** 本机会话保留用户原文字、回答或修改说明、真实状态、输入版本和可选应用版本；JSON v5 可导出恢复新旧 action 的关联，旧备份按兼容迁移规则恢复，不丢失已有作品

### Requirement: User-invoked XiaoWen interview mode
文章会话 SHALL 将访谈实现为同一小文会话的持久开关，不显示第二个助手或两种模式分类。访谈允许承接问候、解释、反问、回顾和纠正，每轮最多一个追问；普通回答 MUST 不生成候选正文。

#### Scenario: Ask one grounded question
- **WHEN** 用户在访谈中提供实质回答
- **THEN** 小文自然承接并最多追问一个具体问题，不编造职业、经历、态度或事件事实，不同时提出问题清单

#### Scenario: Introduce XiaoWen before the first answer
- **WHEN** 用户首次打开话题访谈
- **THEN** 使用精简静态介绍与称呼、大致年龄、从事行业三个可选引导；无话题先澄清想聊什么，已有交流不重复介绍，打开不请求模型

#### Scenario: Skip or minimize interview
- **WHEN** 用户选择换个问题或收起小文
- **THEN** 换题只换角度；收起返回同篇文章且保留访谈、消息与输入，不取消进行中请求、不结束或自动成文，重开不自动提问

#### Scenario: Keep one primary interview action
- **WHEN** 用户查看访谈输入区
- **THEN** 输入区只提供文字、长按语音和单一发送；顶部提供“结束访谈并整理”，没有暂停、只结束不整理或中途独立成文操作

#### Scenario: Reject an unexpected interview candidate
- **WHEN** 上游在没有明确整理或改文授权的访谈回复中返回正文
- **THEN** 按统一结构化协议拒绝未授权候选，不创建待应用状态，不自动重试

### Requirement: Explicit composition from interview material
小文 SHALL 只在用户明确请求后使用被允许的采访素材、当前正文和议题快照生成完整文章候选；候选 MUST 继续遵守当前预览、事实核对、基准检查、应用、放弃和版本追溯规则。

#### Scenario: Compose from selected material
- **WHEN** 用户点击“结束访谈并整理”或自然语言明确要求整理
- **THEN** 按钮先保存结束模式再请求独立候选，自然语言结束在有效结果保存后生效；区分来源事实、用户观点和连接性表达，确认前正文保持不变

#### Scenario: Material is insufficient or contradictory
- **WHEN** 采访素材缺少关键事实或不同回答明显冲突
- **THEN** 小文提出一个澄清问题或提示用户核对，不自行补写确定事实、不把冲突候选自动应用

#### Scenario: Cancel or fail composition
- **WHEN** 用户取消请求，或请求断网、超时、配置/额度失败、输出无效
- **THEN** 系统不自动重试计费请求，已保存素材和原文保持，会话显示真实失败及显式重试入口；显式结束后不重新开启访谈

### Requirement: Compatible XiaoWen request actions
文章会话 SHALL 在正式界面只提供自由输入、会话语音和单一“发送”，不得展示固定快捷指令。自由输入 MUST 通过 protocolVersion=2 的 `dialogue` 单次请求处理语义切换、回答、追问或待确认改文候选；旧 `chat` 仅保留兼容。系统 MUST 继续兼容 `regular`、`polish` 及内部精确提示“接着问我”“讲清楚了吗”的 `question` action，以读取旧会话并保留已验证的只读边界，但不得为兼容能力增加可见按钮、自动请求、客户端关键词分类或第二次模型调用。

#### Scenario: Ask one grounded continuation question
- **WHEN** 兼容调用方对非空正文以 `question` 发送精确内部提示“接着问我”
- **THEN** 小文可以用一个简短、基于正文真实细节的承接句，并且只提出一个具体、容易回答的问题帮助用户继续讲；回答不使用外部知识补写经历、不返回 `body`、不创建待应用候选，正文保持不变

#### Scenario: Check whether the article is clear
- **WHEN** 兼容调用方对非空正文以 `question` 发送精确内部提示“讲清楚了吗”
- **THEN** 小文只根据当前正文指出最多三处有可靠依据的指代、人物关系、时间顺序或叙述缺口，以问题或不确定措辞邀请用户补充；回答不擅自修正事实、不返回 `body`，正文保持不变

#### Scenario: Report that the article is already clear
- **WHEN** 兼容调用方发送“讲清楚了吗”且当前正文没有可靠的理解障碍
- **THEN** 小文明示文章已经讲清楚，不为凑数虚构遗漏、矛盾或待修改项，不生成候选正文

#### Scenario: Preserve existing editing actions
- **WHEN** 兼容调用方运行既有 `regular` 或 `polish`
- **THEN** 系统分别执行既有 `regular` 或 `polish` 任务，在同一会话保存非空用户操作文字、生成进度、修改说明和完整候选；确认前正文不变，查看、应用、放弃、撤销及过期基准检查保持

#### Scenario: Send one free-form request
- **WHEN** 用户在会话输入非空要求并点击“发送”
- **THEN** 系统只发起一次 `dialogue` 请求并在同一会话显示用户原文字、生成过程和后续回答或待确认候选；发送开始后清空输入，不额外运行 `question`、`regular` 或 `polish`

#### Scenario: Reject an unavailable request locally
- **WHEN** 请求超过既有体积限制、对话语音尚在准备或收尾、另一请求正在进行，或结果等待本机保存补救
- **THEN** 系统不发送重复请求并保留输入和补救入口；正文为空不阻止对话，正文待确认内容独立保留、不进入请求且仍保护采用操作

#### Scenario: Consent, failure and cancellation
- **WHEN** 用户首次发送自由要求、拒绝数据发送同意，或请求遇到取消、断网、超时、配置/额度错误、无效输出
- **THEN** 首次请求先说明标题、正文、话题背景、采访回答、相关修改记录以及用户和小文对话的数据去向；拒绝或失败不调用或不重试额外计费请求，真实失败状态与重试入口进入同一会话，原文不变

#### Scenario: Ignore an unexpected candidate from a read-only intention
- **WHEN** 上游为“接着问我”或“讲清楚了吗”的只读追问错误返回完整正文
- **THEN** 系统丢弃候选正文，只保存可核对的回答或将无效结果标记失败，不创建待应用/已应用状态，不升级数据库或备份格式

