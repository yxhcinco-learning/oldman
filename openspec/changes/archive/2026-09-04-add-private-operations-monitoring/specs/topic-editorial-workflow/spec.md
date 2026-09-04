## ADDED Requirements

### Requirement: Standard administrative workspace
话题后台 SHALL 使用区别于用户端阅读视觉的中性、紧凑、系统无衬线管理布局，并具有稳定顶栏、清楚主导航、高效筛选、状态标签、有边界面板和充分使用可用宽度的桌面列表/详情工作区。

#### Scenario: Work on a desktop
- **WHEN** 编辑在 1280×900 或 1440×900 打开话题列表
- **THEN** 侧栏、约 380px 的话题列表与弹性详情面板无页面横向滚动地并排显示，标题和控件采用紧凑后台排版，未选详情也位于明确工作面板内而不是无边界空白画布

#### Scenario: Work on a phone
- **WHEN** 编辑在 390×844 打开后台
- **THEN** 导航变为可安全滚动的顶部单行，面板形成可读单列，控件保持至少 44px 点击区，排期和紧急下线无页面横向滚动且仍可达

#### Scenario: Inspect runtime operations
- **WHEN** 编辑选择“运行监控”导航
- **THEN** 后台显示受保护的当前进程监控面板、可见刷新操作和范围说明，并与不可变编辑审计历史明确区分
