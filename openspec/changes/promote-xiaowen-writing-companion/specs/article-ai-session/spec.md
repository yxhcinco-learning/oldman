## ADDED Requirements

### Requirement: Grounded XiaoWen quick intentions
文章会话 SHALL 提供“接着问我 / 讲清楚了吗 / 帮我理顺 / 润色文笔”四项固定快捷意图。前两项 MUST 使用只读追问边界，只依据本轮当前正文回答且不得返回候选正文；后两项 MUST 复用现有常规优化与润色文笔的完整候选、修改说明和确认写回。快捷操作 MUST 经过既有正文校验、首次同意、用量限制、失败/取消和持久会话流程，不得自动重试或增加第二次模型调用。

#### Scenario: Ask one grounded continuation question
- **WHEN** 用户对非空正文选择“接着问我”
- **THEN** 小文可以用一个简短、基于正文真实细节的承接句，并且只提出一个具体、容易回答的问题帮助用户继续讲；回答不使用外部知识补写经历、不返回 `body`、不创建待应用候选，正文保持不变

#### Scenario: Check whether the article is clear
- **WHEN** 用户对非空正文选择“讲清楚了吗”
- **THEN** 小文只根据当前正文指出最多三处有可靠依据的指代、人物关系、时间顺序或叙述缺口，以问题或不确定措辞邀请用户补充；回答不擅自修正事实、不返回 `body`，正文保持不变

#### Scenario: Report that the article is already clear
- **WHEN** 用户选择“讲清楚了吗”且当前正文没有可靠的理解障碍
- **THEN** 小文明示文章已经讲清楚，不为凑数虚构遗漏、矛盾或待修改项，不生成候选正文

#### Scenario: Run existing editing shortcuts
- **WHEN** 用户选择“帮我理顺”或“润色文笔”
- **THEN** 系统分别执行既有 `regular` 或 `polish` 任务，在同一会话保存非空用户操作文字、生成进度、修改说明和完整候选；确认前正文不变，查看、应用、放弃、撤销及过期基准检查保持

#### Scenario: Preserve an unsent free request around a shortcut
- **WHEN** 会话输入框已有尚未发送的文字且用户选择任一快捷意图
- **THEN** 快捷意图作为独立 turn 执行，原输入文字不拼接进快捷 prompt、不被发送或清空；请求结束后用户仍可检查并显式发送原文字

#### Scenario: Reject an unavailable quick request locally
- **WHEN** 正文为空、超过 12000 字、有待确认语音或段落编辑，或另一请求正在进行
- **THEN** 系统不发送快捷请求、不建立可应用候选并显示既有可补救提示；正文、尚未发送的输入、文章会话和待确认内容保持

#### Scenario: Consent, failure and cancellation
- **WHEN** 用户首次点击快捷意图、拒绝数据发送同意，或请求遇到取消、断网、超时、配置/额度错误、无效输出
- **THEN** 首次请求先说明当前文章、相关修改记录和聊天消息的数据去向；拒绝或失败不调用或不重试额外计费请求，真实失败状态与重试入口进入同一会话，原文不变

#### Scenario: Ignore an unexpected candidate from a read-only intention
- **WHEN** 上游为“接着问我”或“讲清楚了吗”的只读追问错误返回完整正文
- **THEN** 系统丢弃候选正文，只保存可核对的回答或将无效结果标记失败，不创建待应用/已应用状态，不升级数据库或备份格式
