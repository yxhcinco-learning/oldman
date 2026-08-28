# 岁月有声 · H5

帮助长辈把想说的话写下来。正式工程位于本仓库根目录，沿用已验收的纸本设计；本机启动路径见下方说明。

真实功能：文字和单段编辑、本机自动保存与恢复、回收站、复制正文、TXT 导出、JSON 备份恢复。腾讯云语音网关已完成本机真实链路联调；手机麦克风和键盘兼容性仍待真机验收。

聊天引导、文章优化和配图是待接入 AI 的功能，目前以 mock 保留交互，在独立副本里运行。现有界面的“结束演示”是退出该模拟交互的按钮，不会改动真实作品，不代表项目仍是 Demo。

## 本地启动

使用 Node **24.14.1**（见 `.nvmrc`）和 npm，首次运行：

```powershell
Set-Location D:\vibe_code\oldman
npm ci
npm run dev
```

始终访问 **http://localhost:3001/**。即使终端显示 `127.0.0.1`，也不要切换地址——浏览器会把它当成另一份存储。启动器同时运行前端与 `127.0.0.1:3002` 语音网关；端口占用会报错退出，不自动换端口。

没有腾讯云凭据也可以使用写作、保存、备份，以及聊天和优化的模拟交互；真实语音会明确提示尚未配置，不生成假转写。见 [语音接入指引](docs/SPEECH-SETUP.md)。

当前本机已保存 `.env.local` 并复用 Windows User 中已有腾讯云密钥，不需要再次填写密钥。该文件不入仓库；其他电脑按 `.env.example` 配置。长期子用户密钥不需要 `TENCENT_ASR_TOKEN`。

本期仅本地验收；**已移除 GPT Sites 发布配置和专用依赖，未操作旧线上站点，不使用旧 chatgpt.site 页面保存正式作品**。开发与构建均使用现有 Vinext 本地链路，不需要 Sites 登录或 Cloudflare 配置。

## 开发入口

- [产品边界](docs/PRODUCT.md)、[设计规范](DESIGN-SYSTEM.md)、[架构与决策](docs/ARCHITECTURE.md)
- [AI 开发约定](AGENTS.md)、[开发与验收](docs/DEVELOPMENT.md)
- [隐私与数据边界](docs/PRIVACY.md)、[工程迁移与清理](docs/CLEANUP.md)
- [本地验收与待办记录](docs/ACCEPTANCE.md)
- 当前 OpenSpec 变更：`productize-local-writing`

```powershell
npm run check
npm run build
npm audit --audit-level=high
```

以上为完整代码交付检查，包含类型、Lint、单元/流程测试、OpenSpec、模块/敏感文件边界及构建。日常按 [验证分级](docs/DEVELOPMENT.md#验证分级) 选择检查；常规回归不连接付费语音服务，小规模真实联调按 [费用规则](AGENTS.md#付费服务使用) 单独执行。生产构建检查不是发布。

## 内容安全

本机保存不等于永久保存或云备份。清理浏览器、换浏览器/协议/域名/端口都可能让作品不可见。请在首页“作品与备份”定期导出 JSON；导入校验后恢复为副本，不覆盖原文。TXT 适合阅读，JSON 才能恢复未完成编辑。

Git 提交 `28fd5e4` 是已验收设计的历史基线，回退代码前先导出数据。既有历史标签保持不变；Git 不保存浏览器作品。

提交、推送前检查敏感信息；密钥、录音、用户备份和构建产物不得提交。每个通过检查的小阶段自动本地提交，推送与合并仍需在用户授权范围内执行。
