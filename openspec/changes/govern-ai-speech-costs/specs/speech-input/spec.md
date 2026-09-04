## ADDED Requirements

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

