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
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、待采用、已采用、失败与未开放能力；只有明确确认的候选或恢复版本 MUST 写入正文。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文文字入口；后三项待开放，真实结果可预览、确认、撤销和追问

### Requirement: Responsive and accessible delivery
界面 SHALL 支持360、390、430手机宽度及桌面800px最大画布、键盘焦点和减少动画；主要操作至少56px，非键盘控件目标至少48px。

#### Scenario: Compact viewport and keyboard
- **WHEN** 小屏写作、切换原生文字输入或用键盘打开/关闭弹层
- **THEN** 无横向溢出，正文与弹层可滚动，焦点可见且退出后恢复；不加入桌面模拟键盘
