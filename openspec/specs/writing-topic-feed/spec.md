# writing-topic-feed Specification

## Purpose
TBD - created by archiving change add-topic-guided-writing. Update Purpose after archive.
## Requirements
### Requirement: Curated writing topic surface
系统 SHALL 为目标用户提供数量克制的当日议题、周期主题和慢议题，并 MUST 以“热门”这一自然内容入口呈现；“热门”“文章”“我的” MUST 按此顺序作为三个固定底部导航页面，“热门” SHALL 是默认首屏。导航项 MUST 同时使用克制图标、文字和当前态表达目的地，不得在内容区顶部再放同义页签，也不得在同一条长页面中混排完整作品列表和议题列表。“我的”一期只承载作品与备份等个人数据入口，不伪造账号、头像或社区身份。正式入口不得直接展示未审核热搜、无限信息流或由模型自动发布的议题。

#### Scenario: Browse a small set of writing topics
- **WHEN** 用户从固定底部导航切换到“热门”
- **THEN** 系统默认在首个导航项展示有限数量的近期、时令和常青内容；“文章”页面不再同时堆叠这些卡片，内容区顶部不重复显示页签，用户可随时切回文章

#### Scenario: Finish the topic list near the navigation
- **WHEN** 用户滚动到热门话题列表末尾
- **THEN** 最后一张话题卡与固定底部导航之间只保留正常内容留白，不出现一块看似缺少内容的大片空白区域

#### Scenario: Keep new article creation visible above navigation
- **WHEN** 用户切换到“文章”页面并查看已有作品或空态
- **THEN** “开始写作”固定在底部主导航上方，不随作品列表滚动下沉，并且不使用方向箭头暗示额外层级；作品列表仍可独立滚动

#### Scenario: Open the lightweight personal page
- **WHEN** 用户从固定底部导航切换到“我的”
- **THEN** 系统显示真实的作品与备份入口及本机保存说明，不显示虚构账号资料；“热门”“文章”“我的”三个导航项保持至少 48px 可点击且当前项同时用图标、文字和视觉状态表达

#### Scenario: Topic service is unavailable
- **WHEN** 议题服务断网、超时或没有已审核内容
- **THEN** 系统显示真实的暂不可用或暂无议题状态，已有作品和本机写作仍可进入，不用模拟新闻或未审核内容填充

### Requirement: Traceable topic brief
每个正式议题 MUST 显示可读的事实摘要、议题更新时间、至少一个可访问来源以及一个或多个相关切面；AI 辅助生成的摘要、内部编辑判断、角度和问题 MUST 在发布前经过审核，不得冒充来源原文或用户观点。前台 MUST 不显示“为什么值得写”“可以从这里想起”“看看背景与角度”等编辑流程或任务式措辞。

#### Scenario: Inspect sources before writing
- **WHEN** 用户打开一个正式议题
- **THEN** 系统自然显示事实摘要、更新时间、来源标题与链接及“大家也在关心”的相关切面；命令式角度转成中性短语，内部 `whyItMatters` 不作为用户栏目展示，来源不可用时明确标记而不伪造内容

#### Scenario: Correct a published topic
- **WHEN** 已发布事件出现重要更正或新增事实
- **THEN** 系统发布带新修订和更新时间的议题，已基于旧版开始的作品保留原快照并获得可见更新提示，不被静默替换

### Requirement: Editorial publication boundary
议题系统 SHALL 将采集内容、AI 加工候选和正式发布记录分开保存；只有已通过发布审核的议题才能进入用户端，来源内容 MUST 遵守允许的摘要与链接边界。

#### Scenario: AI produces a candidate brief
- **WHEN** 自动或人工流程让 AI 根据来源生成摘要、角度或起始问题
- **THEN** 结果只进入待审核状态，不直接出现在用户首页；审核者可对照来源修改、拒绝或发布

#### Scenario: Source is unsafe or rights are unclear
- **WHEN** 来源真实性、发布时间、访问许可或内容权利无法满足发布规则
- **THEN** 该来源不得作为正式议题事实依据，系统不复制其完整内容或用 AI 改写掩盖来源问题
