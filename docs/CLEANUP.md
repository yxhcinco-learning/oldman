# 文件清理与回退

正式工程 `oldman-design-v2`，不重做已验收 UI。标签 `demo-approved-v2` 指向 `28fd5e4`。

## 已完成的源码整理

- app/page.tsx 巨型页面拆分为写作、存储、语音、独立 AI 演示和通用组件。
- 类型、字数、拼接/拆段移到 lib/domain，真实业务不再依赖 mock。
- app/mock-data.ts 移到 features/demo；聊天、配图、优化及示例保留，不写真实列表。
- 移除桌面模拟键盘及 CSS、演示中失效的作品保存/列表状态。
- 假保存/写死时间替换为事务确认、实际时间和字数。
- 历史审视及规范归档 docs/archive，根 DESIGN-SYSTEM.md 是现行规范。
- 密钥、录音、备份、构建和工具缓存不入库。未删除用户备份或浏览器作品。
- 保留 `.openai/hosting.json` 及构建链路，未调用部署。

## 原 Demo

原 `oldman` 不是继续开发入口。清理前确认原 Git 无未提交内容，保存完整 Git bundle 并 `git bundle verify`；不要把原线上配置恢复到 V2。

当前任务绑定原目录，不能直接递归删除活动工作区根目录。原目录最终移除留在切换任务工作区到 V2 后执行；bundle 实际路径/验证记在 ACCEPTANCE.md。线上站点保持原状。

## 回退原则

代码用标签/提交回退，作品用 JSON 恢复副本，两者不是同一种备份。退回无持久化 Demo 不清空 IndexedDB，也不能用它验收真实产品。恢复数据禁止删库重建或覆盖旧作品。
