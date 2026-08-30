## MODIFIED Requirements

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
