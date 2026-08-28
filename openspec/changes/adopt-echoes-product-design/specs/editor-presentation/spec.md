## MODIFIED Requirements

### Requirement: Consistent empty editor
正式编辑器 SHALL 在两种模式中显示相同的“输入标题”和“从想说的一句话开始……”提示，标题26px/36px衬线、正文18px/32px无衬线；标题和输入后的字号一致，提示较正文柔和。标题浅分隔线、正文起点与间距 MUST 一致。

#### Scenario: Switch an empty draft
- **WHEN** 空白作品在语音与文字模式间切换
- **THEN** 标题与正文提示的文案、字体及位置一致，标题下浅线在两种模式都存在，不增加段落分隔线

#### Scenario: Delete the final paragraph
- **WHEN** 用户清空正文或通过单段编辑删除最后一段
- **THEN** 两种模式重新显示统一的空白提示，提示不作为正文保存

### Requirement: Keep speech and layout boundaries
底部四个工具 SHALL 采用新设计的图标和短标签、保留完整可访问名称，麦克风保持固定网格；展示迁移 MUST 不改变语音录制/取消/待确认状态、AI模拟隔离和本机访问边界。

#### Scenario: Pending or cancelled recording
- **WHEN** 语音仍待确认或用户取消本次录音
- **THEN** 已确认正文不被提前追加或替换，原待确认与取消流程继续生效

#### Scenario: Responsive editor
- **WHEN** 在360×640、390×844、430×932和桌面查看空白或长文编辑器
- **THEN** 正文无横向溢出，桌面画布最大800px，底部工具与麦克风可见；桌面回归不冒充真机录音或键盘验收
