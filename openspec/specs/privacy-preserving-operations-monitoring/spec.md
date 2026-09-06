> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/PRODUCT.md 与 active-client-scope 规范。

# privacy-preserving-operations-monitoring Specification

## Purpose
定义隐私最小化的运行聚合、受保护的运营监控及日志边界；旧 H5 匿名事件仅为仍保留的线上兼容协议，不是小程序新增上报要求。
## Requirements
### Requirement: Coarse anonymous product events
H5 SHALL 只上报白名单事件 `app.opened`、`topic.opened`、`writing.started.blank`、`writing.started.topic`、`writing.started.interview`、`backup.exported` 和 `backup.imported`；每个请求 MUST 只包含事件名，并且 MUST NOT 包含用户或设备标识、作品/话题标识、内容、搜索词、URL、客户端时间或任意元数据。

#### Scenario: Report a permitted event
- **WHEN** 白名单内的产品动作发生且同源网关可用
- **THEN** 客户端发送一个有界 JSON 事件，服务端在不设置分析标识和不保留原始事件记录的情况下计数

#### Scenario: Reject identifying or free-form data
- **WHEN** 事件请求包含未知名称、额外属性、自由文本、无效 Origin、非 JSON Content-Type，或超过频率/body 上限
- **THEN** 网关在聚合前拒绝，并且只记录固定操作名、状态、耗时和错误类别

#### Scenario: Continue offline-first work
- **WHEN** 事件上报不可用、被拒绝、取消或超时
- **THEN** 客户端不重试、不持久化而直接丢弃该事件，用户动作、本地写作、备份、AI、语音和话题继续独立工作

### Requirement: Bounded in-process aggregation
网关 SHALL 仅在有界进程内存中，把既有安全操作记录和已接受匿名事件聚合为计数、状态类别、token 总量、固定延迟桶、固定错误类别和服务端时间；监控状态 MUST NOT 保留 requestId、IP 地址、请求头、原始 body 或用户级轨迹。

#### Scenario: Summarize recent operations
- **WHEN** 当前进程内发生允许的操作
- **THEN** 监控返回进程累计、最近 15/60 分钟总量，以及各动作计数、成功/错误、平均耗时、近似 P95、token 总量和最近固定错误类别

#### Scenario: Bound retention and restart
- **WHEN** 分钟桶超过 60 分钟或网关重启
- **THEN** 过期桶被清理，内存监控从空进程状态重新开始，不迁移或删除用户/话题数据库

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

### Requirement: No third-party analytics dependency
运营监控 MUST 使用现有第一方网关和部署日志，并且 MUST NOT 加载第三方分析 SDK、跟踪像素、指纹库、外部收集器或新的分析 Cookie。

#### Scenario: Build and use the product
- **WHEN** 构建和使用 H5 或后台
- **THEN** 监控不依赖新包或第三方网络目的地，文章、采访、音频和本地数据库内容全部保持在监控 payload 之外
