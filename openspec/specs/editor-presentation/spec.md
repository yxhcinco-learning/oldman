> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/PRODUCT.md 与 active-client-scope 规范。

# editor-presentation Specification

## Purpose

规定正式编辑器在语音与文字模式下统一的正文和空白提示展示，保留自然换行、可访问的单段编辑、本机保存恢复及既有语音与布局边界。
## Requirements
### Requirement: Consistent article presentation
正式编辑器 SHALL 在语音与文字模式中采用一致的正文宽度、左对齐、字体、字号、颜色和行高，不显示段落编号、卡片、额外缩进或分隔横线；正文自身的换行和自然段 MUST 保留。

#### Scenario: Confirmed voice text
- **WHEN** 用户完成一段或多段语音输入
- **THEN** 已确认内容按普通文章排版显示，与文字输入模式一致，没有可见编号或横线

#### Scenario: Multiline and long articles
- **WHEN** 同一篇包含中文、单行换行、空行或长段落的文章在两种模式间切换
- **THEN** 同一正文使用相同的字体、行高和可用宽度，原文不因展示调整而丢失，长文可滚动阅读

### Requirement: Consistent empty editor
正式编辑器 SHALL 在语音与文字模式中保持相同的正文18px/32px及“从想说的一句话开始……”提示；标题只在页头显示，空标题用“点击编辑标题”，正文区不重复标题输入或分隔线。

#### Scenario: Switch an empty draft
- **WHEN** 空白作品切换语音与文字模式
- **THEN** 正文提示文案、字体及位置一致，页头标题入口不变

#### Scenario: Delete the final paragraph
- **WHEN** 用户清空正文
- **THEN** 重新显示统一空白提示，提示不作为正文保存

### Requirement: Retain editing and recovery
系统 SHALL 保留原生文字输入、可访问的当前页全文编辑和待确认语音编辑、待确认语音和本机自动保存/恢复；文章 AI 会话升级 SHALL 采用事务添加存储并兼容旧备份，不丢弃用户已有记录。

#### Scenario: Edit a paragraph without visible numbering
- **WHEN** 用户通过可见文字切换入口编辑普通正文
- **THEN** 进入当前页全文输入，不打开旧普通段落编辑页；待确认语音仍独立编辑，旧恢复格式保持兼容

#### Scenario: Recover an unfinished edit
- **WHEN** 未完成的正文或单段编辑已自动保存后刷新
- **THEN** 恢复原内容及编辑状态，完成编辑后使用统一正文展示

#### Scenario: Failed persistence
- **WHEN** 本机保存失败或出现修订冲突
- **THEN** 保留内存正文和原错误提示/重试/导出入口，不把失败显示为保存成功

### Requirement: Keep speech and layout boundaries
底部工具 SHALL 使用一个至少 48px 的小按钮槽位交替显示目标输入方式，并通过分隔和单一“小文”操作表达文章级写作伙伴。文字态 MUST 显示“切换到语音输入”的麦克风图标，语音态 MUST 显示“切换到文字输入”的键盘图标；模式按钮和小文入口 MUST 采用设计规范图标、短标签、焦点和完整可访问名称。模式按钮 MUST 使用与 Echoes 工具栏、小文入口协调的浅绿纸面色，不得以纯白底加外投影形成突兀悬浮层。工具栏 MUST 不再显示并列“语音 / 文字”大页签、独立“聊天 / 优化”操作或未开放聊天提示。麦克风保持固定网格；小文接入 MUST 不改变语音录制/取消/待确认状态和本机访问边界，未确认 AI 结果与正文分离。

#### Scenario: Use the unified XiaoWen entry
- **WHEN** 用户查看编辑器底部工具栏并点击“小文”
- **THEN** 工具栏显示单个输入模式切换按钮和带叶片图标的“小文”操作，直接打开同篇文章会话；不显示并列“语音 / 文字”、“聊天”“优化”或“聊天功能暂未开放”，点击小文本身不发送请求或修改正文

#### Scenario: Alternate the target input icon
- **WHEN** 用户在文字态点击麦克风小按钮，或在语音态点击键盘小按钮
- **THEN** 前者只切换并展示语音舞台且不开始录音，后者切换全文文字输入、恢复光标并唤起系统键盘；按钮始终改为下一目标模式图标，正文和待确认内容保持

#### Scenario: Blend the target input control into the toolbar
- **WHEN** 用户在文字态或语音态查看、悬停或聚焦目标模式按钮
- **THEN** 默认圆形触控区域使用与小文入口协调的浅绿纸面色且没有外投影，悬停只在同色系轻微加深；键盘焦点仍保留清楚轮廓，图标对比度和至少 48px 触控面积不变

