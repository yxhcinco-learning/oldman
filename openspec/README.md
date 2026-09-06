# 规范入口与适用范围

先读 [维护范围](../docs/CLIENT-SCOPE.md)。唯一用户端为小程序，网页为运营后台；不能因历史规格仍描述浏览器而恢复双端要求。

- active-client-scope 定义当前客户端与归档边界。
- specs 中写作、备份、AI、语音的共享语义继续有效；IndexedDB、DOM、H5 UI 和浏览器输入专属场景仅是退役实现历史，不是小程序验收门槛。
- 运营后台、后端鉴权、用量及部署保护继续有效。管理台仍需浏览器回归，不得误当 H5 取消。
- unify-xiaowen-conversation-modes 与 add-wechat-miniprogram-client 保持活跃，按修订 tasks 处理剩余小程序/共享/服务任务。
- changes/archive 为历史证据；不得复制旧“双端”模板创建新需求。

云端作品、账号和跨设备同步尚未实施，后续仅面向小程序另立变更。用 npx openspec list 查询当前任务。
