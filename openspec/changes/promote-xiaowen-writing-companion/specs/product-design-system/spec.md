## ADDED Requirements

### Requirement: Progressive XiaoWen companion surface
正式编辑器 SHALL 通过单一“小文”入口打开文章级写作伙伴，并 MUST 在手机上使用一个有焦点约束、尺寸稳定的聊天底部面板，而不是长期遮挡正文的自由拖拽悬浮窗。面板 MUST 直接显示会话和消息输入区，不得展示固定快捷指令、自动聚焦输入框或页头尺寸切换按钮；系统键盘和短高度 MUST 通过 Visual Viewport 约束面板，消息区独立滚动而输入区固定可达。聚焦、系统键盘、短高度滚动和收起/重开 MUST 保留已存会话、进行中请求及当前作品尚未发送的输入。

#### Scenario: Open XiaoWen without opening the keyboard
- **WHEN** 用户从编辑器点击“小文”且系统键盘未打开
- **THEN** 底部聊天面板直接显示小文会话和输入区，不显示预设快捷指令、相邻教学说明或展开/收起尺寸按钮；页头或关闭操作获得焦点，输入框不自动聚焦，文章不发送且不会产生 AI 请求

#### Scenario: Fit a short screen and the system keyboard
- **WHEN** 用户在 360×640 等短屏打开小文，或系统键盘使当前 Visual Viewport 高度不足
- **THEN** 面板在当前可见高度内自适应，页头与输入区保持可达、消息区独立滚动且无横向溢出；界面不要求用户先理解或点击尺寸切换按钮，也不清空输入或会话

#### Scenario: Minimize and reopen XiaoWen
- **WHEN** 用户在小文首页或下级页面点击关闭、按 Escape，随后再次点击编辑器“小文”
- **THEN** 面板收起并恢复入口焦点；同一作品尚未发送的输入、持久化会话、候选与进行中请求保持，重新打开直接回到会话而不是已删除的优化菜单

#### Scenario: Finish a request while minimized
- **WHEN** 用户发起请求后收起小文，且请求随后完成或失败
- **THEN** 请求继续按同篇文章会话保存真实结果或失败状态，小文入口以可见且可访问的方式表示处理中、新回复或需处理；用户重新打开后可以查看结果或重试，正文不自动改变

#### Scenario: Keep controls reachable on supported sizes
- **WHEN** 在 360×640、390×844、430×932 或 1280×900 查看空会话、长会话或话题采访
- **THEN** 稳定面板内的输入、语音、发送、修改记录和关闭均可达，极短高度使用消息区内部滚动而不缩小规定字号或触控目标，界面无横向溢出且不显示尺寸切换按钮

## MODIFIED Requirements

### Requirement: Keep AI isolation visible
正式小文入口 SHALL 使用真实文章助手并清楚区分生成中、小文回答或修改说明、待应用、已应用、失败与待开放能力；续写引导、表达核对、优化、润色和自由输入反馈 SHALL 集中在同一文章会话中，修改说明与候选状态 MUST 分开显示。小文输入区 SHALL 只提供一个明确的主要发送操作，不展示固定快捷指令，并 MUST 避免用常驻辅助文案重复解释相邻标题、按钮或状态。面向用户的记录名称、字数和时间 MUST 使用直白、适合长辈识别的措辞与精度。普通成功反馈 MUST 不持续占用内容布局，错误补救、正文冲突、数据发送范围、事实核对及覆盖风险 MUST 持续可见。只有明确确认的候选或恢复版本 MUST 写入正文。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: Enter the unified XiaoWen conversation
- **WHEN** 用户从编辑器点击“小文”
- **THEN** Echoes 风格直接呈现同篇文章会话和自由输入，不显示固定快捷指令、“文章优化”首页、“聊天功能暂未开放”、精简/扩写/配图禁用卡片或重复的对话记录入口

#### Scenario: Keep the conversation free of preset shortcuts
- **WHEN** 用户查看空会话、历史会话或进行中请求
- **THEN** 输入区只显示可编辑文字、点按语音和“发送”，不显示问题、检查、整理或润色类预设按钮；既有历史回答和候选仍正常显示

#### Scenario: Conversational action and result status
- **WHEN** 用户在会话输入文字，或一个候选从待应用变为已应用/未采用
- **THEN** 界面提供至少 48px 的单一“发送”操作；小文回答或修改说明保持独立，候选状态独立显示，“查看结果”为主要操作，已应用候选的“撤销”为同组次级操作；手机无横向溢出，候选不直接改变编辑器

#### Scenario: Transient success and persistent risk
- **WHEN** 候选成功应用、放弃、撤销或恢复，或操作遇到正文冲突、覆盖风险、存储或网络失败
- **THEN** 普通成功确认以不抢焦点且约 3 秒自动消失的提示呈现，真实候选状态与修改记录继续保留；冲突、风险和失败持续可见并保留补救入口

#### Scenario: Modification record placement
- **WHEN** 用户需要从小文会话查看修改记录
- **THEN** 小文面板页头提供至少 48px、可访问名称为“查看修改记录”的操作；内容区不再为修改记录单独占行，也不显示独立的对话记录按钮

#### Scenario: Remove repeated helper copy
- **WHEN** 标题、按钮或候选状态已经清楚表达当前操作
- **THEN** 界面不再用教学句重复解释相邻控件，空会话也不显示示例问法；必要的授权、错误、数据范围、事实核对和覆盖风险仍然可见

#### Scenario: Read modification records
- **WHEN** 用户打开文章的修改记录
- **THEN** 界面使用“修改记录”和“字”，时间显示到分钟，不展示正文为空的起始记录；字数、记录来源和恢复覆盖提示仍可见，底层会话记录不被删除

