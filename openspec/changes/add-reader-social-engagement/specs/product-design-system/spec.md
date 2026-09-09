## MODIFIED Requirements

### Requirement: Preserve real product capabilities
第二阶段 SHALL 提供品牌开屏和独立微信授权登录页，首次登录自动建号；我的页按真实资料、同步状态、作品工具及退出分组，头像昵称可选。符合作者同意受众范围的公共阅读与作者资料 SHALL 提供游客只读例外，其余产品功能及互动写入 MUST 登录。云作品区分本地保存与云确认，不显示虚构账号数据。以下既有真实能力规则继续适用，其仅本机文案改为随实际保存状态显示。

视觉迁移 MUST 保留原生文字输入、真实作品时间与字数、本机保存/恢复、删除恢复和导出备份，不导入预览业务状态或示例数据，不修改语音协议。已确认的文章 AI 会话升级 MAY 事务新增存储，但 MUST 保留已有正文、草稿和旧备份导入能力。

#### Scenario: Existing and empty libraries
- **WHEN** 首次打开空库或打开已保存的作品
- **THEN** 空库不出现虚构作品，已有记录原样读取；长标题与时间在新卡片中可读

#### Scenario: Persistence fails
- **WHEN** 自动保存、恢复或管理操作失败
- **THEN** 错误持续可见，保留重试和导出入口；不假报成功、不清空内存或原存储

#### Scenario: Real personal center
- **WHEN** 用户登录或退出微信账号
- **THEN** 个人中心同步显示实际账号状态，不增加手机号或强制填写资料

#### Scenario: Launch and contextual sign in
- **WHEN** 无有效会话启动、打开产品直接路径或尝试返回产品页面
- **THEN** 符合游客公开条件的文章与作者页可直接只读，其余页面进入独立登录页；公共互动登录提供取消并返回原阅读的入口。已有有效会话跳过登录，已登录账号临时离线仍保留既有本机保存能力。作品登录成功返回原作品，公共互动返回原目标并按对应动作规则续接，不自动录音、调用模型、发布评论或扣花

#### Scenario: Quiet account layout
- **WHEN** 查看正常个人中心或写作页面
- **THEN** 不常驻同步/上传/云端保存状态或重连按钮、重复云保存说明和“去我的登录”提示；头像昵称、作品、回收站、备份及退出触控可达且不被导航遮挡

#### Scenario: Empty draft and normal saving
- **WHEN** 打开空白新稿或本机保存后等待同步
- **THEN** 编辑/会话、作品卡和正常个人中心不显示同步或上传标签；自动保存继续后台执行。保存详情仅在主动打开备份与恢复后查看，云确认必须对应当前内容；仅失败或暂停时提供必要操作

#### Scenario: Actionable failure messages
- **WHEN** 本机保存、云同步、资料或备份操作失败
- **THEN** 以简短中文说明原因并提供适用操作，不暴露文件路径、原始异常或协议校验详情；同源错误不重复占据页面，本机失败仍提供“重试保存 / 导出当前内容”，不伪报内容已保存

#### Scenario: Article loading fails
- **WHEN** 编辑页无法读取指定作品或展示已加载作品
- **THEN** 保留可用内容并暂停编辑，提供执行原作品读取的“重新打开”；有当前草稿可导出，无草稿可返回文章列表。不把读取失败当保存失败，不凭本机缺失断言已删除或属于其他账号

## ADDED Requirements

### Requirement: Readable article engagement and contextual sign in
公共阅读 SHALL 保持封面、标题、署名、正文和来源说明的清楚层级，作者区域提供关注状态，互动区域提供有文字名称的点赞、收藏、评论和送礼入口，分享仍可达。游客登录提示 MUST 对应当前意图，并提供继续阅读的取消操作；计数和状态不能只靠颜色或图标传达。

#### Scenario: Read and react on a compact phone
- **WHEN** 用户在 360×640、390×844 或 430×932 阅读长文章并操作互动
- **THEN** 正文和评论可完整滚动，固定操作区及安全区不遮挡末尾内容；主要操作至少 56px，非键盘控件目标至少 48px，无横向溢出，选中状态有文字或可访问名称

#### Scenario: Open a login prompt for a selected action
- **WHEN** 游客点击点赞、收藏、评论、送花或关注
- **THEN** 提示说明当前动作的登录用途，微信登录与“继续阅读”均清楚可达，取消不改变原文位置和未提交草稿

