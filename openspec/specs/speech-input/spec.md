> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

# speech-input Specification

## Purpose
定义真实语音输入的长按采集、可靠终止、同源受控网关、本机凭据复用、有限真实联调与服务端腾讯 ASR 模型选择边界。
## Requirements
### Requirement: Server-controlled Tencent ASR engine model
实时语音网关 SHALL 仅从服务端环境选择腾讯识别模型，MUST 接受普通话基础模型 `16k_zh`、中英大模型 `16k_zh_en` 与 `16k_zh_en_2.0`，空值 MUST 兼容回退到 `16k_zh`，其他值 MUST 在启动时被拒绝。模型选择 MUST 写入服务端签名参数，不得进入客户端控制、泄露凭据或改变现有 16kHz PCM16、同源 WebSocket、时长及连接限制。

#### Scenario: Explicitly select the bilingual 1.0 model
- **WHEN** 具有可用中英模型额度的网关以 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh_en` 启动并创建一段语音会话
- **THEN** 腾讯上游签名请求使用 `engine_model_type=16k_zh_en`，浏览器继续使用原同源语音入口且不接触签名 URL 或服务端凭据

#### Scenario: Preserve the compatible default
- **WHEN** 本地或旧运行环境没有设置 `TENCENT_ASR_ENGINE_MODEL_TYPE`
- **THEN** 网关继续使用 `16k_zh`，无需修改音频采集、凭据配置或客户端代码

#### Scenario: Keep the 2.0 bilingual model ready without enabling it
- **WHEN** 运维在确认可用额度后将服务端模型变量改为 `16k_zh_en_2.0` 并重启网关
- **THEN** 腾讯上游签名请求使用 `engine_model_type=16k_zh_en_2.0`；未显式选择中英模型时继续使用兼容默认的 `16k_zh`

#### Scenario: Reject an unsupported model value
- **WHEN** 服务端配置了空白以外且不在白名单中的模型标识
- **THEN** 网关启动明确失败，不连接腾讯上游、不静默回退或把任意值加入签名

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
- **THEN** 在真实调用前确认预算和上限，不进行无上限调用或重试；常规回归与 CI 不调用计费外部服务且 CI 不配置其凭据，其他业务逻辑按需使用真实实现或测试替身

#### Scenario: Persist verified local startup settings
- **WHEN** 真实 ASR 联调成功
- **THEN** 在 Git 忽略的 .env.local 保存 AppID、凭据来源和启动配置，既有密钥仍从本机读取；长期密钥无需 STS Token

### Requirement: Shared daily realtime speech budget
网页与小程序语音 SHALL 共享一份持久化腾讯实时识别每日秒数上限；网关 MUST 在签名并创建腾讯连接前原子预留会话秒数，并按实际连接时长向上取整结算，任何用户标识、音频或转写不得进入用量账本。

#### Scenario: Start within the remaining speech budget
- **WHEN** 当日仍有语音秒数且连接与身份条件有效
- **THEN** 网关授予不超过五分钟和剩余额度的会话时长，网页或小程序继续使用原语音协议，到达授予上限后安全收尾

#### Scenario: Reject speech after exhaustion
- **WHEN** 当日语音秒数已经耗尽或用量账本不可用
- **THEN** WebSocket 握手以 429 或 503 结束且不创建腾讯连接，界面提示继续使用文字输入，本地待确认文字和作品不受影响

#### Scenario: Cancel or lose a speech connection
- **WHEN** 用户取消、页面离开、网络断开或上游报错
- **THEN** 网关释放连接并以不超过预留的保守秒数结算，不重试、不保存音频或转写，也不把取消当作零成本恢复全部预留

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
小程序语音实现 MUST 在真实 Android 微信验证长按、授权拒绝/恢复、分片转写、后台中断、弱网、收尾和资源释放；开发者工具、Windows 微信、合成 PCM 与测试 transport 不得代替 Android 真机结论。iOS 设备不可用且产品负责人明确不将其设为当前门槛时，系统 MUST 把 iOS 记为未验证而不是阻塞归档或声称通过。

#### Scenario: Only developer-tool evidence exists
- **WHEN** 自动化和开发者工具中的录音流程已经通过但当前要求的 Android 真机尚无证据
- **THEN** 小程序语音任务与整个变更保持未完成，不上传正式版或把配置成功记录为真机识别通过

#### Scenario: Record bounded live evidence
- **WHEN** 用户授权进行少量真实联调且使用非敏感短语音
- **THEN** 当前纳入验收的平台按限定次数和时长记录结果、失败类别及近似费用，不保存原音/正文到仓库或日志、不自动重复计费调用；未执行的 iOS 检查明确列为未验证
