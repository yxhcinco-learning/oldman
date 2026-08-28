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
正式编辑器 SHALL 在两种模式中显示相同的“输入标题”和“从想说的一句话开始……”提示，标题26px/36px衬线、正文18px/32px无衬线；标题和输入后的字号一致，提示较正文柔和。标题浅分隔线、正文起点与间距 MUST 一致。

#### Scenario: Switch an empty draft
- **WHEN** 空白作品在语音与文字模式间切换
- **THEN** 标题与正文提示的文案、字体及位置一致，标题下浅线在两种模式都存在，不增加段落分隔线

#### Scenario: Delete the final paragraph
- **WHEN** 用户清空正文或通过单段编辑删除最后一段
- **THEN** 两种模式重新显示统一的空白提示，提示不作为正文保存

### Requirement: Retain editing and recovery
系统 SHALL 保留原生文字输入、可访问的单段编辑、待确认语音和本机自动保存/恢复；文章 AI 会话升级 SHALL 采用事务添加存储并兼容旧备份，不丢弃用户已有记录。

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
底部四个工具 SHALL 采用新设计的图标和短标签、保留完整可访问名称，麦克风保持固定网格；文章 AI 接入 MUST 不改变语音录制/取消/待确认状态和本机访问边界，未确认 AI 结果与正文分离。

#### Scenario: Pending or cancelled recording
- **WHEN** 语音仍待确认或用户取消本次录音
- **THEN** 已确认正文不被提前追加或替换，原待确认与取消流程继续生效

#### Scenario: Responsive editor
- **WHEN** 在360×640、390×844、430×932和桌面查看空白或长文编辑器
- **THEN** 正文无横向溢出，桌面画布最大800px，底部工具与麦克风可见；桌面回归不冒充真机录音或键盘验收
