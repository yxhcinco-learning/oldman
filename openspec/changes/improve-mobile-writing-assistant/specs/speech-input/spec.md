## ADDED Requirements

### Requirement: Server-controlled Tencent ASR engine model
实时语音网关 SHALL 仅从服务端环境选择腾讯识别模型，MUST 接受普通话基础模型 `16k_zh` 与中英大模型 `16k_zh_en`，空值 MUST 兼容回退到 `16k_zh`，其他值 MUST 在启动时被拒绝。模型选择 MUST 写入服务端签名参数，不得进入客户端控制、泄露凭据或改变现有 16kHz PCM16、同源 WebSocket、时长及连接限制。

#### Scenario: Use the bilingual model in the public runtime
- **WHEN** 受控公网网关以 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh_en` 启动并创建一段语音会话
- **THEN** 腾讯上游签名请求使用 `engine_model_type=16k_zh_en`，浏览器继续使用原同源语音入口且不接触签名 URL 或服务端凭据

#### Scenario: Preserve the compatible default
- **WHEN** 本地或旧运行环境没有设置 `TENCENT_ASR_ENGINE_MODEL_TYPE`
- **THEN** 网关继续使用 `16k_zh`，无需修改音频采集、凭据配置或客户端代码

#### Scenario: Reject an unsupported model value
- **WHEN** 服务端配置了空白以外且不在白名单中的模型标识
- **THEN** 网关启动明确失败，不连接腾讯上游、不静默回退或把任意值加入签名
