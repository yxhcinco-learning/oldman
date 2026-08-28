# 文件清理与工程迁移

完整正式 V2 已平铺迁入 `D:\vibe_code\oldman` 根目录，不嵌套子目录、不混入 V1 文件。该目录是唯一开发入口，AGENTS、OpenSpec、Git、源码及 `.env.local` 均在根目录。标签 `demo-approved-v2` 仍指向 `28fd5e4`，不重做已验收 UI。

## 已完成的源码整理

- app/page.tsx 巨型页面拆分为写作、存储、语音、独立 AI 演示和通用组件。
- 类型、字数、拼接/拆段移到 lib/domain，真实业务不再依赖 mock。
- app/mock-data.ts 移到 features/demo；聊天、配图、优化及示例保留，不写真实列表。
- 移除桌面模拟键盘及 CSS、演示中失效的作品保存/列表状态。
- 假保存/写死时间替换为事务确认、实际时间和字数。
- 历史审视及规范归档 docs/archive，根 DESIGN-SYSTEM.md 是现行规范。
- 密钥、录音、备份、构建和工具缓存不入库。未删除用户备份或浏览器作品。
- 按用户追加要求移除 `.openai/hosting.json`、Sites/Cloudflare Vite 插件、Worker 类型及 Wrangler 直接依赖和 D1/R2 占位配置；同步 npm 锁文件，不升级其余包。保留 Vinext 本地运行与构建链路，不调用部署或远端删除。

## 原 Demo 与迁移状态（2026-08-28）

用户确认原 `oldman` 中的 V1 不保留，随后明确要求不另存退役目录或多余备份。检查结果：V1 Git 干净，HEAD 为 `01457f3`；没有 `.env`、独有本地配置或文件型用户数据。旧 Demo 为内存数据；浏览器 IndexedDB 中的正式作品不属于旧版源码，不能清理。

- 已删除旧版 `backups/oldman-original-20260827.bundle`，以及本次临时生成的 V1/V2 Git bundle，未移动任何 V1 源码到外部。删除的 bundle 不再提供恢复副本；正式 V2 的 Git 历史和标签完整保留。
- 首次目录清理被执行环境拦截，随后用户清空 V1。本轮先确认 oldman 完全为空，再将 V2 的全部 39 个顶层条目原位迁入，包含隐藏文件、依赖、Git 和本地配置，没有合并同名目录。
- 文档与发布配置调整前，88 个文件（已跟踪文件及 `.env.local`、Git config/HEAD）的 SHA256 全部匹配；分支、HEAD、全部 refs 与顶层条目清单一致。正式 Git 历史完整保留，迁移没有创建新的 Git 仓库。
- 服务从新根目录运行，仍使用 `localhost:3001`；浏览器作品库、访问地址、语音凭据和线上站点未改变。

## 残余目录清理尾项

目录删除命令仍被执行环境拦截，以下仅为空目录而非第二份工程或额外备份：旧 `D:\vibe_code\oldman-design-v2`、`D:\vibe_code\.oldman-backups\20260828-root-replacement\v1-retired` 及其空父级、当前根目录的 `backups`。Sites 配置删除后的 `.openai` 如仍存在也仅为空目录。它们不被代码引用，不入 Git；目录清理单独保持待办，不冒充已移除。

历史发布工具缓存 `.wrangler` 不再参与启动或构建，继续被 Git/Lint 忽略；不将缓存当作仍有效的发布接入。源码和锁文件已经解除对应依赖。

## 回退原则

代码用标签/提交回退，作品用 JSON 恢复副本，两者不是同一种备份。退回无持久化 Demo 不清空 IndexedDB，也不能用它验收真实产品。恢复数据禁止删库重建或覆盖旧作品。
