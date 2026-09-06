> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/PRODUCT.md 与 active-client-scope 规范。

## ADDED Requirements

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

### Requirement: Continuous work conversation
系统 SHALL 为每篇作品保存一段连续小文会话与唯一模式，普通对话和访谈共用文章、消息、素材和背景；不得因切换隐藏历史。

#### Scenario: Conversation without a topic
- **WHEN** 用户打开无话题的空作品、开启访谈或在结束后再次进入
- **THEN** 不展示空主题卡、虚构主题或“围绕这个话题”的开场；无正文和素材时先澄清想聊什么，已有内容时承接；只有问候不视为已深入交流。空会话问候仅作展示，不触发模型或形成素材；无话题操作行紧凑且触控高度至少48px，结束后和等待中均依据已保存模式显示控件
- **AND** 结束、换题、重试等控制操作不丢弃输入框中尚未发送的文字

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
- **THEN** 记录模式切换，生成候选或材料不足说明，只有明确采用才写入正文

#### Scenario: Compose a short factual memory
- **WHEN** 用户只提供一段简短经历并明确要求整理
- **THEN** 候选可只含几句话，仅重排和润顺已表达内容；不得把助手追问中未获回答的感受、人物反应、受伤、环境或因果补成作者经历，也不得为篇幅增加情节。验收必须人工比对原始材料与正文，JSON校验及返回非空不代表事实忠实通过

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

#### Scenario: Preserve before navigation
- **WHEN** 编辑器准备进入全屏访谈且本地保存失败
- **THEN** 留在当前页，保留最新正文和会话，提供重试保存及救援导出；保存期间拒绝重复跨页，不能吞掉异常后跳转

#### Scenario: Received result cannot be saved
- **WHEN** 模型已返回且本机结算写入失败
- **THEN** 独立保留结果恢复记录，提供不重新调用模型的重试保存和包含结果的救援备份；持久化失败不发布模式变化，不允许其他操作覆盖该结果；重开可找回完整的恢复记录，预期 revision 冲突时停止覆盖。所有磁盘写入都失败时明确仅内存保留，不承诺系统杀进程后恢复

#### Scenario: Undo and restore history
- **WHEN** 用户撤销已采用结果或查看并确认恢复一个具体版本
- **THEN** 校验当前正文和预期修订号，追加恢复版本并保留手改、采用及来源历史；撤销成功后同条消息不再提供撤销，恢复失败保留原文，查看本身不改正文

#### Scenario: Clarify a pending edit
- **WHEN** 访谈中的修改要求等待确认，用户继续反问、补充或纠正
- **THEN** 普通回复保留原修改要求；新的明确修改要求替换它，明确取消只清除要求而不退出访谈；确认结束才同时整理和修改

#### Scenario: Retry an obsolete turn
- **WHEN** 失败消息之后已有新消息或模式变化
- **THEN** 旧消息仍可查看但不可原位重发；提示用户在当前对话重新表达，不允许旧结束请求关闭新访谈；无后续变化的失败轮次可显式重试且不重复消息

#### Scenario: Retrieve earlier material
- **WHEN** 长访谈重新提到早期经历
- **THEN** 在相同上下文预算内兼顾近期和与当前要求相关的有效材料，材料及原始消息成对选入，保留本地更正链并准确计算省略数量

#### Scenario: Mini-program loads a stale shared runtime
- **WHEN** 小程序共享核心新增接口或实际运行包缺失会话函数
- **THEN** 构建校验必须检查新增接口及其函数类型，生成包必须随内容变化更新版本；页面展示失败不得替换已经读出的作品草稿，重新编译恢复无需删除用户作品
- **AND** 显式刷新运行包后清理当前项目的代码编译缓存（仅 compile），不得清理 storage/file/auth/session；验收必须区分自动化运行和普通编译

#### Scenario: Native stylesheet compilation fails
- **WHEN** 开发者工具无法读取页面元数据或页面未加载
- **THEN** 先检查原生 WXSS/WXML/脚本编译错误；等待动效使用兼容的显式类选择器，修复后必须补模拟器运行证据，不以 TypeScript 构建通过代替原生编译成功

#### Scenario: Long conversation in mini-program
- **WHEN** 连续消息增加或重新打开长会话
- **THEN** 消息区定位最新消息及确认操作，模式操作保持显著可达；结束访谈产生的候选明确标为整理而不是优化

#### Scenario: Keyboard and brief introduction
- **WHEN** 用户开始访谈并唤起系统键盘
- **THEN** 输入区只进行一次键盘避让，原生布尔属性使用布尔绑定；首次开场用称呼、大致年龄和从事行业三个可选角度引导，不要求逐项作答或重复询问已提供的信息

#### Scenario: Hold to dictate into a conversation
- **WHEN** 用户在小文面板或访谈页长按语音、松开并等待识别完成
- **THEN** 录音状态与转写在输入行上方独立显示，输入/语音/发送保持原列位和触控尺寸；录音提示“正在听，松开结束”，收尾明确等待，结束只追加到未发送输入，不自动发送或写入正文；短按不启动、触摸取消不提交、收起中断保留已识别文字，准备及收尾期间不能重复启动或发送
- **AND** 正文的待确认语音与对话输入独立；dialogue 可继续，未确认正文语音不进入请求或被清除，候选采用/撤销/恢复仍拒绝覆盖待确认内容，旧正文编辑类 action 保持保护

#### Scenario: Request protocol rejected
- **WHEN** 服务端拒绝统一会话请求
- **THEN** 保留原始消息，区分协议不兼容、格式无效与内容超限；不得将版本问题解释为用户短消息过长，不自动降级旧协议或重复请求模型
