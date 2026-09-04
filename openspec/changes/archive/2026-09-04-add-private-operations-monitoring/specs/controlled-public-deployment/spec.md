## ADDED Requirements

### Requirement: Bounded first-party event ingress
部署代理 SHALL 只通过现有网关暴露精确的第一方 H5 事件路径，保持站点级临时 Basic Auth 边界、应用专用按 IP 限流并关闭 access log，所有未列出 API 继续拒绝。应用 SHALL 另外强制精确 Origin、JSON、body、schema 和全局频率限制，且不在监控数据中保留 IP 地址。

#### Scenario: Send a controlled H5 event
- **WHEN** 已通过体验访问认证的 H5 页面向精确运营事件路径提交有效白名单事件
- **THEN** Nginx 只在专用限流下转发到回环网关，应用接受事件但不转发到第三方收集器

#### Scenario: Probe an unlisted or abusive route
- **WHEN** 客户端使用其他 operations 路径、缺少 H5 访问边界、突发请求或提供无效 Origin/body
- **THEN** Nginx 或网关在聚合前返回 401、403、404、413、415 或 429，且不扩大其他公开 API 边界
