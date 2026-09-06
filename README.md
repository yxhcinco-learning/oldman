# 岁月有声

帮助有阅历的长辈把想说的话写下来。**微信小程序是唯一用户端；网页只作为运营后台。** H5 试验端已于 2026-09-06 退役并物理归档，不再开发、验收或作为云端账号/同步的另一端。

## 先读这些

- [维护范围与退役边界](docs/CLIENT-SCOPE.md)：新会话先确认什么在维护、什么已归档。
- [产品](docs/PRODUCT.md)、[设计](DESIGN-SYSTEM.md)、[架构](docs/ARCHITECTURE.md)、[开发](docs/DEVELOPMENT.md)。
- [小程序工程](apps/miniprogram/README.md)、[隐私](docs/PRIVACY.md)、[验收](docs/ACCEPTANCE.md)。
- [OpenSpec](openspec/README.md)：行为规范、活跃任务及历史适用范围。

## 活跃工程

| 目录 | 职责 |
| --- | --- |
| apps/miniprogram | 唯一用户端，原生 TypeScript / WXML / WXSS |
| app、features/topic-admin | 网页运营后台，不是 H5 用户端 |
| server | 身份、话题、AI、语音、用量保护 |
| packages/core | 小程序、后台和服务共享的领域与协议 |
| archive/h5、docs/archive/h5 | 退役源码与历史资料，不参与构建或部署 |

使用 Node 24.14.1，在仓库根目录执行 npm ci。小程序用微信开发者工具导入 apps/miniprogram；npm run dev 启动运营后台（localhost:3001/admin/topics）与网关（127.0.0.1:3002）。单独网关使用 npm run dev:server，后台使用 npm run dev:admin。

完整检查 npm run check，构建 npm run build。无需启动或修复 H5；归档测试不计入当前验收。[部署说明](docs/DEPLOYMENT.md)涉及现有服务，任何上线、停站和小程序上传仍单独确认。

当前作品仍本机保存，云端作品、账号产品与跨设备同步尚未实现；新 AppID 待提供，不迁移借用 AppID 的身份/token。保留旧 JSON v1–v5 导入副本能力，不恢复 H5 产品。
