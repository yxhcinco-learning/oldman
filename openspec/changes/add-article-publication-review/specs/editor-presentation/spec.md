## ADDED Requirements

### Requirement: Explicit next step to publication
编辑页 SHALL 在底部提供清晰“下一步”，与语音切换及小文分工，先刷盘当前输入后进入发表。缺标题复用现有标题编辑，空正文不能投稿；未确认输入不能自动采用。

#### Scenario: Compact toolbar and consistent text baseline
- **WHEN** 作者在原编辑器切换文字/语音、输入正文或打开小文
- **THEN** 左侧输入切换与小文是48px高的紧凑工具组，右侧下一步为88×48px；所有控件16px无衬线，提示与真实正文同18/32px排版及顶部起点；保留小文处理/新回复/错误状态提示，不因空间变窄隐藏功能

#### Scenario: Failed save blocks next step
- **WHEN** 点击下一步但本机保存失败
- **THEN** 保留当前编辑现场和重试、导出入口，不跳转或假报成功

#### Scenario: Valid confirmed text
- **WHEN** 正文及标题有效且保存成功
- **THEN** 同篇进入发表设置，阅读预览为可选入口；原编辑器布局、标题编辑、语音及小文保持，保留私有候选、会话及待确认语音，返回可继续写
