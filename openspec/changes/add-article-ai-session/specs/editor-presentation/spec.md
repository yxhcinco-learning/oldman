## MODIFIED Requirements

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
