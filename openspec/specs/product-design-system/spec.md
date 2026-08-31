# product-design-system Specification

## Purpose

规定正式产品采用 Echoes 设计时的视觉一致性、真实功能保留、语音稳定布局、文章 AI 确认写回与历史预览隔离及响应式可访问行为，以现行 DESIGN-SYSTEM.md 为视觉依据。
## Requirements
### Requirement: Adopt the approved visual system
正式产品 SHALL 全面采用已确认的 Echoes 视觉，现行 `DESIGN-SYSTEM.md` MUST 记录色板、排版、组件、真实状态、响应式及可访问性规则；旧设计仅作历史参考。

#### Scenario: Review all product screens
- **WHEN** 打开作品、写作、单段、聊天、优化、配图、菜单、备份、回收站或语音授权
- **THEN** 使用统一暖白纸面、森林绿、赭色、衬线标题、无衬线正文、SVG图标与圆角；不存在混用旧主题的弹层

### Requirement: Preserve real product capabilities
视觉迁移 MUST 保留原生文字输入、真实作品时间与字数、本机保存/恢复、删除恢复和导出备份，不导入预览业务状态或示例数据，不修改语音协议。已确认的文章 AI 会话升级 MAY 事务新增存储，但 MUST 保留已有正文、草稿和旧备份导入能力。

#### Scenario: Existing and empty libraries
- **WHEN** 首次打开空库或打开已保存的作品
- **THEN** 空库不出现虚构作品，已有记录原样读取；长标题与时间在新卡片中可读

#### Scenario: Persistence fails
- **WHEN** 自动保存、恢复或管理操作失败
- **THEN** 错误持续可见，保留重试和导出入口；不假报成功、不清空内存或原存储

### Requirement: Stable speech presentation
真实语音 SHALL 使用新视觉展示授权、连接、录入、收尾、错误和待确认状态；正文 MUST 至少容纳三行，麦克风中心不得因文字或错误出现而位移。

#### Scenario: Permission and cancellation
- **WHEN** 首次长按、拒绝授权、授权中松手或取消录入
- **THEN** 保留原知情说明与取消语义，未确认内容不提前写成正文；新样式不触发额外录音或服务请求

#### Scenario: Long transcript and error
- **WHEN** 长段转写、收尾或连接错误出现
- **THEN** 文本区可滚动、状态可读，按钮不被推走；已有转写仍可修改、清空或完成

### Requirement: Keep AI isolation visible
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、小文修改说明、待应用、已应用、失败与未开放能力；优化和改文反馈 SHALL 集中在文章会话中，修改说明与候选状态 MUST 分开显示。小文输入区 SHALL 只提供一个明确的主要发送操作，且 MUST 避免用常驻辅助文案重复解释相邻标题、按钮或状态；面向用户的记录名称、字数和时间 MUST 使用直白、适合长辈识别的措辞与精度。普通成功反馈 MUST 不持续占用内容布局，错误补救、正文冲突、数据发送范围、事实核对及覆盖风险 MUST 持续可见。只有明确确认的候选或恢复版本 MUST 写入正文。从优化菜单进入的下级页面 MUST 保留入口上下文，关闭当前页面时返回优化菜单；直接聊天入口或优化菜单顶层关闭时才退出文章助手。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文会话入口；后三项待开放，菜单不直接编辑会话需求或展示分散的候选反馈，不提供与会话入口重复的“查看对话记录”

#### Scenario: Shortcut enters the conversation
- **WHEN** 用户选择常规优化、润色文笔或点击具有输入框外观的小文入口
- **THEN** 快捷优化进入会话并在其中显示生成过程和后续反馈；小文入口只导航到会话，实际输入框在会话中获得焦点，快捷优化的用户消息不得为空白

#### Scenario: Conversational action and result status
- **WHEN** 用户在会话输入文字，或一个候选从待应用变为已应用/未采用
- **THEN** 界面提供至少 48px 的单一“发送”操作；小文回答或修改说明保持独立，候选状态独立显示，“查看结果”为主要操作，已应用候选的“撤销”为同组次级操作；手机无横向溢出，候选不直接改变编辑器

