## MODIFIED Requirements

### Requirement: Protected operations dashboard
只有已认证的话题管理员 SHALL 读取运行监控。后台 SHALL 展示能力布尔值、进程启动/运行时间、近期总量、错误状态、token 用量和动作分布，并 SHALL 另外显示跨重启的当日文章 AI、话题 AI 与语音消费、活动预留、剩余额度、上海时区重置时间及可选费用估算；页面 MUST 区分进程指标与持久化用量，并提供手动刷新及仅在视图打开时运行的 30 秒定时刷新。

#### Scenario: Review current runtime health
- **WHEN** 管理员打开运行监控
- **THEN** 页面明确哪些指标随进程重启清零、哪些用量跨重启，并显示刷新的匿名聚合与预算状态，不暴露账号名、requestId、秘密、提示词、内容、IP、作品/话题标识或上游原始响应

#### Scenario: Review an approximate cost
- **WHEN** 运维配置了估算单价且当日产生 AI token 或语音秒数
- **THEN** 页面显示人民币估算并明确不是供应商账单；缺少单价时只显示用量和余额，不使用硬编码或过期价格猜测

#### Scenario: Reject a public monitoring read
- **WHEN** 监控 API 请求缺少有效后台会话或来自不允许的 Origin
- **THEN** 网关返回既有受控认证/来源错误且不返回进程指标、用量、阈值或估算价格

