## MODIFIED Requirements

### Requirement: Native mini-program PCM capture
小程序语音 SHALL 在用户长按、隐私同意和麦克风授权后立即使用全局 `RecorderManager` 采集 16 kHz、单声道、PCM 分片，同时申请有效 ticket 并建立 WSS；网络就绪 MUST NOT 成为采音前置条件，但只有 WSS ready 后才发送音频。客户端 MUST 以完整 PCM16 采样边界缓冲任意回调大小，不得把压缩音频冒充上游协议；ready 前及慢网队列 MUST 有内存上限，不能保存或上传录音文件。

#### Scenario: Start a held recording
- **WHEN** 用户按下语音按钮
- **THEN** 界面立即给出已按住反馈；持续 180 毫秒后才进入授权及录音流程，短于该阈值的触摸不请求权限或在线服务

#### Scenario: Start a held recording after the threshold
- **WHEN** 用户持续长按达到 180 毫秒且已授权，ticket 或 Socket 尚未准备完成
- **THEN** 小程序立即请求启动录音，仅在真实启动回调后提示“正在听”并显示本地音量；将初始音频暂存在内存，ready 后按顺序发送，正文不自动写入

#### Scenario: Release before permission or socket readiness
- **WHEN** 用户在隐私/系统授权或麦克风真正启动前已经松手
- **THEN** 系统取消当前会话并停止已请求的 Recorder，迟到授权或启动不得开始后台采集

#### Scenario: Release while the service is still connecting
- **WHEN** 麦克风已经开始采集且用户在 WSS ready 前松手
- **THEN** 立即停止麦克风，保留有界内存音频并提示正在识别，连接成功后先发送全部完整分片再发 end，最终文字交原输入位置，不要求重新按住

#### Scenario: Receive irregular frame sizes
- **WHEN** `onFrameRecorded` 返回不同长度或拆分在 PCM16 样本边界之间的数据
- **THEN** 客户端缓存不足部分，只按完整偶数字节发送并在正常停止时处理剩余完整样本，不重复、乱序或丢弃已确认分片

#### Scenario: Fail or cancel buffered recording
- **WHEN** 用户取消、页面隐藏、发生中断、网络失败、准备超时或缓存超过上限
- **THEN** 停止采音、关闭连接并释放缓存，取消丢弃本次转写，其他失败保留已识别文字并明确未识别部分需要重说；旧会话回调不改变新会话状态

## ADDED Requirements

### Requirement: Paced bounded realtime audio delivery
网关 SHALL 将已鉴权 ready 会话的 PCM 按不超过 1:1 实时速率有序送往腾讯 ASR，短时突发 MUST 通过有界内存队列消化；end MUST 在已接受音频排空后发送，收尾超时从上游 end 开始。取消或失败 MUST 释放队列及定时器；原连接、音频、时长与预留费用限制 MUST 保持有效，不能因缓存补发扩大允许的音频时长。

#### Scenario: Drain startup audio before ending
- **WHEN** 客户端在 ready 后补发连接期间的音频，随后发送 end
- **THEN** 上游以实时节奏收到完整有序 PCM，最后一帧之后才收到唯一 end；客户端在队列排空及识别收尾期间显示等待

#### Scenario: Enforce queue and duration limits
- **WHEN** 队列超过上限、达到允许音频时长、账号失效或用户取消
- **THEN** 上限失败明确提示，时长上限停止接受新音频并按允许范围收尾，失效和取消释放资源，不放宽预算、不自动重连
