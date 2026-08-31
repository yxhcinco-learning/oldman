## ADDED Requirements

### Requirement: Keyboard-visible editor chrome
正式编辑器 SHALL 在系统键盘改变移动浏览器可视视口时按实际可见高度与顶部偏移约束应用画布；页头、正文滚动区和底部四项工具栏 MUST 保持在同一可视区域内，正文焦点和输入内容不得因适配丢失。不支持 Visual Viewport API 时 MUST 回退现有动态视口布局。

#### Scenario: Type with a mobile system keyboard
- **WHEN** 用户在文字模式聚焦标题或正文，系统键盘使可视视口高度缩小或顶部发生偏移
- **THEN** 页头和“语音 / 文字 / 聊天 / 优化”工具栏仍可见，正文在二者之间滚动且当前输入保持，不产生横向溢出

#### Scenario: Keyboard closes or browser lacks the API
- **WHEN** 系统键盘关闭、浏览器工具栏变化，或环境不提供 Visual Viewport API
- **THEN** 画布恢复当前可见高度或使用 `100dvh` 回退，焦点、滚动内容与保存状态保持，不加入模拟键盘

### Requirement: Collapsible article speech stage
正文语音模式 SHALL 在空闲且没有待确认文字时展示明确的“收起语音输入”操作；收起 MUST 完全隐藏语音舞台且不得保留独立展开条，并保留当前输入模式和已有正文。待确认文字出现后，收起操作 MUST 被互斥的“取消 / 完成”状态替代。连接、录音或收尾活动期间 MUST 阻止隐藏关键状态。

#### Scenario: Collapse and reopen idle dictation
- **WHEN** 用户在默认展开且没有待确认文字的语音面板点击“收起语音输入”，随后单击正文或点击已选中的“语音”工具
- **THEN** 语音舞台先完全消失且不显示展开条，再恢复原麦克风、提示和固定网格；不请求麦克风、不新增转写或正文

#### Scenario: Pending speech replaces collapse controls
- **WHEN** 用户已有待确认转写
- **THEN** 收起按钮不显示，左右控制位只显示“取消 / 完成”；取消清空待确认文字、完成并入正文，两者处理后恢复空闲收起按钮

#### Scenario: Preserve active speech safety
- **WHEN** 语音处于授权、连接、录音或收尾状态
- **THEN** 收起与待确认操作均不显示，页面隐藏、取消和失败仍按既有规则释放资源，已收到文字不因界面切换丢失

### Requirement: Direct current-page article editing
普通已确认正文 SHALL 不再打开独立段落编辑页；用户 MUST 能通过“文字”页签、在语音预览正文上快速双击或触屏长按，切换到当前页面全文输入并直接编辑。长按检测 MUST NOT 阻止系统默认选词、上下文或滚动事件。语音待确认小窗口 SHALL 继续允许打开独立编辑页，且不得提前并入正文；点击待确认文字时，编辑页光标 MUST 落在点击对应位置。

#### Scenario: Tap or double-tap the article body
- **WHEN** 语音舞台已收起且用户单击普通正文区域
- **THEN** 系统恢复语音舞台并保持语音页签；若用户快速双击同一区域，系统恢复舞台后切换“文字”页签、在当前页面显示全文输入并聚焦，不打开“编辑这一段”页面

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
标题 SHALL 与当前页正文使用同一文字编辑状态。若用户在语音模式聚焦标题，系统 MUST 在键盘出现前切换到文字态并隐藏语音舞台，同时 MUST 保持标题焦点、标题值、普通正文、待确认语音与恢复状态。全文输入框聚焦时 MUST NOT 显示无语义的底部横线；空闲语音收起按钮 MUST 在左侧控制位内居中，不得贴靠屏幕左缘。

#### Scenario: Focus the title while voice mode is expanded
- **WHEN** 用户在展开的语音模式点击标题并唤起系统键盘
- **THEN** 编辑器切换到“文字”页签、语音舞台不再被键盘顶起显示，标题继续获得焦点且正文和待确认语音均保持；不会把焦点转移到全文输入框

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
语音待确认文字编辑页 SHALL 删除重复引导句，MUST 在页头右侧显示“取消”并在取消时丢弃本页临时修改、保留进入页面前的待确认文字；底部“完成修改” MUST 仍是唯一写回编辑值的操作。字数与完成按钮之间 SHALL 使用紧凑的同组间距，不得因正文弹性高度额外叠加大块底部留白。

#### Scenario: Cancel or complete pending-speech editing
- **WHEN** 用户修改待确认语音文字后点击页头“取消”，或重新进入后点击“完成修改”
- **THEN** 取消返回语音舞台并恢复原待确认文字；完成返回语音舞台并显示编辑后的待确认文字，两条路径均不提前并入普通正文
