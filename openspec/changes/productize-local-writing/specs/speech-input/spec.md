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
