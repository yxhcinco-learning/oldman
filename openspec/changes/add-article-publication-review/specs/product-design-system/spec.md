## ADDED Requirements

### Requirement: Publication navigation and author preview
系统 SHALL 将“文章”作为公共列表，将私有作品和原有工具放入“我的 → 我的文章”。新增发表流程沿用纸面风格、18px 正文、至少 56px 主操作和 48px 触控；封面为作者选图，列表 1:1、阅读及好友分享 5:4，预览呈现真实用户名和默认头像，并可就地改名。

#### Scenario: Article list controls respect the native layout
- **WHEN** 在 360×640、390×844 或 430×932 打开文章 Tab 的空列表、失败或有内容状态
- **THEN** 使用与其他主 Tab 一致的自定义品牌导航，不叠加原生标题栏；刷新为页头右侧至少 48px 的浅绿次级按钮，写文章为导航栏上方至少 56px 的全宽主按钮，与页面左右 24px、小屏 20px 边距对齐，显式设置宽度、最小宽度和边距以避免微信默认按钮样式干扰

#### Scenario: Move between editing and publication
- **WHEN** 作者进入预览、修改用户名、重新裁切或返回编辑
- **THEN** 始终为同一篇作品，正文及封面设置保留，正常页面不常驻同步说明，键盘和安全区不遮挡操作
