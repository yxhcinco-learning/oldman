## Purpose

定义读者在已发表文章上的点赞、私有收藏、审核评论和免费小花花互动，约束登录权限、每日获取、余额扣减、重试与删除生命周期，让表达喜欢和再次阅读形成可靠且可理解的使用闭环。

## ADDED Requirements

### Requirement: Account reactions are unique and reversible
系统 SHALL 允许有效登录用户对可读且仍已发表的文章点赞、取消点赞、收藏和取消收藏；同一账号对同一稳定文章标识的每类状态 MUST 唯一且可逆。服务端 MUST 返回确认后的状态和公开点赞数，不把重复点击、响应丢失重试或旧响应视为额外点赞。收藏及收藏列表 MUST 仅本人可查。

#### Scenario: Like or collect an article
- **WHEN** 用户设置点赞或收藏状态，随后重复发送相同操作
- **THEN** 每类仅保留一份账号与文章关系，结果一致；点赞数最多改变一次，收藏出现在本人的收藏列表中

#### Scenario: Undo a reaction or lose connectivity
- **WHEN** 用户取消点赞、取消收藏，或请求因网络失败未获确认
- **THEN** 确认成功后更新实际状态；失败保留可恢复界面并允许重试，不把未确认结果长期显示为成功，也不显示负数

#### Scenario: Read another account's collections
- **WHEN** 游客或其他账号请求某人的收藏列表或单篇收藏状态
- **THEN** 拒绝返回该人的收藏信息，公共文章不提供收藏者名单或据此暴露个人阅读偏好

### Requirement: Text comments require review before publication
系统 SHALL 提供单层、纯文字、去除首尾空白后 1–300 个 Unicode 字符的评论，拒绝空白、超长、图片和楼中楼输入。用户 MUST 明确点击发布后才建立审核中评论；审核通过前仅评论本人及有权限的审核人员可见，公开评论数只计当前可见且通过的评论。审核失败 MUST 向本人提供可理解状态，不能显示为公开成功。

#### Scenario: Publish and approve a comment
- **WHEN** 登录用户提交有效评论，审核人员随后通过
- **THEN** 提交后本人看到“审核中，仅自己可见”；通过后其他有权阅读该文章的读者才看到评论及公开计数变化

#### Scenario: Reject invalid input or a failed submission
- **WHEN** 评论为空、超过 300 字、包含不支持的数据格式或发送失败
- **THEN** 不创建公开评论，不清空可编辑草稿，并提供长度或重试提示；同一次提交响应丢失后重试不会创建第二条评论

#### Scenario: Review or pagination has no content
- **WHEN** 评论尚无公开内容，只有自己的待审评论，或分页已读完
- **THEN** 分别展示真实空态、本人的审核中内容和加载终点，不用示例评论或重复记录填充列表

### Requirement: Comment removal and reports preserve review boundaries
系统 SHALL 支持评论者删除自己的评论以及登录读者举报可见评论；其他普通账号不能删除评论或读取举报明细。审核人员 MUST 通过独立管理权限审核、隐藏评论和处理举报，记录必要审计。作者管理文章的权限不得自动获得其他用户待审评论、私有资料或举报人身份。

#### Scenario: Remove one's own comment
- **WHEN** 评论者确认删除自己的待审或已公开评论
- **THEN** 评论停止展示且公开计数相应变化，旧审核操作不能重新公开它；删除失败保留真实状态并允许重试

#### Scenario: Report and moderate a comment
- **WHEN** 读者举报评论，审核人员将其隐藏
- **THEN** 举报提交可确认但不自动伪称处理完成，隐藏评论停止公开，举报内容与举报者身份不向作者或其他读者展示

### Requirement: Daily flower grants follow the server date
系统 SHALL 在账号每天首次主动登录成功或已有有效会话当天首次进入时，自动发放 3 朵免费小花花；每天以服务端 `Asia/Shanghai` 日期为准，同账号每日 MUST 最多到账一次。余额 SHALL 可累计且不设过期，获取结果、库存和当天领取状态仅本人可查；账号验证失败、游客进入或离线状态不得自行增加余额。

