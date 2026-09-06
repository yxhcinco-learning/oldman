> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

# topic-guided-writing Specification

## Purpose
TBD - created by archiving change add-topic-guided-writing. Update Purpose after archive.
## Requirements
### Requirement: Two reversible paths from a topic
用户从议题开始写作时 SHALL 可以选择直接进入正常写作，或进入由小文逐问引导的采访模式；两条路径 MUST 关联同一篇作品和同一个议题背景，并允许随时切换而不丢失正文或素材。

#### Scenario: Start with normal writing
- **WHEN** 用户在话题详情选择“直接写”
- **THEN** 系统创建或打开关联作品并显示正常编辑器，议题作为可收起背景存在，不自动打开采访、不生成提纲或正文

#### Scenario: Start with guided interview
- **WHEN** 用户在话题详情选择“接受小文采访”
- **THEN** 系统进入同一作品的小文聊天式采访，先用简短静态文案说明小文身份和一次一问的方式，再请用户简单介绍自己；打开本身不调用 AI，正文保持不变

#### Scenario: Continue as one conversation
- **WHEN** 用户通过文字或语音回答当前问题并点击“发送”
- **THEN** 回答先保存为采访素材并显示为用户消息，小文随后只提出一个有承接的下一问；消息历史独立滚动、输入区固定可达，界面不要求用户再点击“保存回答”或“继续问我”

#### Scenario: Switch paths without losing work
- **WHEN** 用户在采访、正常写作或稍后恢复之间切换
- **THEN** 当前正文、议题快照、采访素材和会话状态分别保留，切换本身不调用成文、不应用候选也不清空内容

#### Scenario: Leave an untouched first interview
- **WHEN** 用户首次进入采访后没有发送回答、没有未发送文字、没有会话结果且没有进行中的请求，随后关闭小文
- **THEN** 系统回到“热门”列表并清除本次临时空稿，不进入文章页、不生成“未命名作品”

#### Scenario: Leave after contributing or while processing
- **WHEN** 用户已有采访回答、未发送文字、会话结果或进行中的请求，随后关闭小文
- **THEN** 系统进入同篇文章，保留全部内容；请求进行中时编辑器显示清楚的加载状态，请求不因关闭面板而取消

### Requirement: Event as optional writing background
正常写作模式 SHALL 将所选事件呈现为可查看、可收起且不占据作者正文的背景材料；用户 MUST 能核对来源、更新时间和中性相关切面，也 MUST 能完全不采用这些内容自行写作。

#### Scenario: Refer to event while writing
- **WHEN** 用户在正常编辑器打开事件背景
- **THEN** 系统显示已保存的议题摘要、来源、更新时间和角度，关闭背景后正文、光标和输入模式保持

#### Scenario: Ignore suggested angles
- **WHEN** 用户不选择任何推荐角度并直接输入自己的观点或结构
- **THEN** 系统按普通正文保存，不强制补全角度、不自动引用背景，也不把未采用建议计入文章

### Requirement: Separate background, material and article
系统 MUST 分别表达议题事实、用户观点、采访回答、AI 整理候选和已确认正文；任何背景或素材不得因打开议题、完成一次回答、退出采访或切换模式而自动进入正文。

#### Scenario: Answer an interview question
- **WHEN** 用户通过文字或语音回答小文问题
- **THEN** 回答保存为可查看的用户采访素材并出现在聊天消息流中，小文可基于它提出下一问，但正文不自动变化；关闭小文即暂停，重开后继续，不另设“先暂停 / 回到文章”按钮

#### Scenario: Request an article from gathered material
- **WHEN** 用户明确选择把采访素材整理成文章
- **THEN** 系统显示参与成文的背景和用户素材，生成独立候选并要求全文预览与确认；用户取消或放弃时正文保持原样

#### Scenario: Encounter failure while switching or composing
- **WHEN** 保存素材、读取背景或生成候选失败
- **THEN** 系统保留已经输入的正文和可恢复素材，显示真实错误及重试或导出补救，不用空内容覆盖或声称成文成功
