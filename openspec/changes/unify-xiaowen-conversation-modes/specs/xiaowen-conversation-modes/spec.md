## ADDED Requirements

### Requirement: Continuous work conversation
系统 SHALL 为每篇作品保存一段连续小文会话与唯一模式，普通对话和访谈共用文章、消息、素材和背景；不得因切换隐藏历史。

#### Scenario: Reopen the conversation
- **WHEN** 用户收起、离开或刷新后重开
- **THEN** 恢复模式与历史，不自动发送；只收起不结束访谈

### Requirement: Semantic interview interaction
系统 MUST 通过同一次模型请求理解自然语言切换，访谈允许问候、解释、反问、回顾和纠正；每轮最多一个追问，输入先作为消息保存，实质回答才关联素材。

#### Scenario: Greet instead of answering
- **WHEN** 用户发送“你好”
- **THEN** 自然回应，不机械跳题、不生成素材或正文

#### Scenario: Ambiguous mode request
- **WHEN** 用户说“先不聊这个”且无法确定是否结束访谈
- **THEN** 保持模式并澄清；明确开启/结束才记录对应模式变化

#### Scenario: Correct material
- **WHEN** 用户纠正先前经历或时间
- **THEN** 保留原消息与更正关联，成文使用最新有效材料

### Requirement: Finish with a reviewable candidate
明确结束访谈 MUST 进入普通对话并整理为待确认候选，不提供只结束不整理选项；访谈中改文要求 MUST 先确认结束，保留原要求再生成候选。

#### Scenario: Finish by button or language
- **WHEN** 用户点击结束访谈并整理或明确表达相同意图
- **THEN** 记录模式切换，生成候选或材料不足说明，只有明确采用才写入正文

#### Scenario: Failed composition
- **WHEN** 按钮结束后整理失败
- **THEN** 仍保持普通对话，保留消息与素材并提供显式重试，不重复消息和素材

### Requirement: Compatible persistent conversation
系统 MUST 使用共享编排与版本化协议，导出 JSON v5 并兼容 v1–v4；旧记录和引用保留，导入副本重映射关联。

#### Scenario: Restore a legacy interview
- **WHEN** 旧作品或备份恢复
- **THEN** 稳定恢复问答来源与初始模式，不重复或捏造时间顺序，正文与版本不丢失

#### Scenario: Save failure and late response
- **WHEN** 保存失败或请求取消后返回迟到结果
- **THEN** 不假报保存或覆盖新状态，不自动重试计费请求，保留可恢复输入
