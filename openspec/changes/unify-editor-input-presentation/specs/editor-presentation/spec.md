## ADDED Requirements

### Requirement: Consistent article presentation
正式编辑器 SHALL 在语音与文字模式中采用一致的正文宽度、左对齐、字体、字号、颜色和行高，不显示段落编号、卡片、额外缩进或分隔横线；正文自身的换行和自然段 MUST 保留。

#### Scenario: Confirmed voice text
- **WHEN** 用户完成一段或多段语音输入
- **THEN** 已确认内容按普通文章排版显示，与文字输入模式一致，没有可见编号或横线

#### Scenario: Multiline and long articles
- **WHEN** 同一篇包含中文、单行换行、空行或长段落的文章在两种模式间切换
- **THEN** 同一正文使用相同的字体、行高和可用宽度，原文不因展示调整而丢失，长文可滚动阅读

### Requirement: Consistent empty editor
正式编辑器 SHALL 在两种模式中显示相同的“输入标题”和“在这里输入想写的话……”提示，标题保留现有样式，正文提示采用文字模式的 18px 宋体、1.85 行高及 #aba99f 颜色；提示位置和标题下方间距 MUST 一致。

#### Scenario: Switch an empty draft
- **WHEN** 空白作品在语音与文字模式间切换
- **THEN** 标题与正文提示的文案和视觉一致，语音模式不增加标题下分隔线或额外上内边距

#### Scenario: Delete the final paragraph
- **WHEN** 用户清空正文或通过单段编辑删除最后一段
- **THEN** 两种模式重新显示统一的空白提示，提示不作为正文保存

### Requirement: Retain editing and recovery
系统 SHALL 保留原生文字输入、可访问的单段编辑、待确认语音和本机自动保存/恢复；本次 MUST 不修改数据库版本、备份格式或用户已有记录。

#### Scenario: Edit a paragraph without visible numbering
- **WHEN** 用户点击语音模式正文中的一段，或用键盘激活该段
- **THEN** 仍进入原单段编辑界面，完成后只修改目标段，读屏可识别该编辑入口

#### Scenario: Recover an unfinished edit
- **WHEN** 未完成的正文或单段编辑已自动保存后刷新
- **THEN** 恢复原内容及编辑状态，完成编辑后使用统一正文展示

#### Scenario: Failed persistence
- **WHEN** 本机保存失败或出现修订冲突
- **THEN** 保留内存正文和原错误提示/重试/导出入口，不把失败显示为保存成功

### Requirement: Keep speech and layout boundaries
本次展示调整 MUST 不改变底部四个工具、麦克风固定位置、语音的录制/取消/待确认状态、AI 模拟隔离或本机访问边界。

#### Scenario: Pending or cancelled recording
- **WHEN** 语音仍待确认或用户取消本次录音
- **THEN** 已确认正文不被提前追加或替换，原待确认与取消流程继续生效

#### Scenario: Responsive editor
- **WHEN** 在 360×640、390×844、430×932 和桌面查看空白或长文编辑器
- **THEN** 正文无横向溢出，底部控件与麦克风保持原布局且可见；桌面回归不冒充真机录音或键盘验收
