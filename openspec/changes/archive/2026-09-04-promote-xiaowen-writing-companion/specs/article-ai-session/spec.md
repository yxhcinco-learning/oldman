## ADDED Requirements

### Requirement: Compatible XiaoWen request actions
文章会话 SHALL 在正式界面只提供自由输入、会话语音和单一“发送”，不得展示固定快捷指令。自由输入 MUST 通过既有 `chat` 单次请求处理回答、追问或待确认改文候选。系统 MUST 继续兼容 `regular`、`polish` 及内部精确提示“接着问我”“讲清楚了吗”的 `question` action，以读取旧会话并保留已验证的只读边界，但不得为兼容能力增加可见按钮、自动请求、客户端关键词分类或第二次模型调用。

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
- **THEN** 系统只发起一次 `chat` 请求并在同一会话显示用户原文字、生成过程和后续回答或待确认候选；发送开始后清空输入，不额外运行 `question`、`regular` 或 `polish`

#### Scenario: Reject an unavailable request locally
- **WHEN** 正文为空、超过 12000 字、有待确认语音或段落编辑，或另一请求正在进行
- **THEN** 系统不发送请求、不建立可应用候选并显示既有可补救提示；正文、尚未发送的输入、文章会话和待确认内容保持

#### Scenario: Consent, failure and cancellation
- **WHEN** 用户首次发送自由要求、拒绝数据发送同意，或请求遇到取消、断网、超时、配置/额度错误、无效输出
- **THEN** 首次请求先说明标题、正文、话题背景、采访回答、相关修改记录以及用户和小文对话的数据去向；拒绝或失败不调用或不重试额外计费请求，真实失败状态与重试入口进入同一会话，原文不变

#### Scenario: Ignore an unexpected candidate from a read-only intention
- **WHEN** 上游为“接着问我”或“讲清楚了吗”的只读追问错误返回完整正文
- **THEN** 系统丢弃候选正文，只保存可核对的回答或将无效结果标记失败，不创建待应用/已应用状态，不升级数据库或备份格式
