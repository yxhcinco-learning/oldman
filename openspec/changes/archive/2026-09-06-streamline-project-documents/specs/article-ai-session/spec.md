## REMOVED Requirements

### Requirement: User-invoked XiaoWen interview mode
**Reason**: 与统一会话规范重复，仅合并规范所有权，不移除访谈功能。
**Migration**: 访谈开关和单一输入由 xiaowen-conversation-modes 的 Compact interview switch、Continuous work conversation 负责；承接及未授权候选由 Semantic interview interaction 负责。

### Requirement: Explicit composition from interview material
**Reason**: 与统一会话的结束整理及持久化规则重复，不改变候选生成或采用行为。
**Migration**: 整理材料边界、不足/矛盾、取消失败归入 xiaowen-conversation-modes 的 Finish with a reviewable candidate；正文应用/恢复仍由本规范 Safe application and restoration 负责。
