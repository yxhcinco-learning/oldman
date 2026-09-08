## Purpose

定义好友分享带来的未登录读者如何在作者同意的公开范围内阅读文章、查看评论和作者资料，并在主动互动时登录及续接原目标，同时保护历史发表受众、私有写作内容和账号归属。

## ADDED Requirements

### Requirement: Author consent controls guest reading
系统 SHALL 仅向游客提供当前已审核且作者明确同意游客公开的文章、处理后的公开封面和已通过评论。新投稿 MUST 展示并记录游客公开的明确选择；历史文章 MUST 默认保持原有登录阅读范围，仅在作者主动开放后允许游客读取。作者未作选择、客户端缺少该字段或迁移旧记录均不得自动扩大受众。

#### Scenario: Open an eligible shared article
- **WHEN** 未登录用户打开作者已同意游客公开且仍有效的好友文章
- **THEN** 无需登录即可读取当前已审核全文、阅读封面、公开署名和已通过评论，不提前创建账号或申请资料权限

#### Scenario: Preserve the audience of an existing article
- **WHEN** 迁移已有发表记录，或未登录用户打开作者尚未主动开放的历史文章
- **THEN** 文章保持登录阅读范围，游客不能获得正文、封面或评论内容；页面提供登录入口，作者可在发表管理中主动开放并看到受众将扩大的说明

#### Scenario: Revoke guest access
- **WHEN** 作者关闭游客公开，或文章被撤回、下架、删除
- **THEN** 后续游客正文、封面和评论读取立即按当前权限拒绝，客户端清理已加载的失效阅读状态；不承诺回收微信已缓存的好友卡片

### Requirement: Public projections preserve private boundaries
系统 MUST 以明确字段白名单提供公开文章、作者和评论，不公开工作稿、私有作品标识、账号内部标识、OpenID、自选头像、未通过评论、小文会话或未审核修改。作者身份 SHALL 使用稳定公开作者标识和默认头像；匿名读取 MUST 有分页、响应大小和频率边界，不能获得个人收藏、关系明细、库存或待审内容。

#### Scenario: Read a public author and their work
- **WHEN** 游客从文章署名打开作者公开主页
- **THEN** 仅看到公开作者标识、用户名、默认头像、公开统计和允许游客阅读的已发表文章，不得到该作者其他作品的内容或受限列表条目

#### Scenario: Request a private or pending resource
- **WHEN** 游客替换文章、投稿、图片或用户标识以请求非公开数据
- **THEN** 服务端拒绝访问且不返回私有字段、未审核快照或可绕过权限的图片地址

### Requirement: Explicit interaction resumes after sign in
系统 SHALL 在游客明确点击点赞、收藏、关注、评论或送花时解释登录用途，并允许取消后继续原文章阅读。登录成功 MUST 返回经校验的同一文章或作者；点赞、收藏和关注可续接一次原先明确的目标状态，评论 MUST 回到保留草稿的编辑状态并再次点击发布，送花 MUST 回到礼物面板再次确认，不因登录自动扣花。受保护页面与写入始终要求有效账号。

#### Scenario: Resume one selected reaction
- **WHEN** 游客点击点赞、收藏或关注并主动登录成功，且目标仍可用
- **THEN** 返回原目标并仅执行一次对应设置状态的操作，显示服务端确认结果，不同时追加其他互动或跳转作者编辑页

#### Scenario: Resume a comment or gift
- **WHEN** 游客从评论或送花入口完成登录
- **THEN** 返回原文章的评论草稿或礼物选择面板，评论内容尚未发布、花朵尚未扣除，用户可修改、确认或取消

#### Scenario: Cancel or fail login
- **WHEN** 用户取消登录，或换码失败后返回文章
- **THEN** 不产生互动、不创建虚假账号，原有效公开阅读仍可用，本次内存评论草稿保持；错误可重试且不循环弹出登录

#### Scenario: Target or account changes while signing in
- **WHEN** 登录期间目标已失效，用户离开原页面，或已有账号的操作在换账号后才返回
- **THEN** 不继续旧动作、不强制迟到导航、不把旧账号草稿或互动态带入新账号；目标失效时提供可返回的说明，不显示旧正文或成功状态

### Requirement: Shared entry measures only supported conversion events
系统 SHALL 区分分享入口阅读、登录意图、登录成功、互动提交成功和后续再次访问，以最小事件数据观察闭环。事件 MUST 不含评论正文、私有文章、微信身份、token、联系人或持久设备指纹；分享菜单打开或回调不得计为真实好友送达，未确认服务端成功不得计为互动成功。

#### Scenario: Inspect the sharing funnel
- **WHEN** 运营查看阅读到互动的汇总
- **THEN** 展示各事件各自的真实口径，不把登录取消、失败、分享菜单点击或网络重试重复计算为已送达或已转化

#### Scenario: Event recording fails
- **WHEN** 最小事件记录不可用或被限流
- **THEN** 不阻塞阅读、登录或已授权互动，不补记包含用户内容的诊断数据