#### Scenario: Minimize instead of returning to a feature menu
- **WHEN** 用户从小文首页、候选、同意页或修改记录点击关闭或按 Escape
- **THEN** 整个小文面板收起并恢复编辑器入口焦点，不返回已删除的文章优化菜单；返回按钮仍按“候选/记录 → 会话”的层级工作

### Requirement: Accessible AI composer and optimization discovery
正式文章会话 SHALL 让输入框的完整聚焦状态在支持宽度内可见，并提供复用现有腾讯云链路的点按语音转文字入口；识别文字 MUST 先进入可编辑的会话输入框，不得自动发送文章 AI 请求或修改正文。语音入口 MUST 在准备、连接、录音和收尾阶段提供连续且与真实点按状态一致的反馈，并且不得改变正常正文语音输入的授权、识别和待确认行为。编辑器 SHALL 在当前浏览器首次达到 80 个非空白正文字符时，于“小文”操作附近显示一次简短弱提示，并 MUST 避免重复打扰或自动分析文章。

#### Scenario: Focus the conversation input
- **WHEN** 用户点击会话输入框或用键盘将焦点移入输入框
- **THEN** 小文面板保持稳定展示状态，输入框四边的聚焦样式完整可见，不被滚动容器裁切，也不产生横向溢出或高度跳动；系统键盘另由 Visual Viewport 约束当前面板

#### Scenario: Dictate a conversation request
- **WHEN** 用户点按小文语音按钮开始准备、连接和录音，再次点按结束采集
- **THEN** 活动态提供清楚的取消反馈，实时识别文字追加到当前输入框且仍可编辑；再次点按释放麦克风并保留已经显示的文字，系统不自动发送、调用 DeepSeek 或修改文章正文

#### Scenario: Preserve tap cancellation and page lifecycle
- **WHEN** 小文语音活动中用户再次点按、按 Escape、收起面板、切到后台或离开页面
- **THEN** 采集、音频图和连接只结束或取消一次，录音前和已经显示的输入保持可用；页面隐藏和卸载仍尽力释放资源，不把普通焦点变化冒充发送操作

#### Scenario: Preserve working article dictation
- **WHEN** 同一共享语音链路用于正文语音输入并依次经历授权、连接、录音、收尾、取消或错误
- **THEN** 原正文语音舞台、麦克风位置、转写待确认内容和完成/清空操作保持，不因小文面板重构而增加请求、自动写回或丢失转写

#### Scenario: Cancel or fail conversation dictation
- **WHEN** 用户取消、收起小文、拒绝麦克风，或语音配置、连接、识别失败
- **THEN** 录音尽力终止，录音前与已经显示的输入保持可用，错误以简短且可读的文字显示，用户仍可继续文字输入或重新授权

#### Scenario: Show the XiaoWen hint once
- **WHEN** 当前浏览器尚未展示过既有提示且有效正文首次达到 80 个非空白字符
- **THEN** “小文”入口附近显示“小文可以陪您接着写，也能帮您整理。”；提示不抢走正文焦点、不要求确认、不打开面板、不发送文章，并立即记为已展示

#### Scenario: Dismiss or revisit the XiaoWen hint
- **WHEN** 提示显示约 6 秒、用户点击小文、刷新、重新打开文章，或继续输入更多正文
- **THEN** 当前提示自动或立即隐藏且该浏览器不再重复展示；沿用既有本机标记，`localStorage` 不可用时至少在当前挂载期间不重复显示

### Requirement: Distinct keyboard icon for text mode
正式编辑器 SHALL 使用同一小按钮槽位交替切换语音与文字输入，而不是同时显示两个大页签。当前为文字输入时，该按钮 MUST 显示麦克风图标和“切换到语音输入”可访问名称；当前为语音输入时，MUST 显示键盘轮廓图标和“切换到文字输入”可访问名称。按钮 MUST 至少 48×48px，沿用 Echoes 的颜色、圆角、焦点和细线图标，并 MUST 与独立的小文叶片入口区分；参考交互不得引入表情按钮或外部截图视觉。

#### Scenario: Switch from text to speech
- **WHEN** 当前显示全文文字输入且用户点击麦克风小按钮
- **THEN** 系统收起文字键盘并显示现有语音舞台，按钮改为键盘图标；这次点击只切换输入方式，不申请麦克风、不开始录音、不修改正文

#### Scenario: Switch from speech to text
- **WHEN** 当前显示语音舞台且用户点击键盘小按钮
- **THEN** 系统切换到现有全文文字输入、按既有规则恢复折叠光标并唤起系统键盘，按钮改为麦克风图标；待确认语音、标题和正文不因模式按钮本身被写回或清空

#### Scenario: Keep the reference interaction in the Echoes system
- **WHEN** 用户在任一输入模式查看模式按钮与小文入口
- **THEN** 界面只采用参考图的交替切换模式，实际颜色、字号、间距、图标、圆角、焦点和安全区继续遵守 Echoes 规范，不显示表情按钮或模仿系统输入法视觉

## REMOVED Requirements

### Requirement: Compact mobile optimization and conversation surfaces
**Reason**: 独立文章优化菜单被小文统一会话与分级面板替代，继续保留该要求会同时规定两套互斥入口和页面层级。

**Migration**: 使用新增的 `Progressive XiaoWen companion surface` 以及修改后的 `Keep AI isolation visible`、`Accessible AI composer and optimization discovery`；保留其中的输入自适应、点按语音、安全区和 48px 触控边界。

### Requirement: Reserved toolbar chat entry
**Reason**: 工具栏“聊天”占位和优化入口合并为已经可用的“小文”，不再存在需要提示未开放的独立聊天功能。

**Migration**: 编辑器只显示“小文”写作伙伴入口；已有文章会话从该入口直接打开，旧会话数据无需迁移。
