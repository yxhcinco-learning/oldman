# 开发与验收

## 开工顺序

先读 AGENTS.md、[维护范围](CLIENT-SCOPE.md)、产品和本次 OpenSpec。小程序是唯一用户端；网页目录只服务运营后台。历史 H5 资料在[归档](archive/h5/README.md)，不可作为新需求、依赖或验收门槛。

日常在当前仓库 main 工作，不另建副本或擅自操作分支。每个通过检查的小阶段仅提交本任务文件，不自动推送、部署或上传。OpenSpec CLI 使用锁定版本：npx openspec list，按实际变更 ID 读取 proposal/specs/design/tasks，完成且证据齐全后 npx openspec archive <change-id> --yes，同步后再次验证。

## 命令与端口

使用 .nvmrc 的 Node 24.14.1，在仓库根目录 npm ci。导入 apps/miniprogram 到微信开发者工具；正式 AppID 待提供，私有配置与秘密不进 Git。

| 命令 | 当前职责 |
| --- | --- |
| npm run dev | 运营后台 3001 + 服务网关 3002 |
| npm run dev:admin | 独立运营后台，访问 http://localhost:3001/admin/topics |
| npm run dev:server | 独立网关，微信/AI/语音/话题/运营 API |
| npm run check | 类型、Lint、活跃测试、严格 OpenSpec、敏感与依赖边界 |
| npm run build | 共享核心、运营后台、小程序；不发布 |
| npm run build:admin | 运营后台构建，不包含退役 H5 |
| npm run test:server-admin | 后端、共享契约与运营 UI 测试 |

保留 npm run test:speech:live、test:topic-ai:live 和 scripts/dialogue-live-check.ts 的独立显式联调，不在普通回归自动调用。付费规模及权限按 AGENTS；无权限、凭据或真机证据不宣称通过。管理后台密码只用 npm run admin:hash-password 的交互输入生成散列。

## 验证分级

纯文档：差异、链接、内容及相关 OpenSpec。代码：npm run check；运行、打包或阶段交付再执行 npm run build。小程序 UI 补开发者工具和对应真机，运营 UI 补浏览器回归；不再要求 H5 四尺寸或双端功能对齐。归档 H5 测试不计当前通过数量，核心/网关测试不能随 H5 一起丢弃。

新架构必须通过退役依赖边界：活跃源码不能引用 archive/h5、旧 lib、H5 features 或预览。归档不参与 TypeScript、Lint、测试发现或发布输入；现有 CI 仍执行完整 check/build 与依赖审计。

## 数据与配置

小程序仍本地优先：文件聚合、恢复、revision、回收站及 JSON v5，旧 v1–v4 备份可导入副本。操作系统中断可能丢失未提交输入，不承诺零丢失。服务器三库不是作品云备份，不将用户 JSON、正文或音频放入 Git。

服务配置仍在忽略的 .env.local；服务器秘密位于 /etc/suiyue-yousheng/runtime.env。正文/语音/身份失败均不回退假数据。[语音配置](SPEECH-SETUP.md)、[部署](DEPLOYMENT.md)、[隐私](PRIVACY.md)保留有效服务边界。旧 localhost 数据不迁移、不清除，已归档浏览器操作不再是开发入口。

后续先收尾[小程序流程债务](XIAOWEN-FLOW-REVIEW.md)，再独立规划云端作品与账号；新 AppID 需身份、存储隔离与 Android 聚焦复核。旧 H5 专属待办取消，不等于测试通过；共享/后端/小程序待办不得顺带勾选。
