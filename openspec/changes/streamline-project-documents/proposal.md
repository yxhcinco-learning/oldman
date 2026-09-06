## Why

上一轮已同步项目事实，但维护文档仍混有 14 个归档跳转空壳、已完成阶段记录及重复的范围/流程说明。同一状态在多个入口复述，增加新会话误读与后续维护成本。

## What Changes

- 删除归档跳转空壳，历史引用直接指向原始归档；已完成阶段证据集中至既有归档目录。
- 合并维护范围至产品边界、三类小文状态至架构；阶段状态和线上版本分别由 STATUS、DEPLOYMENT 负责。
- 将 article-ai-session 中重复的访谈要求归入 xiaowen-conversation-modes，保留独有场景，明确规格职责，不改变产品行为。
- 扩展文档引用回归，检查归档 Markdown 引用但不要求历史截图或旧源码重现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `active-client-scope`: 明确维护文档单一职责及阶段证据归档规则。
- `article-ai-session`: 合并重复访谈条款到统一会话规范，保留文章候选及兼容 action 职责。
- `xiaowen-conversation-modes`: 接收访谈场景以维持原行为覆盖。

## Impact

仅文档、OpenSpec 和文档检查工具/测试。保留历史事实、H5 源码归档、有效工具及兼容接口，不改变运行逻辑、用户数据、凭据或线上部署。不启动第二阶段；检查通过后本地提交。