#### Scenario: Transient success and persistent risk
- **WHEN** 候选成功应用、放弃、撤销或恢复，或操作遇到正文冲突、覆盖风险、存储或网络失败
- **THEN** 普通成功确认以不抢焦点且约 3 秒自动消失的提示呈现，真实候选状态与修改记录继续保留；冲突、风险和失败持续可见并保留补救入口

#### Scenario: Modification record placement
- **WHEN** 用户需要从文章优化或会话查看修改记录
- **THEN** 文章优化首页和会话页均在页头提供至少 48px、可访问名称为“查看修改记录”的操作；两页内容区都不再为修改记录单独占行，也不显示独立的对话记录按钮

#### Scenario: Remove repeated helper copy
- **WHEN** 标题、按钮或候选状态已经清楚表达当前操作
- **THEN** 界面不再用教学句重复解释相邻控件，空会话也不显示示例问法；必要的授权、错误、数据范围、事实核对和覆盖风险仍然可见

#### Scenario: Read modification records
- **WHEN** 用户打开文章的修改记录
- **THEN** 界面使用“修改记录”和“字”，时间显示到分钟，不展示正文为空的起始记录；字数、记录来源和恢复覆盖提示仍可见，底层会话记录不被删除

#### Scenario: Close according to the assistant entry
- **WHEN** 用户从文章优化进入会话或下级页面后点击关闭或按 Escape
- **THEN** 当前页面关闭并返回仍然打开的文章优化菜单，会话、候选和进行中的请求保持可用；用户在菜单再次关闭时才退出文章助手

#### Scenario: Close direct chat
- **WHEN** 用户从编辑器“聊天”直接进入小文会话后点击关闭或按 Escape
- **THEN** 文章助手退出并恢复编辑器入口焦点，不额外打开文章优化菜单

### Requirement: Responsive and accessible delivery
界面 SHALL 支持360、390、430手机宽度及桌面800px最大画布、键盘焦点和减少动画；主要操作至少56px，非键盘控件目标至少48px。

#### Scenario: Compact viewport and keyboard
- **WHEN** 小屏写作、切换原生文字输入或用键盘打开/关闭弹层
- **THEN** 无横向溢出，正文与弹层可滚动，焦点可见且退出后恢复；不加入桌面模拟键盘

### Requirement: Accessible AI composer and optimization discovery
正式文章会话 SHALL 让输入框的完整聚焦状态在支持宽度内可见，并提供复用现有腾讯云链路的语音转文字入口；识别文字 MUST 先进入可编辑的会话输入框，不得自动发送文章 AI 请求或修改正文。语音入口 MUST 在准备、连接、录音和收尾阶段提供连续且与真实手势一致的反馈，普通焦点变化不得冒充指针松手，且不得改变正常正文语音输入的授权、识别和待确认行为。编辑器 SHALL 在当前浏览器首次达到 80 个非空白正文字符时，于“优化”操作附近显示一次简短弱提示，并 MUST 避免重复打扰。

#### Scenario: Focus the conversation input
- **WHEN** 用户点击会话输入框或用键盘将焦点移入输入框
- **THEN** 输入框四边的聚焦样式完整可见，不被滚动容器裁切，也不产生横向溢出或布局跳动

#### Scenario: Dictate a conversation request
- **WHEN** 用户已完成授权并持续按住会话语音按钮
- **THEN** 按钮在准备、连接和录音阶段保持按压反馈，分别提示继续按住或松开结束；松开后进入非按压的收尾状态，实时识别文字追加到当前输入框且仍可编辑，系统不自动发送、调用 DeepSeek 或修改文章正文

#### Scenario: Pointer and keyboard release semantics
- **WHEN** 指针长按期间控件因系统界面失焦，或键盘用户松开按键、控件失焦、按 Escape 或页面离开
- **THEN** 单纯指针失焦不结束仍在进行的物理长按；真实 pointer up/cancel 或键盘结束信号只触发一次停止或取消，页面隐藏和卸载仍尽力释放麦克风、音频图和连接

#### Scenario: Preserve working article dictation
- **WHEN** 同一共享手势用于正文语音输入并依次经历授权、连接、录音、收尾、取消或错误
- **THEN** 原正文语音舞台、麦克风位置、转写待确认内容和完成/清空操作保持，不因小文紧凑按钮修复而增加请求、自动写回或丢失转写

