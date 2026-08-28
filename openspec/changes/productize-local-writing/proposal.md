## Why

已验收的 Demo 仍以运行时内存和模拟识别工作，不能可靠保存用户内容。本次将其变为可本地验收的真实写作工程，并建立 AI 主导开发的规范与质量门禁。

## What Changes

- 冻结已验收设计基线，建立 Git、OpenSpec、开发文档、CI 和回归测试。
- 拆分业务、存储、录音与演示模块；清理模拟键盘和无用源码。
- **BREAKING** 真实作品列表不再预填示例；保存改为 IndexedDB 自动保存、恢复和备份。
- 接入本地腾讯云实时语音网关，支持取消、失败和最终结果收尾。
- 保留全部 AI 演示，但只在副本中修改，退出不影响真实作品。
- 不改变整体视觉风格，不接真实生成式 AI，不上线、不做账号或云端作品。
- 按用户追加要求将正式工程平铺迁到 oldman 根目录，移除本地 Sites 发布接入与专用依赖；保留 Vinext、现有 UI 和腾讯云语音，不操作远端站点。
- 统一项目文档、规范、测试描述与归档文件名的正式版称谓，历史设计基线以固定提交定位，不改动真实协议或 Git 历史。

## Capabilities

### New Capabilities
- `project-foundation`: 规范、可回退基线、清理、开发检查和用户指定 Public 仓库交付。
- `local-writing`: 真实编辑、自动保存、恢复、回收站与版本化备份。
- `speech-input`: 本地网关、真实采音、转写状态机和异常保护。
- `isolated-ai-demo`: 保留聊天及优化模拟，与真实作品严格隔离。

### Modified Capabilities
无现有 OpenSpec 能力需要修改。

## Impact

涉及正式工程的页面、样式、模型、测试和开发脚本；新增 IndexedDB 和 Node/Fastify 网关依赖。腾讯云凭据仅由环境变量提供；真实联调、GitHub 权限和真机验收独立记录。工程位于 D:/vibe_code/oldman，使用 yxhcinco-learning/oldman 仓库；原型源码和多余备份不保留。移除本地 Sites/Worker 发布配置和依赖，已有线上站点不修改。
