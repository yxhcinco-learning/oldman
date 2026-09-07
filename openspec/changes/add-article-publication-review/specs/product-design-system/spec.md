## ADDED Requirements

### Requirement: Publication navigation and author preview
系统 SHALL 将“文章”作为公共列表，将私有作品和原有工具放入“我的 → 我的文章”。新增发表流程沿用纸面风格、18px 正文、至少 56px 主操作和 48px 触控；封面为作者选图，列表 1:1、阅读及好友分享 5:4，预览呈现真实用户名和默认头像，并可就地改名。

#### Scenario: Article list controls respect the native layout
- **WHEN** 在 360×640、390×844 或 430×932 打开文章 Tab 的空列表、失败或有内容状态
- **THEN** 使用与其他主 Tab 一致的自定义品牌导航，不叠加原生标题栏；刷新为页头右侧至少 48px 的浅绿次级按钮，写文章为导航栏上方至少 56px 的全宽主按钮，与页面左右 24px、小屏 20px 边距对齐，显式设置宽度、最小宽度和边距以避免微信默认按钮样式干扰

#### Scenario: Move between editing and publication
- **WHEN** 作者进入预览、修改用户名、重新裁切或返回编辑
- **THEN** 始终为同一篇作品，正文及封面设置保留，正常页面不常驻同步说明，键盘和安全区不遮挡操作

### Requirement: Coherent client journey
客户端 SHALL 统一按钮宽度、最小触控尺寸、主次层级、页面边距与返回导航。主要推进操作使用森林绿胶囊，辅助编辑使用浅绿或文字操作，危险操作单独分组并保留确认。界面 MUST 根据实际宽度与安全区调整，不以缩小字号、裁掉按钮文案或搬用旧首页代替适配。

#### Scenario: Browse and manage different content
- **WHEN** 读者浏览公共文章或作者打开我的文章
- **THEN** 公共列表突出真实方形封面、标题及署名；我的文章突出标题、字数、真实时间及发表状态，移除旧首页大插画与口号，不常驻保存标签；可筛选全部、草稿、审核中、已发表，失败状态不冒充草稿，回收站和恢复稿操作继续可达

#### Scenario: Publication has one clear next action
- **WHEN** 作者选择封面、确认两种裁切、查看预览或进入待审核状态
- **THEN** 封面阶段显示明确的两种裁切及确认进度，预览阶段突出正文并可主动展开列表/好友效果，待审页显示文章和审核状态而不同时堆叠裁切表单；每个状态只有一个突出主操作，修改署名、封面、撤回按上下文展示；重新进入待审作品仍显示真实审核状态

#### Scenario: Narrow screens and long content
- **WHEN** 360×640、390×844、430×932 展示长标题/用户名、封面、预览正文、工具抽屉、错误或回收站
- **THEN** 主要按钮至少 56px，其余交互至少 48px；按钮不受原生默认宽度挤压，不横向溢出；正文与弹层可滚动到末尾，页头、确认/补救操作与安全区互不遮挡，返回保留同篇输入

#### Scenario: Long feed titles and topic sources
- **WHEN** 公共列表标题很长或话题含有来源链接
- **THEN** 列表标题最多展示三行，详情保留完整标题
- **AND** 话题来源保持可见、可读，并可滚动至固定操作栏上方
