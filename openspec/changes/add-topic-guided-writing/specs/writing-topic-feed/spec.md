## ADDED Requirements

### Requirement: Curated writing topic surface
系统 SHALL 为目标用户提供数量克制的当日议题、周期主题和慢议题，并 MUST 以促进写作而非延长阅读为目标；正式入口不得直接展示未审核热搜、无限信息流或由模型自动发布的议题。

#### Scenario: Browse a small set of writing topics
- **WHEN** 用户打开有可用议题的首页
- **THEN** 系统展示有限数量的“今日值得写”和周期主题，用户可查看详情或直接继续已有作品，不需要先浏览无限列表

#### Scenario: Topic service is unavailable
- **WHEN** 议题服务断网、超时或没有已审核内容
- **THEN** 系统显示真实的暂不可用或暂无议题状态，已有作品和本机写作仍可进入，不用模拟新闻或未审核内容填充

### Requirement: Traceable topic brief
每个正式议题 MUST 显示可读的事实摘要、议题更新时间、至少一个可访问来源以及一个或多个写作角度；AI 辅助生成的摘要、角度和问题 MUST 在发布前经过审核，不得冒充来源原文或用户观点。

#### Scenario: Inspect sources before writing
- **WHEN** 用户打开一个正式议题
- **THEN** 系统显示事实摘要、更新时间、来源标题与链接、可写角度和开始写作入口，来源不可用时明确标记而不伪造内容

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
