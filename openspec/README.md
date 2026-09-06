# 规范入口与适用范围

先读[当前状态](../docs/STATUS.md)与[产品边界](../docs/PRODUCT.md)，用 `npx openspec list` 查询活跃任务。specs 是现行行为要求，changes 是实施变更，changes/archive 是历史证据，不从旧任务或“双端”模板恢复已退役需求。

## 职责划分

| 规范 | 负责内容 |
| --- | --- |
| [active-client-scope](specs/active-client-scope/spec.md) | 唯一用户端、归档边界与文档职责 |
| [account-cloud-work-sync](specs/account-cloud-work-sync/spec.md) | 微信账号、私有作品、单设备续写、恢复与备份 |
| [wechat-identity-session](specs/wechat-identity-session/spec.md) | 主动登录、会话安全及历史最小身份接口的兼容边界 |
| [article-ai-session](specs/article-ai-session/spec.md) | 文章候选、采用/恢复、兼容 action、安全与用量 |
| [xiaowen-conversation-modes](specs/xiaowen-conversation-modes/spec.md) | 连续会话、访谈切换、语义承接、整理与失败恢复 |
| [product-design-system](specs/product-design-system/spec.md)、[设计规范](../DESIGN-SYSTEM.md) | 视觉、交互与组件表现，不另建一套访谈业务状态机 |
| 其余 specs | 各自命名的写作、备份、语音、运营、安全与服务能力 |

共享语义与运营后台要求继续有效；H5 专属 IndexedDB、DOM、浏览器输入和 UI 场景仅为退役实现历史，不是小程序验收门槛。运营后台仍须浏览器回归，不得误当 H5 取消。退役专属规格在[历史规格归档](../docs/archive/h5/specs/README.md)。
