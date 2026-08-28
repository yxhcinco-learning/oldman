## ADDED Requirements

### Requirement: Hold to transcribe
真实语音 SHALL 在约 180ms 长按、取得同意和权限后开始，显示真实音量和转写；松开结束采音，等待最终结果后进入可修改的待确认状态。

#### Scenario: Short press or delayed permission
- **WHEN** 短按或在授权弹窗期间已松手
- **THEN** 不启动后台录音，之后授权成功也必须关闭音轨

#### Scenario: Partial and final results
- **WHEN** 上游对同一句多次修订并发来最终结果
- **THEN** 文本更新而非重复追加，已完成的其他句子保留

### Requirement: Safe recording termination
语音 SHALL 处理取消、后台、断网、无声音和最长 5 分钟结束；迟到消息不影响新会话，所有结束路径释放音轨。

#### Scenario: Interrupted recording
- **WHEN** 网络中断或切后台
- **THEN** 停止录音并保留已有转写供用户处理，不假装成功

#### Scenario: Cancelled session receives late result
- **WHEN** 取消后的会话再次返回文本
- **THEN** 结果被忽略，原待确认内容不变

### Requirement: Local credential protected gateway
网关 SHALL 只监听本机、校验 Origin、限制连接数与时长及字节数，密钥和签名不得发送给浏览器；真实入口没有凭据不得使用 mock。

#### Scenario: Unconfigured or untrusted request
- **WHEN** 无有效配置或请求来源不可信
- **THEN** 明确拒绝且不建立腾讯云连接

#### Scenario: Same-origin development proxy
- **WHEN** 页面通过 localhost:3001/api/speech 建立 WebSocket
- **THEN** 本地转发必须完整传递准备、音频、实时文本和结束消息，保留 Origin 校验，不被开发工具的其他升级监听器截断

### Requirement: Explicit local credential reuse
网关 SHALL 支持显式选择项目环境变量或 Windows User 中既有腾讯云凭据；只在服务端启动时读取选定来源，不混用两组密钥，不把凭据写入项目、前端、日志或状态响应。未选中 Windows 来源时不得读取用户环境中的共享凭据。

#### Scenario: Reuse an existing Windows API identity
- **WHEN** 本地显式设置 ASR_CREDENTIAL_SOURCE=windows-user 并提供有效数字 AppID
- **THEN** 网关启动时重新读取 Windows User 的 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY，无需重新创建密钥或重启整个桌面应用

#### Scenario: Missing or invalid selected source
- **WHEN** 选定来源不可用、密钥不完整、AppID 无效或 Windows 读取失败
- **THEN** 网关报告未配置并给出不含秘密的错误，不回退到其他身份或 mock

### Requirement: Bounded explicit live verification
联调工具 SHALL 默认只检查本地状态；只有显式提供测试音频且本地允许标记开启时才连接真实 ASR，单次限制 30 秒并按实时速率发送。不记录转写正文、原音或签名，不把网关配置成功等同于真实识别通过。

#### Scenario: Small cost-assessed live verification
- **WHEN** 简单估算费用、次数与总时长后，真实联调必要且低成本、规模可控
- **THEN** 可按需通过独立显式入口进行少量非敏感测试，无需逐次确认；限制次数、时长及重试，不自动充值、购买资源包或修改计费设置

#### Scenario: Batch or uncertain-cost verification
- **WHEN** 计划大批量自动化测试、压测、长时间循环，或调用费用较高、难以估算
- **THEN** 在真实调用前确认预算和上限，不进行无上限调用或重试；常规回归与 CI 使用 mock，CI 不配置付费服务凭据

#### Scenario: Persist verified local startup settings
- **WHEN** 真实 ASR 联调成功
- **THEN** 在 Git 忽略的 .env.local 保存 AppID、凭据来源和启动配置，既有密钥仍从本机读取；长期密钥无需 STS Token
