# 岁月有声 · H5

帮助长辈把想说的话写下来。正式工程位于本仓库根目录，采用已确认的 Echoes of Time 设计：暖白纸面、森林绿、书信插画与轻盈排版；现行规则见 [设计规范](DESIGN-SYSTEM.md)，本机启动路径见下方说明。

真实功能：文字和单段编辑、本机自动保存与恢复、回收站、复制正文、TXT 导出、JSON 备份恢复。腾讯云语音网关已完成本机真实链路联调；手机麦克风和键盘兼容性仍待真机验收。

文章 AI 已接入 DeepSeek V4 Flash：常规优化、润色文笔、同篇文章的文字追问和对话式改文。快捷优化和文字需求都会进入同一文章会话；小文先给出修改说明，待应用/已应用/未采用作为独立状态保留，再由用户查看全文、确认应用或放弃。精简、扩写和配图尚未开放。详见 [文章 AI 验收](docs/ARTICLE-AI-ACCEPTANCE.md)、[对话改文验收](docs/CONVERSATIONAL-REWRITE-ACCEPTANCE.md)和[统一会话反馈验收](docs/AI-CONVERSATION-FEEDBACK-ACCEPTANCE.md)。

## 本地启动

使用 Node **24.14.1**（见 `.nvmrc`）和 npm，首次运行：

```powershell
Set-Location D:\vibe_code\oldman
npm ci
npm run dev
```

始终访问 **http://localhost:3001/**。即使终端显示 `127.0.0.1`，也不要切换地址——浏览器会把它当成另一份存储。启动器同时运行前端与 `127.0.0.1:3002` 语音/文章 AI 网关；端口占用会报错退出，不自动换端口。

少量同事的临时公网体验使用独立的受控 HTTPS Origin，不复用 localhost 数据或 GPT Sites。部署、访问保护、秘密、验证和回滚边界见 [受控公网测试部署](docs/DEPLOYMENT.md)。

没有服务凭据也可以使用写作、保存和备份；语音或 AI 未配置时明确提示，不生成模拟结果。语音见 [接入指引](docs/SPEECH-SETUP.md)；AI 在根目录 `.env.local` 填写 `DEEPSEEK_API_KEY` 并重启网关，地址及 `deepseek-v4-flash` 已在模板预填，见 [AI 配置](docs/DEVELOPMENT.md#文章-ai-接入配置)。

当前本机已保存 `.env.local` 并复用 Windows User 中已有腾讯云密钥；DeepSeek Key 也已配置且仅在服务端使用。该文件不入仓库；其他电脑按 `.env.example` 配置。长期子用户密钥不需要 `TENCENT_ASR_TOKEN`。

项目已移除 GPT Sites 发布配置和专用依赖，未操作旧线上站点，也不使用旧 chatgpt.site 页面保存正式作品。当前少量同事体验仅使用独立的腾讯云受控公网部署；本地开发与构建仍走 Vinext Node 链路，不需要 Sites 登录或 Cloudflare 配置。

## 开发入口

- [产品边界](docs/PRODUCT.md)、[设计规范](DESIGN-SYSTEM.md)、[架构与决策](docs/ARCHITECTURE.md)
- [AI 开发约定](AGENTS.md)、[开发与验收](docs/DEVELOPMENT.md)
- [隐私与数据边界](docs/PRIVACY.md)、[工程迁移与清理](docs/CLEANUP.md)
- [本地验收与待办记录](docs/ACCEPTANCE.md)
- 当前 OpenSpec change ID：`productize-local-writing`、`deploy-controlled-public-test`（这是规范变更标识，不是 Git 分支名）

```powershell
npm run check
npm run build
npm audit --audit-level=high
```

以上为完整代码交付检查，包含类型、Lint、单元/流程测试、OpenSpec、模块/敏感文件边界及构建。日常按 [验证分级](docs/DEVELOPMENT.md#验证分级) 选择检查；常规回归不连接付费语音或 AI 服务，小规模真实联调按 [费用规则](AGENTS.md#付费服务使用) 单独执行。生产构建检查不是发布。

## 内容安全

本机保存不等于永久保存或云备份。清理浏览器、换浏览器/协议/域名/端口都可能让作品不可见。请在首页“作品与备份”定期导出 JSON；导入校验后恢复为副本，不覆盖原文。TXT 适合阅读，JSON 才能恢复未完成编辑。

Git 提交 `28fd5e4` 是已验收设计的历史基线，回退代码前先导出数据。既有历史标签保持不变；Git 不保存浏览器作品。

提交、推送前检查敏感信息；密钥、录音、用户备份和构建产物不得提交。每个通过检查的小阶段自动本地提交；创建、切换、重命名、合并、删除分支以及推送均需用户明确允许。
