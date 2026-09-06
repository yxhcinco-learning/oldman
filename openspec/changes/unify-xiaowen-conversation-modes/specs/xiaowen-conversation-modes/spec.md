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

#### Scenario: Mini-program loads a stale shared runtime
- **WHEN** 小程序共享核心新增接口或实际运行包缺失会话函数
- **THEN** 构建校验必须检查新增接口及其函数类型，生成包必须随内容变化更新版本；页面展示失败不得替换已经读出的作品草稿，重新编译恢复无需删除用户作品
- **AND** 显式刷新运行包后清理当前项目的代码编译缓存（仅 compile），不得清理 storage/file/auth/session；验收必须区分自动化运行和普通编译

#### Scenario: Long conversation in mini-program
- **WHEN** 连续消息增加或重新打开长会话
- **THEN** 消息区定位最新消息及确认操作，模式操作保持显著可达；结束访谈产生的候选明确标为整理而不是优化

#### Scenario: Keyboard and brief introduction
- **WHEN** 用户开始访谈并唤起系统键盘
- **THEN** 输入区只进行一次键盘避让，原生布尔属性使用布尔绑定；首次开场用称呼、大致年龄和从事行业三个可选角度引导，不要求逐项作答或重复询问已提供的信息

#### Scenario: Request protocol rejected
- **WHEN** 服务端拒绝统一会话请求
- **THEN** 保留原始消息，区分协议不兼容、格式无效与内容超限；不得将版本问题解释为用户短消息过长，不自动降级旧协议或重复请求模型
