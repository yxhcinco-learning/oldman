> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

# writing-topic-feed Specification

## Purpose
定义面向写作者的少量人工精选热门入口、可选来源详情、话题快照、版本更新和直接写作/采访边界，确保服务失败、无来源或席位空缺时仍诚实呈现且不影响本机作品。
## Requirements
### Requirement: Curated writing topic surface
系统 SHALL 为目标用户提供数量克制的当日议题、周期主题和慢议题，并 MUST 以“热门”这一自然内容入口呈现；“热门”“文章”“我的” MUST 按此顺序作为三个固定底部导航页面，“热门” SHALL 是默认首屏。导航项 MUST 同时使用克制图标、文字和当前态表达目的地，不得在内容区顶部再放同义页签，也不得在同一条长页面中混排完整作品列表和议题列表。“我的”一期只承载作品与备份等个人数据入口，不伪造账号、头像或社区身份。正式入口不得直接展示未审核热搜、无限信息流或由模型自动发布的议题；热门顺序 MUST 来自服务端五个显式人工席位，过期空缺不得由客户端自动补位。

#### Scenario: Browse a small set of writing topics
- **WHEN** 用户从固定底部导航切换到“热门”
- **THEN** 系统默认在首个导航项按服务端席位顺序展示零到五条当前有效内容；“文章”页面不再同时堆叠这些卡片，内容区顶部不重复显示页签，用户可随时切回文章

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
- **WHEN** 议题数据库断网、不可用、超时或没有当前已排期内容
- **THEN** 系统显示真实的暂不可用或暂无议题状态，已有作品和本机写作仍可进入，不用静态种子、模拟新闻或未审核内容填充

### Requirement: Traceable topic brief
每个正式议题 MUST 显示可读的事实或编辑摘要、议题更新时间以及一个或多个相关切面，并 MAY 包含零到五个可访问来源；AI 辅助生成的摘要、内部编辑判断、角度、问题和来源 MUST 在发布前经过登录编辑确认，不得冒充来源原文或用户观点。前台 MUST 不显示“为什么值得写”“可以从这里想起”“看看背景与角度”等编辑流程或任务式措辞，也不得为无来源议题伪造说明或来源占位。

#### Scenario: Inspect a topic with sources
- **WHEN** 用户打开包含正式来源的议题
- **THEN** 系统自然显示摘要、更新时间、来源标题与链接及“大家也在关心”的相关切面；命令式角度转成中性短语，内部 `whyItMatters` 不作为用户栏目展示

#### Scenario: Inspect a topic without sources
- **WHEN** 用户打开经过编辑确认但来源数组为空的议题
- **THEN** 系统显示摘要、更新时间和中性相关切面，并完全省略来源区域，不显示“编辑整理”“暂无来源”或虚构链接

#### Scenario: Correct a published topic
- **WHEN** 已发布内容出现重要更正或新增事实
- **THEN** 系统发布带新修订和更新时间的议题，已基于旧版开始的作品保留原快照并获得可见更新提示，不被静默替换

### Requirement: Editorial publication boundary
议题系统 SHALL 将编辑引子、AI 加工候选、人工修改和正式发布记录分开保存；只有登录编辑明确确认并排期的修订才能进入用户端。来源不再依赖域名白名单，编辑 MUST 对最终保留的链接、元数据与事实表达承担确认责任，系统 MUST 限制链接为安全的 HTTP(S) 形状且不得复制第三方全文到用户端。

#### Scenario: AI produces a candidate brief
- **WHEN** 编辑让 AI 根据文字、链接和可选联网搜索生成摘要、角度、问题或来源
- **THEN** 结果只进入待审核状态，不直接出现在用户首页；编辑可修改、清空来源、拒绝或确认排期

#### Scenario: Editor confirms or removes a source
- **WHEN** 候选包含编辑提供或 AI 搜索得到的链接
- **THEN** 编辑可核对并修改标题、机构、日期和 URL，或删除来源；系统不要求审批整个域名，但未确认候选不得发布

#### Scenario: Source is unsafe or content rights are unclear
- **WHEN** 链接不是允许形状，或编辑无法确认真实性、发布时间、访问许可或内容权利
- **THEN** 系统拒绝不安全链接；编辑删除存疑来源或拒绝候选，不在用户端复制全文或用 AI 改写掩盖问题
