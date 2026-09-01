## MODIFIED Requirements

### Requirement: Local credential protected gateway
网关 SHALL 只监听本机并限制连接数、时长、字节数与上游缓冲，密钥和签名不得发送给任何客户端；浏览器语音路径 MUST 校验精确允许的 Origin，小程序语音路径 MUST 校验短时单次 ticket且不得依赖或伪造浏览器 Origin。任一路径没有有效配置或信任凭证时不得连接腾讯上游或回退 mock。

#### Scenario: Unconfigured or untrusted browser request
- **WHEN** 浏览器路径无有效配置或请求 Origin 不是精确允许值
- **THEN** 网关明确拒绝且不建立腾讯云连接

#### Scenario: Invalid mini-program speech ticket
- **WHEN** 小程序语音路径的 ticket 缺失、过期、已消费或用途不匹配
- **THEN** 网关在连接腾讯上游前拒绝，不把 ticket、长期 token 或微信身份写入日志

#### Scenario: Same-origin development proxy
- **WHEN** 页面通过 localhost:3001/api/speech 建立 WebSocket
- **THEN** 本地转发必须完整传递准备、音频、实时文本和结束消息，保留 Origin 校验，不被开发工具的其他升级监听器截断

#### Scenario: Authenticated mini-program proxy
- **WHEN** 小程序以有效单次 ticket 建立专用 WSS 并等待 ready
- **THEN** 网关消费 ticket 后复用相同腾讯签名、结果累积和资源限制，客户端不接触签名 URL、AppSecret 或腾讯云凭据

## ADDED Requirements

### Requirement: Native mini-program PCM capture
小程序语音 SHALL 在用户长按、隐私同意、麦克风授权、有效 ticket 和 WSS ready 后使用全局 `RecorderManager` 采集 16 kHz、单声道、PCM 分片；客户端 MUST 以完整 PCM16 采样边界缓冲和发送任意回调大小，不得假设每帧固定长度或把压缩音频冒充现有上游协议。

#### Scenario: Start a held recording
- **WHEN** 用户按下语音按钮
- **THEN** 界面立即给出已按住反馈；持续 180 毫秒后才进入授权、ticket 与 Socket 准备流程，短于该阈值的触摸不请求权限或在线服务

#### Scenario: Start a held recording after the threshold
- **WHEN** 用户持续长按达到 180 毫秒且授权、ticket 与 Socket 均准备完成
- **THEN** 小程序启动有限时长的 PCM 录音、从本地分片计算反馈音量并向当前 WSS 发送偶数字节音频，正文在最终结果前不自动写入

#### Scenario: Release before permission or socket readiness
- **WHEN** 用户在隐私/系统授权或 WSS 准备完成前已经松手
- **THEN** 系统不得随后在后台开始录音；已创建的 recorder、ticket 和 Socket资源被取消或关闭

#### Scenario: Receive irregular frame sizes
- **WHEN** `onFrameRecorded` 返回不同长度或拆分在 PCM16 样本边界之间的数据
- **THEN** 客户端缓存不足部分，只按完整偶数字节发送并在正常停止时处理剩余完整样本，不重复、乱序或丢弃已确认分片

### Requirement: Native recorder lifecycle isolation
小程序 MUST 为每次录音建立独立会话 ID，并 SHALL 处理松开、取消、后台、系统中断、Recorder 错误、Socket 失败、无声音和最长五分钟结束；所有结束路径 MUST 注销或隔离本轮监听、停止采音并忽略迟到帧与转写。

#### Scenario: Move the mini program to background
- **WHEN** 录音期间小程序进入后台或收到系统录音中断
- **THEN** 当前录音停止，Socket 结束或取消，已有转写保留为可处理文字且界面不显示成功完成

#### Scenario: Late recorder or socket event
- **WHEN** 已取消会话的 recorder 分片或服务器转写在新会话开始后到达
- **THEN** 会话 ID 检查忽略旧事件，新会话正文、待确认内容和状态不受影响

#### Scenario: Complete normal recording
- **WHEN** 用户松开且最后分片已处理
- **THEN** 客户端停止 Recorder、发送 end、等待最终结果后进入可编辑待确认状态，并释放本轮监听和 Socket

### Requirement: Mini-program microphone privacy boundary
小程序 MUST 只在用户主动触发语音时申请微信隐私授权与 `scope.record`，并 SHALL 在首次发送音频前说明音频会经服务端发送给腾讯云识别；拒绝、撤回或系统禁用麦克风时 MUST 保留文字输入路径且不得反复弹窗。

#### Scenario: Grant microphone access
- **WHEN** 用户在知情说明后同意隐私指引和麦克风权限并继续长按
- **THEN** 系统仅为当前主动录音启动 Recorder，不保存或上传原音文件，不把授权解释为自动发送 AI 请求

#### Scenario: Deny or revoke microphone access
- **WHEN** 用户拒绝、撤回或系统设置关闭麦克风权限
- **THEN** 当前录音不开始或安全停止，系统提供一次清楚的设置说明和可见文字输入，不循环申请、不丢失正文

### Requirement: Mini-program physical-device evidence
小程序语音实现 MUST 在真实 iOS 微信与 Android 微信分别验证长按、授权拒绝/恢复、分片转写、后台中断、弱网、收尾和资源释放；开发者工具、Windows 微信、合成 PCM 与测试 transport不得代替真机结论。

#### Scenario: Only developer-tool evidence exists
- **WHEN** 自动化和开发者工具中的录音流程已经通过但任一手机平台尚无证据
- **THEN** 小程序语音任务与整个变更保持未完成，不上传正式版或把配置成功记录为真机识别通过

#### Scenario: Record bounded live evidence
- **WHEN** 用户授权进行少量真实联调且使用非敏感短语音
- **THEN** 每个平台按限定次数和时长记录结果、失败类别及近似费用，不保存原音/正文到仓库或日志、不自动重复计费调用
