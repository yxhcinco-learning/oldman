## ADDED Requirements

### Requirement: Adopt the approved visual system
正式产品 SHALL 全面采用已确认的 Echoes 视觉，现行 `DESIGN-SYSTEM.md` MUST 记录色板、排版、组件、真实状态、响应式及可访问性规则；旧设计仅作历史参考。

#### Scenario: Review all product screens
- **WHEN** 打开作品、写作、单段、聊天、优化、配图、菜单、备份、回收站或语音授权
- **THEN** 使用统一暖白纸面、森林绿、赭色、衬线标题、无衬线正文、SVG图标与圆角；不存在混用旧主题的弹层

### Requirement: Preserve real product capabilities
视觉迁移 MUST 保留原生文字输入、真实作品时间与字数、本机保存/恢复、删除恢复和导出备份，不导入预览业务状态或示例数据，不修改存储/语音协议。

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
聊天和优化 SHALL 保留现有副本模拟行为及清楚的模拟标识，所有完成、应用、配图和撤销 MUST 不修改真实作品。

#### Scenario: Exit after changing the copy
- **WHEN** 用户完成聊天或应用/撤销优化后退出
- **THEN** 回到原真实编辑状态，存储记录未改变；新的视觉不会暗示模拟结果已保存

### Requirement: Responsive and accessible delivery
界面 SHALL 支持360、390、430手机宽度及桌面800px最大画布、键盘焦点和减少动画；主要操作至少56px，非键盘控件目标至少48px。

#### Scenario: Compact viewport and keyboard
- **WHEN** 小屏写作、切换原生文字输入或用键盘打开/关闭弹层
- **THEN** 无横向溢出，正文与弹层可滚动，焦点可见且退出后恢复；不加入桌面模拟键盘