### Requirement: Gift and comment panels have complete states
礼物与评论 SHALL 使用适应窗口、系统键盘及底部安全区的面板，页头、确认和关闭均可达，内容独立滚动。礼物面板 MUST 展示真实库存、今日领取状态、单次送 1 朵及笔墨纸砚的禁用说明；评论 MUST 明确区分编辑草稿、发送中、审核中、已公开、未通过和失败。

#### Scenario: Open the gift panel with no flowers
- **WHEN** 用户余额为零且今日已领取
- **THEN** 送花确认不可执行，面板说明明日可再领取；笔墨纸砚始终置灰且标记“暂未开放”，不会用可点击亮色样式暗示可获取

#### Scenario: Enter a long comment with the keyboard open
- **WHEN** 用户在短屏输入评论并打开系统键盘
- **THEN** 字数、输入框、发布与关闭仍可触达，评论区可滚动；关闭保留本次草稿，不自动发布，失败持续可见并可重试

### Requirement: Public author and private engagement pages preserve hierarchy
公开作者主页 SHALL 以公开资料、关系操作和可读文章为主，个人中心 SHALL 以原有创作摘要为基础增加收藏、花朵和关系入口。关注、已关注与互相关注 MUST 使用明确文字；公开页不显示他人私有收藏或关系列表，空态、加载失败和文章失效须区分。

#### Scenario: Compare public and personal pages
- **WHEN** 用户切换他人作者主页、自己的关系列表和个人中心
- **THEN** 他人页面显示默认头像和可读公开内容，本人列表展示自己的关系，个人中心原有资料编辑与文章入口保持清楚可达

#### Scenario: Preserve established writing entries in the personal center
- **WHEN** 在个人中心加入收藏、花朵与关系入口
- **THEN** “最近在写”保持原稿分组右日期、整张续写卡、字数与圆箭头；“我的文章”保持右侧“全部 N 篇”入口和浅色缩进容器内的最多两条摘要，不用口号或单独“继续写”按钮替代原有入口

### Requirement: Secondary actions stay attached to their targets
作者主页关注操作 MUST 位于头像、名字的身份区域右侧，不能脱离作者资料独占下方空行。收藏列表 SHALL 把取消收藏收在每条文章右下角的已收藏图标热区，与作者及日期同一行，失效项仍可移除；点击该操作不得同时打开文章。公开评论 SHALL 默认用“更多”图标展开二级操作再举报，不常驻“举报”文字；必要操作具有清楚的可访问名称及至少 48px 热区。

#### Scenario: Follow an author and manage a saved article
- **WHEN** 在不同手机宽度查看作者主页和收藏列表
- **THEN** 关注按钮与当前作者身份对齐且长名字不挤压按钮；取消收藏贴近对应文章，操作只移除该篇，返回及其他文章状态保持

#### Scenario: Report from a comment menu
- **WHEN** 用户打开评论“更多”，选择举报，随后取消或提交
- **THEN** 举报在二级界面可达，操作始终对应该条评论；返回恢复原留言上下文，不意外删除评论、发布草稿或跳转文章

### Requirement: New engagement pages avoid redundant introductory copy
正常作者、收藏、关系、花朵及评论页面 SHALL 直接展示资料、列表或当前操作，不常驻“留给下次慢慢读”“仅自己可见”等通用开场说明及重复口号。MUST 保留解释实际状态、权限或操作后果所需的信息，包括待审评论仅自己可见、空态/失败重试、领取规则、余额不足与礼物禁用；移除提示不改变原有私有数据边界。

#### Scenario: Read a normal list or an actionable state
- **WHEN** 查看正常收藏/关系/评论列表或遇到审核中、空列表、失败与礼物用尽
- **THEN** 正常内容前无冗余介绍，异常和待审仍显示帮助用户继续操作的明确状态；隐私范围继续由实际权限保证

### Requirement: H5 review remains an isolated prototype
本轮 H5 SHALL 明确标注“设计演示”，账号、花朵、评论审核、分享及网络状态 MUST 仅在原型内模拟；不得调用真实微信登录、公开接口、支付、管理员审核或消息发送。原型证据 SHALL 仅用于页面与交互评审，不能替代小程序实现、后端联调或真机验收。

#### Scenario: Review the prototype before implementation
- **WHEN** 用户在 H5 完成模拟登录、评论、送花、关注或分享
- **THEN** 可检查完整交互和失败状态，但真实账号、文章、余额、关系、消息和数据库均未改变；实施须等待用户确认本次规划与设计