#### Scenario: Pending or cancelled recording
- **WHEN** 语音仍待确认或用户取消本次录音
- **THEN** 已确认正文不被提前追加或替换，原待确认与取消流程继续生效；小文 dialogue 不受正文待确认内容阻拦且不将它发送；候选采用、撤销与恢复仍保护待确认内容，不隐藏或清空

#### Scenario: Responsive editor
- **WHEN** 在 360×640、390×844、430×932 查看空白或长文编辑器
- **THEN** 正文无横向溢出，按微信窗口布局，模式切换、小文入口、语音麦克风和安全区可见；布局不依赖缩小标签或触控目标，视觉继续使用 Echoes 而不模仿参考截图，桌面回归不冒充真机录音或键盘验收

### Requirement: Keyboard-visible editor chrome
正式编辑器 SHALL 依据微信窗口变化、原生键盘高度事件和安全区进行一次键盘避让；页头、正文滚动区、输入方式切换和小文入口 MUST 保持可达，原生自动避让与手动补偿不得叠加。

#### Scenario: Type with a mobile system keyboard
- **WHEN** 用户聚焦标题或正文并唤起系统键盘
- **THEN** 只补偿窗口缩小未覆盖的高度，正文在页头与操作区之间滚动，输入不丢失，不自动打开小文或发送请求

#### Scenario: Keyboard closes
- **WHEN** 键盘关闭或输入失焦
- **THEN** 清除残留补偿并恢复底部安全区，保留正文、保存与小文状态，不加入模拟键盘

### Requirement: Collapsible article speech stage
正文语音模式 SHALL 在空闲且没有待确认文字时展示明确的“收起语音输入”操作；收起 MUST 完全隐藏语音舞台且不得保留独立展开条，并保留当前输入模式和已有正文。待确认文字出现后，收起操作 MUST 被互斥的“取消 / 完成”状态替代。连接、录音或收尾活动期间 MUST 阻止隐藏关键状态。

#### Scenario: Collapse and reopen idle dictation
- **WHEN** 用户在默认展开且没有待确认文字的语音面板点击“收起语音输入”，随后单击正文或通过语音输入方式入口
- **THEN** 语音舞台先完全消失且不显示展开条，再恢复原麦克风、提示和固定网格；不请求麦克风、不新增转写或正文

#### Scenario: Pending speech replaces collapse controls
- **WHEN** 用户已有待确认转写
- **THEN** 收起按钮不显示，左右控制位只显示“取消 / 完成”；取消清空待确认文字、完成并入正文，两者处理后恢复空闲收起按钮

#### Scenario: Preserve active speech safety
- **WHEN** 语音处于授权、连接、录音或收尾状态
- **THEN** 收起与待确认操作均不显示，页面隐藏、取消和失败仍按既有规则释放资源，已收到文字不因界面切换丢失

### Requirement: Direct current-page article editing
原生平台 SHALL 以可见的文字切换入口和当前页全文编辑为必备路径；下述字符坐标与浏览器精确手势仅为历史兼容，不要求小程序实现 DOM API。微信不支持的精确手势按 wechat-miniprogram-client 的平台降级规则处理，不能阻塞基本编辑。
普通已确认正文 SHALL 不再打开独立段落编辑页；用户 MUST 能通过可见文字切换按钮、在语音预览正文上快速双击或触屏长按，切换到当前页面全文输入并直接编辑。长按检测 MUST NOT 阻止系统默认选词、上下文或滚动事件。语音待确认小窗口 SHALL 继续允许打开独立编辑页，且不得提前并入正文；点击待确认文字时，编辑页光标 MUST 落在点击对应位置。

#### Scenario: Tap or double-tap the article body
- **WHEN** 语音舞台已收起且用户单击普通正文区域
- **THEN** 系统恢复语音舞台并保持语音模式；若平台支持双击切换且用户快速双击同一区域，系统恢复舞台后切换文字模式、在当前页面显示全文输入并聚焦，不打开“编辑这一段”页面

#### Scenario: Preserve the tapped caret position when switching to text
- **WHEN** 用户在语音预览正文的某个字符位置快速双击
- **THEN** 系统以第二次点击的位置切换到当前页全文输入，系统键盘被唤起，`selectionStart` 与 `selectionEnd` 相等且折叠光标在对应字符位置闪烁，不选择整段、不跳到开头或文末，正文及段落分隔保持不变
- **AND** 若第二次点击落在正文空白或浏览器无法取得坐标光标，折叠光标稳定回退到文末；空正文回退到位置 0

