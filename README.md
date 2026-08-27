# 岁月有声 · H5

帮助长辈把想说的话写下来。V2 是正式产品工程，沿用已验收的纸本设计。

真实功能：文字和单段编辑、本机自动保存与恢复、回收站、复制正文、TXT 导出、JSON 备份恢复。语音采集及腾讯云网关已实现，真实识别效果仍待配置凭据后联调。

聊天引导、文章优化和配图保留模拟交互，只在独立副本里运行。“结束演示”不会改动真实作品。

## 本地启动

使用 Node **24.14.1**（见 `.nvmrc`）和 npm，首次运行：

```powershell
Set-Location D:\vibe_code\oldman-design-v2
npm ci
npm run dev
```

始终访问 **http://localhost:3001/**。即使终端显示 `127.0.0.1`，也不要切换地址——浏览器会把它当成另一份存储。启动器同时运行前端与 `127.0.0.1:3002` 语音网关；端口占用会报错退出，不自动换端口。

没有腾讯云凭据也可以使用写作、保存、备份和 AI 演示；真实语音会明确提示尚未配置，不生成假转写。见 [语音接入指引](docs/SPEECH-SETUP.md)。

本期仅本地验收；**未部署新站点，不使用旧 chatgpt.site 页面保存正式作品**。

## 开发入口

- [产品边界](docs/PRODUCT.md)、[设计规范](DESIGN-SYSTEM.md)、[架构与决策](docs/ARCHITECTURE.md)
- [AI 开发约定](AGENTS.md)、[开发与验收](docs/DEVELOPMENT.md)
- [隐私与数据边界](docs/PRIVACY.md)、[清理与回退](docs/CLEANUP.md)
- [本地验收与待办记录](docs/ACCEPTANCE.md)
- 当前 OpenSpec 变更：`productize-local-writing`

```powershell
npm run check
npm run build
npm audit --audit-level=high
```

检查包含类型、Lint、单元/流程测试、OpenSpec 和模块/敏感文件边界检查。自动测试不连接付费语音服务。生产构建检查不是发布。

## 内容安全

本机保存不等于永久保存或云备份。清理浏览器、换浏览器/协议/域名/端口都可能让作品不可见。请在首页“作品与备份”定期导出 JSON；导入校验后恢复为副本，不覆盖原文。TXT 适合阅读，JSON 才能恢复未完成编辑。

Git 标签 `demo-approved-v2` 是已验收 Demo 基线，切换旧版代码前先导出数据。Git 不保存浏览器作品。

用户允许仓库 Public；密钥、录音、用户备份和构建产物不得提交。每个通过检查的小阶段自动本地提交，推送与合并仍需在用户授权范围内执行。
