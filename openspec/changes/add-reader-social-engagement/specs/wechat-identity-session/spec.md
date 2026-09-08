## MODIFIED Requirements

### Requirement: Silent minimal WeChat identity
旧版未启用账号的客户端 SHALL 保留以下最小身份兼容行为。第二阶段客户端 MUST 仅在用户点击微信登录后建立账号会话，不自动换码；未登录可查看开屏、登录、隐私说明，以及作者明确同意游客公开的已审核文章、对应封面、已通过评论和公开作者资料。其余产品页面、私有读取及互动写入 MUST 先登录；历史文章默认保留登录阅读，不能仅因本次升级自动开放游客。以下旧客户端无感登录和本地使用规则只用于兼容，不能作为第二阶段入口绕过。

小程序 SHALL 在需要在线身份时使用 `wx.login` 取得一次性 code 并由服务端建立内部用户，不得展示注册/密码登录页，也不得主动请求手机号、微信昵称、头像或其他非必要资料；身份失败 MUST NOT 阻塞本地写作。

#### Scenario: First successful launch
- **WHEN** 用户首次打开小程序、网络可用且微信换码配置有效
- **THEN** 客户端在后台完成一次换码并取得自有业务 token，用户可直接使用产品且不会看到“注册账号”或资料授权要求

#### Scenario: Login is unavailable
- **WHEN** `wx.login`、业务后端或微信换码失败
- **THEN** 系统不创建基于假 code 的用户、不回退 mock、不循环弹窗，本地能力保持可用且在线操作提供一次明确重试

#### Scenario: Explicit account login
- **WHEN** 用户使用第二阶段客户端
- **THEN** 独立微信授权登录页仅在点击后建立账号会话并自动创建首次账号，头像昵称可选，失败保留在登录页并提供重试，不清除历史本机作品；本页取代旧版不显示登录页的限制

#### Scenario: Return after sign in
- **WHEN** 从作品登录后游客作品已认领或账号恢复
- **THEN** 按固定账号和认领后的标识重新读取原作品，保留已保存输入，不重复提交模型任务；换账号返回作品列表，不读取前一账号缓存

#### Scenario: Cloud sync fails after sign in
- **WHEN** 微信登录成功但作品同步未完成
- **THEN** 保留有效账号及本机内容，重试只执行同步，不自动再次换码；离开登录页后迟到结果不得强制导航

#### Scenario: Read a share without creating an account
- **WHEN** 未登录用户直接进入符合游客公开条件的文章或公开作者页
- **THEN** 客户端仅执行允许的公开读取，不自动调用微信换码，不创建账号，不请求手机号、头像或其他资料

#### Scenario: Sign in for an explicit social action
- **WHEN** 游客明确选择互动并主动完成微信登录
- **THEN** 返回仍有效的原公开目标并按该动作规则续接；点赞、收藏、关注至多续接一次，评论再次点击发布、送花再次确认，登录不触发录音或模型请求