#### Scenario: Long-press the article without blocking native gestures
- **WHEN** 用户用触屏或触控笔在语音预览正文某个字符位置持续按住约600ms且移动不超过10px
- **THEN** 系统不阻止默认选择或上下文事件，并额外切换到当前页全文输入，聚焦后折叠光标落在按住位置；正文内容不变
- **AND** 若用户提前抬起、取消或移动超过10px，长按切换被取消，单击/双击与浏览器滚动继续按原行为处理

#### Scenario: Edit pending speech separately
- **WHEN** 用户点击语音舞台中待确认文字的某个字符位置
- **THEN** 系统仍打开独立的待确认文字编辑页，textarea 获得焦点且折叠光标停在对应字符位置；完成编辑后返回语音待确认状态，取消或完成前不改普通正文
- **AND** 点击提示/图标或无法取得坐标光标时回退到待确认文字末尾，状态提示文字不得计入转写偏移

#### Scenario: Recover a legacy unfinished paragraph edit
- **WHEN** 打开包含旧版普通段落未完成编辑恢复数据的作品
- **THEN** 系统无损合入该编辑文字并进入当前页文字输入，不重新展示独立普通段落编辑页

### Requirement: Stable title editing beside the speech stage
标题 SHALL 使用页头触发的独立文字输入弹窗。若用户在语音模式打开标题编辑，系统 MUST 保持正文 `inputMode`、语音舞台展开状态、标题值、普通正文、待确认语音与恢复状态；弹窗关闭后 MUST 返回相同正文模式，不得把焦点转移到全文输入框。全文输入框聚焦时 MUST NOT 显示无语义的底部横线；空闲语音收起按钮 MUST 在左侧控制位内居中，不得贴靠屏幕左缘。

#### Scenario: Edit the title while voice mode is expanded
- **WHEN** 用户在展开的语音模式点击页头标题并在独立弹窗中唤起系统键盘
- **THEN** 标题输入获得焦点，正文仍保持“语音”模式且正文和待确认语音均不变；关闭弹窗后恢复原语音舞台，不会把焦点转移到全文输入框

#### Scenario: Focus the current-page body or inspect idle speech controls
- **WHEN** 用户聚焦当前页全文输入，或返回空闲展开的语音模式
- **THEN** 全文输入区底部不出现额外横线，收起按钮在左侧控制位内居中且与麦克风及右侧操作保持平衡

### Requirement: Header title editing and concise speech text
正式编辑器 SHALL 在页头显示当前文章标题，空标题时 MUST 显示“点击编辑标题”，正文滚动区 MUST NOT 再保留独立标题输入行。页头标题操作 MUST 打开使用原生单行文字输入的独立弹窗；只有明确确认才更新标题，关闭、Escape 或取消 MUST 保留原标题、正文输入模式、正文与待确认语音。空闲语音提示 MUST 删除“文字会在这里轻轻落下。”并保持轻波形、剩余提示和固定语音控制对齐。

#### Scenario: Edit a title from the header
- **WHEN** 用户在无标题文章点击页头“点击编辑标题”，输入标题并确认
- **THEN** 弹窗使用普通文字输入并自动聚焦，确认后页头显示新标题，正文区域获得原标题行释放的空间，正文输入模式与内容不变

#### Scenario: Cancel a title edit or reopen an existing title
- **WHEN** 用户打开已有标题的编辑弹窗后修改临时文字，再点击取消、关闭或按 Escape
- **THEN** 弹窗关闭且页头继续显示进入弹窗前的标题，正文、待确认语音、保存状态和语音/文字模式不变

#### Scenario: Show the concise idle speech prompt
- **WHEN** 语音舞台空闲且没有待确认文字
- **THEN** 页面只显示轻波形和“不着急，慢慢说。”，不显示“文字会在这里轻轻落下。”，麦克风与收起控制仍保持原固定对齐

### Requirement: Explicit pending-speech edit actions
语音待确认文字编辑页 SHALL 删除重复引导句，MUST 在页头左侧显示“取消”、右侧留空，并在取消时丢弃本页临时修改、保留进入页面前的待确认文字；底部“完成修改” MUST 仍是唯一写回编辑值的操作。字数与完成按钮之间 SHALL 使用紧凑的同组间距，不得因正文弹性高度额外叠加大块底部留白。

#### Scenario: Cancel or complete pending-speech editing
- **WHEN** 用户修改待确认语音文字后点击页头左侧“取消”，或重新进入后点击“完成修改”
- **THEN** 取消返回语音舞台并恢复原待确认文字；完成返回语音舞台并显示编辑后的待确认文字，两条路径均不提前并入普通正文
