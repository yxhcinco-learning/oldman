## MODIFIED Requirements

### Requirement: Compact interview switch
界面 MUST 将访谈呈现为小文会话中的文字操作，不使用滑动开关或“普通对话”等模式分类。顶部浅绿主题区固定单行话题，超长缓慢往返滚动、短题静止；访谈中同区下行显示状态和“结束访谈并整理”，结束后“开启访谈”与主题同排，操作带细下划线，不加边框或胶囊，触控目标至少48px，远离底部发送。结束直接整理，不增加确认；再次开启承接历史，不重复介绍。换个问题 SHALL 只出现在当前可继续追问的助手消息内。聊天气泡不重复显示 AI 核对提示，候选预览与导出来源说明保留。

#### Scenario: Pending assistant reply
- **WHEN** 用户发送或请求整理
- **THEN** 在对应助手回复位置仅显示三个紧凑轻动效圆点，提供读屏状态；发送原位显示“停止”，不在消息内显示“取消请求”，结果到达替换同一位置，失败在该位置显示错误与重试；等待状态不写入消息、素材或备份，不重复展示外部进度条；处理中禁用访谈操作

#### Scenario: Scroll and toggle interview
- **WHEN** 用户滚动长会话或结束访谈
- **THEN** 话题保持可见，访谈控件只切换开启/结束语义，不显示两种模式分类；失败重试继续保留
- **AND** 主题区通栏紧接页头，不使用带外边距的独立圆角卡片；访谈结束后收拢为单行话题与开启入口，不保留闲聊状态行；已采用文章的查看与撤销操作同排，均保留至少48px触控高度

#### Scenario: Provider nests candidate body
- **WHEN** 模型将唯一候选 body 错放在 dialogue 内
- **THEN** 服务端可将该字段移到顶层后执行全部既有校验；双重 body、未知字段和无授权候选仍被拒绝，不额外请求模型

#### Scenario: Keep one primary interview action
- **WHEN** 用户查看访谈输入区
- **THEN** 输入区只提供文字、长按语音和单一发送；结束操作位于顶部，没有暂停、只结束不整理或中途独立成文操作

### Requirement: Continuous work conversation
系统 SHALL 为每篇作品保存一段连续小文会话与唯一模式，普通对话和访谈共用文章、消息、素材和背景；不得因切换隐藏历史。

#### Scenario: Conversation without a topic
- **WHEN** 用户打开无话题的空作品、开启访谈或在结束后再次进入
- **THEN** 不展示空主题卡、虚构主题或“围绕这个话题”的开场；无正文和素材时先澄清想聊什么，已有内容时承接；只有问候不视为已深入交流。空会话问候仅作展示，不触发模型或形成素材；无话题操作行紧凑且触控高度至少48px，结束后和等待中均依据已保存模式显示控件
- **AND** 结束、换题、重试等控制操作不丢弃输入框中尚未发送的文字

#### Scenario: Reopen the conversation
- **WHEN** 用户收起、离开或刷新后重开
- **THEN** 恢复模式与历史，不自动发送；只收起不结束访谈

#### Scenario: Introduce XiaoWen before the first answer
- **WHEN** 用户首次打开话题访谈
- **THEN** 使用精简静态介绍与称呼、大致年龄、从事行业三个可选引导；已有交流不重复介绍，打开不请求模型；无话题遵循 Conversation without a topic

#### Scenario: Skip or minimize interview
- **WHEN** 用户选择换个问题或收起小文
- **THEN** 换题只换角度；收起返回同篇文章且保留访谈、消息与输入，不取消进行中请求、不结束或自动成文，重开不自动提问

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

#### Scenario: Ask one grounded question
- **WHEN** 用户在访谈中提供实质回答
- **THEN** 小文自然承接并最多追问一个具体问题，不编造职业、经历、态度或事件事实，不同时提出问题清单

#### Scenario: Reject an unexpected interview candidate
- **WHEN** 上游在没有明确整理或改文授权的访谈回复中返回正文
- **THEN** 按统一结构化协议拒绝未授权候选，不创建待应用状态，不自动重试

### Requirement: Finish with a reviewable candidate
小文 SHALL 只使用被允许的访谈素材、当前正文和议题快照成文，继续遵守 article-ai-session 的预览、基准检查、应用、放弃和版本追溯规则。明确结束访谈 MUST 进入普通对话并整理为待确认候选，不提供只结束不整理选项；访谈中改文要求 MUST 先确认结束，保留原要求再生成候选。

#### Scenario: Read and choose the article
- **WHEN** 用户查看小文生成的文章
- **THEN** 消息入口显示“看看文章”，不使用“查看候选”等内部术语；预览以“整理后的文章／调整后的文章”为标题，保留轻量 AI 来源提醒、状态与对照入口，正文独立滚动，不重复消息中的整理说明卡片；固定底部“暂不使用／用这篇”，说明确认后才替换正文，冲突、撤销和保存规则不变

#### Scenario: Reopen an applied result
- **WHEN** 用户重新查看已经采用的文章结果
- **THEN** 不把采用本身造成的正文变化误报为待采用结果冲突，不显示基于该误报的重新生成操作；待采用结果遇到后续手改仍必须阻止覆盖

#### Scenario: Stop and switch feedback
- **WHEN** 用户停止回复或开启访谈
- **THEN** 停止反馈只在对应助手回复位置显示，独立保存失败仍提供补救；开启清除过期控制器错误但保留历史失败消息，新开场可见，系统切换事件不作为助手白色气泡展示

#### Scenario: Finish by button or language
- **WHEN** 用户点击结束访谈并整理或明确表达相同意图
- **THEN** 按钮先保存结束模式再请求候选，自然语言结束在有效结构化结果保存后生效；区分来源事实、用户观点和连接性表达，生成候选或材料不足说明，只有明确采用才写入正文

#### Scenario: Compose a short factual memory
- **WHEN** 用户只提供一段简短经历并明确要求整理
- **THEN** 候选可只含几句话，仅重排和润顺已表达内容；不得把助手追问中未获回答的感受、人物反应、受伤、环境或因果补成作者经历，也不得为篇幅增加情节。验收必须人工比对原始材料与正文，JSON校验及返回非空不代表事实忠实通过

#### Scenario: Failed composition
- **WHEN** 整理请求断网、超时、配置/额度失败或输出无效
- **THEN** 已保存的模式不回退（按钮结束后仍为普通对话），保留消息、素材和原文并显示真实失败及显式重试，不自动重试计费请求，不重复消息和素材

#### Scenario: Material is insufficient or contradictory
- **WHEN** 采访素材缺少关键事实或不同回答明显冲突
- **THEN** 小文提出一个澄清问题或提示用户核对，不自行补写确定事实、不把冲突候选自动应用

#### Scenario: Cancel composition
- **WHEN** 用户取消整理请求
- **THEN** 不自动重试计费请求，保留已保存素材和原文及显式重试入口；显式结束后不重新开启访谈，迟到结果遵循持久化规则