#### Scenario: Cancel or fail conversation dictation
- **WHEN** 用户取消、关闭会话、拒绝麦克风，或语音配置、连接、识别失败
- **THEN** 录音尽力终止，录音前的输入保持可用，错误以简短且可读的文字显示，用户仍可继续文字输入或重新授权

#### Scenario: Show the optimization hint once
- **WHEN** 当前浏览器尚未展示过提示且有效正文首次达到 80 个非空白字符
- **THEN** “优化”按钮附近显示“写好后，点‘优化’帮您整理文章。”；提示不抢走正文焦点、不要求确认，并立即记为已展示

#### Scenario: Dismiss or revisit the optimization hint
- **WHEN** 提示显示约 6 秒、用户点击优化、刷新、重新打开文章，或继续输入更多正文
- **THEN** 当前提示自动或立即隐藏且该浏览器不再重复展示；`localStorage` 不可用时至少在当前挂载期间不重复显示

### Requirement: Compact mobile optimization and conversation surfaces
文章优化菜单 SHALL 通过紧凑页头与清晰卡片层级尽量在常见手机的一屏弹窗内展示常规优化、四项按需修改和小文入口，同时 MUST 在主卡、分区、功能卡和会话入口之间保留可辨识的舒适留白，并保留设计规范字号、未开放状态、修改记录、至少 48px 触控目标与短高度内部滚动。小文会话输入区 SHALL 采用紧凑消息输入布局，空值 MUST 固定单行高度且不因提示词换行增高，真实输入随内容自适应增长至限定高度，超过上限后自身滚动；语音和发送操作 MUST 易达且不得遮挡文字。

#### Scenario: Open the full optimization menu on a phone
- **WHEN** 用户在 360×640、390×844 或 430×932 打开文章优化且系统键盘未弹出
- **THEN** 菜单优先完整展示常规优化、润色文笔、精简内容、扩写内容、添加配图和小文入口；卡片不贴挤、分区关系清楚、入口文案不因过长产生额外行，没有横向溢出，极短高度仍可内部滚动到全部入口

#### Scenario: Type a short or long conversation request
- **WHEN** 用户打开空的小文会话输入框，或输入一行及多行要求
- **THEN** 空输入框使用精简提示词并固定 52px，不因提示词测量增高；真实文字使输入框平滑增高，达到限定行数后内部滚动，语音按钮、发送按钮、焦点边框和已输入文字持续可见；输入条下方只保留8px基础间距或更大的系统安全区，不叠加固定大块留白

#### Scenario: Dictate and send from the compact composer
- **WHEN** 用户点按小文语音按钮开始转写，再次点按取消采集后检查文字并点击发送，或语音配置/授权失败后改用文字
- **THEN** 麦克风会话被释放，已显示的识别文字保留在同一自适应输入框且不会自动发送；发送仍为单一明确操作，失败提示不遮住输入或造成内容丢失

### Requirement: Reserved toolbar chat entry
正式编辑器工具栏的“聊天”入口 SHALL 保持可识别但不得复用当前小文会话。用户点击后 MUST 显示“聊天功能暂未开放”的短暂状态提示，且 MUST NOT 打开对话窗口、创建会话或发起 AI 请求。优化弹窗内的小文入口 SHALL 继续按既有行为打开会话。

#### Scenario: Tap toolbar chat before the feature is available
- **WHEN** 用户点击编辑器底部工具栏“聊天”
- **THEN** 当前页面显示“聊天功能暂未开放”，编辑器内容与焦点保持，不打开小文会话且不产生网络请求

#### Scenario: Enter XiaoWen from optimization
- **WHEN** 用户打开“优化”并点击小文入口
- **THEN** 系统仍进入现有小文会话，允许文字输入、点按语音转写和显式发送

### Requirement: Distinct keyboard icon for text mode
编辑器工具栏“文字”页签 SHALL 使用键盘轮廓图标，MUST 保持“文字”标签、选中状态、点击行为和“文字输入”可访问名称不变，不得与待确认内容使用的铅笔修改图标混淆。

#### Scenario: Inspect or select text mode
- **WHEN** 用户查看编辑器工具栏或点击“文字”页签
- **THEN** 页签显示键盘图标并切换到现有当前页全文输入；语音、聊天和优化图标及行为不变