#### Scenario: Receive the daily flowers
- **WHEN** 有效账号当天首次进入，服务端确认该日尚未发放
- **THEN** 同一次到账增加 3 朵并显示今日已领取，日后重新进入仍保留剩余余额

#### Scenario: Repeat entry or cross midnight
- **WHEN** 用户刷新、退出再登录、并发请求、重试领取或修改客户端日期，或服务端日期已进入次日
- **THEN** 同一服务端日期不重复发放，真实进入次日才具备下一次领取资格，不依靠客户端日期或倒计时决定到账

#### Scenario: Grant response is lost
- **WHEN** 发放已提交但客户端未收到确认
- **THEN** 重试或重新读取返回同日真实到账结果，不再次增加 3 朵，不显示与服务端不符的成功库存

### Requirement: Gift confirmation transfers one flower atomically
系统 SHALL 允许登录用户在仍可读且已发表的他人文章中明确确认送出 1 朵小花花；MUST 在同一原子操作确认账号、目标、余额和重复操作，将库存扣减与礼物记录同时完成。余额不足不得扣为负数；自己不能给自己送花。送达后 SHALL 增加该文章获赠小花花数，不增加作者可赠送库存，不能购买、提现、交易或转赠余额；文章后来撤回不退还已送达花朵。

#### Scenario: Confirm or cancel a gift
- **WHEN** 用户打开面板选择小花花，随后确认或取消
- **THEN** 只有确认且服务端成功后才扣除 1 朵并显示送达；取消、关闭和登录成功本身均不扣花

#### Scenario: Concurrent gifts and an unknown result
- **WHEN** 仅剩 1 朵时发生并发赠送，或同一赠送操作响应丢失后重试
- **THEN** 并发最多成功送达 1 朵；同操作仅扣一次并返回原结果，未知结果未核实前不另起重复赠送

#### Scenario: Confirm a committed gift after article withdrawal
- **WHEN** 赠礼已提交但确认丢失，文章随后撤下，原账号重试同一操作
- **THEN** 返回原已送达回执而不再次扣花，也不返还已送花朵；文章及评论仍保持不可读，新的赠送请求被拒绝

#### Scenario: Insufficient balance or invalid recipient
- **WHEN** 余额为零、接收者是自己、文章失效或会话已失效
- **THEN** 不扣花、不增加获赠数，提示具体可恢复状态；今日已领取且库存为空时说明明日可再领取

### Requirement: Unavailable stationery stays disabled
礼物面板 SHALL 同时展示小花花、笔、墨、纸、砚。笔、墨、纸、砚 MUST 置灰并标记“暂未开放”，不能选择、获取或送出；任何客户端绕过禁用状态的请求亦 MUST 被拒绝，不扣除小花花、不调用支付或外部购买服务。

#### Scenario: Inspect unavailable gifts
- **WHEN** 用户查看礼物面板或尝试操作笔、墨、纸、砚
- **THEN** 可理解这些礼物尚未开放，界面和服务都没有可执行的获取、兑换或赠送通道

### Requirement: Article lifecycle governs all engagement visibility
互动 SHALL 绑定稳定文章标识，正常修改重审保留该篇既有关系与计数；所有新增互动与公开评论读取 MUST 重新核对当前发表状态。撤回、下架、删除后不能继续互动或从评论、收藏与赠礼记录恢复正文；收藏失效项 SHALL 可由本人移除。永久删除 MUST 清除该文章衍生评论正文，礼物账本仅保留必要的无正文记录；恢复私有作品不得自动恢复公开展示。

#### Scenario: Update the published edition
- **WHEN** 已发表文章修改后重新审核通过
- **THEN** 新公开版仍使用同一文章标识，其点赞、收藏、有效评论和获赠数不会被当作新文章复制

#### Scenario: Withdraw during an interaction
- **WHEN** 用户阅读、登录或确认互动期间文章被撤回、下架或删除
- **THEN** 尚未提交的迟到互动拒绝且不扣花，已提交互动仅允许核对原回执；客户端显示失效状态，公开内容与评论停止提供，收藏项只保留不可恢复原正文的失效占位及移除操作
