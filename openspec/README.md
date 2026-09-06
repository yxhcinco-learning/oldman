# 规范入口与适用范围

先读 [当前状态](../docs/STATUS.md)与[维护范围](../docs/CLIENT-SCOPE.md)。唯一用户端为小程序，网页为运营后台；不能因历史规格仍描述浏览器而恢复双端要求。

- active-client-scope 定义当前客户端与归档边界。
- specs 中写作、备份、AI、语音的共享语义继续有效；IndexedDB、DOM、H5 UI 和浏览器输入专属场景仅是退役实现历史，不是小程序验收门槛。
- 运营后台、后端鉴权、用量及部署保护继续有效。管理台仍需浏览器回归，不得误当 H5 取消。
- unify-xiaowen-conversation-modes 与 add-wechat-miniprogram-client 已于 2026-09-06 完成约定技术验收并归档，证据由当前状态入口链接；平台材料与 iOS 未验证状态独立保留，不重新挂起旧任务。
- isolated-ai-demo 与 isolated-design-preview 为退役 H5 专属规格，已移至[历史规格](../docs/archive/h5/specs/README.md)，不再列入活跃 specs。
- changes/archive 为历史证据；不得复制旧“双端”模板创建新需求。

云端作品、账号和跨设备同步尚未实施，后续仅面向小程序另立变更。用 npx openspec list 查询当前任务。
