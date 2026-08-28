# 架构与决策

## 模块

- app：页面入口、全局样式和元数据。
- features/writing：编辑器、作品列表、编辑恢复与操作状态。
- features/speech：长按控制、音频采集与语音事件。
- features/ai：文章助手界面、会话请求控制、上下文选取与共享协议。
- features/demo：历史模拟交互，只接收深副本和退出回调，保留独立测试；正式产品不导入。
- lib/domain：Work、Draft、Segment、ArticleSession、ArticleVersion、AiTurn 与纯函数。
- lib/storage：WorkRepository、IndexedDB、版本化备份。
- server：仅回环地址的 Fastify 网关，承载 WebSocket ASR 与 HTTP 文章 AI。

## ADR-001 保留工具链

沿用 React 19 / TypeScript / Vinext / npm。本次不迁移框架；Vinext beta 稳定性在公开发布前另行评估。固定运行时并提交锁文件。

开发和构建均使用现有 Vinext 本地 Node 链路。2026-08-28 用户停用 GPT Sites，已移除 Sites/Cloudflare Vite 插件、Worker 类型、Wrangler 直接依赖及 D1/R2 占位配置，不迁移 React/Vinext 框架。之前 Cloudflare 开发插件的无差别 WebSocket 升级监听器曾截断语音代理；保留相关回归，不改写 Origin 或用户访问地址。

审计后在相同工具链内更新安全修复版本：Next 16.3.3、React/RSC 19.2.8、Vinext beta.8、Vite 8.2.2。移除发布专用依赖时未升级剩余包；实际以 package-lock.json 为准，不能仅用 `--omit=dev` 掩盖参与开发/构建的依赖风险。

## ADR-002 本地事务

IndexedDB v2 的 works 保存 ID、时间、revision、deletedAt 与编辑快照；recovery 保存活动作品指针；articleSessions 保存文章会话和不可变全文版本。v1 升级只添加 store，不改写已有正文。写队列串行，事务内比较 revision，冲突拒绝而非覆盖；AI 应用和恢复在同一事务写正文、会话与恢复快照。UI 依赖存储接口，禁止删库恢复。

## ADR-003 语音边界

AudioWorklet 重采样至 16kHz PCM16；同源 WebSocket 代理至 127.0.0.1:3002；服务端签名并连接腾讯云固定地址。独立状态机管理长按、授权、采音、收尾、取消。网关限制连接、时长、输入大小及 Origin，不记录内容。

40ms 发送 1280 字节 PCM，按 index 合并临时/最终结果；签名和结束信令参考 [腾讯云官方 SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-js) 与 [WebSocket 接口](https://cloud.tencent.com/document/product/1093/48982)。实现不代表真实账号/浏览器兼容性已验收。

`server/credentials.ts` 显式选择 `project` 或 `windows-user`。后者在服务端用固定、隐藏且有超时的 PowerShell 子进程读取 User 环境，秘密只在内存传递，不写项目或日志。只读取选定来源，不混用密钥对和临时 Token；缺失保持网关未配置。本机 `.env.local` 的语音部分只保存 AppID、来源和其他非秘密参数；DeepSeek 配置见 ADR-006。

## ADR-004 历史 AI 模拟隔离

接入真实 AI 以前，聊天与优化在独立组件树内初始化副本，不引用存储或真实语音；旧模拟源码和独立测试仍保留。2026-08-28 用户确认的 `add-article-ai-session` 已将正式入口切换到 ADR-006，不能将本历史决策解释为禁止新的确认写回。

真实业务不依赖模拟数据，失败不回退模拟；导入边界由 `scripts/check-boundaries.mjs` 检查。预览源码与真实运行时保持独立。

## ADR-005 Echoes 正式设计

2026-08-28 用户确认将独立预览全面用于正式产品。现行视觉由根目录 DESIGN-SYSTEM.md 和 product-design-system 规范管理，旧基线仅作历史参考。共享 SVG、图标和工具栏属于纯展示组件；正式运行时不依赖 previews。该设计阶段没有改变数据结构或协议；后续 AI 会话按 ADR-006 扩展存储。

## ADR-006 文章级 AI 会话

设计难度中等：现有框架和网关可复用，主要风险在历史证据、持久化一致性和过期结果覆盖，不需要新增 Agent 框架或向量数据库。快捷优化与文字追问是同篇文章会话中的不同 action，而非互不相关的请求。

手动输入停顿 1200ms、完成语音/段落、保存退出及 AI 操作前建立变化检查点。每个 turn 记录基准版本、动作、提示、结果与采纳状态；候选不冒充当前正文。全文预览后检查标题/正文基准及 revision，再事务应用。撤销/恢复追加版本，不删除历史；后续有手改时必须再次确认。

请求始终携带当前全文，最多选取 16 条近期 turn、32 个历史版本，旧版本按问题字词相关度排序；省略数显式提示，本机历史不裁剪。上游通过原生 fetch 调 DeepSeek 官方 Chat Completions，固定 `deepseek-v4-flash`、非思考模式、JSON 输出，无自动重试。模型指令区分历史建议和当前全文，文章内容不作为系统指令。相同正文的修改说明由程序校正；其他事实与文笔仍需用户复核。

浏览器只访问同源 `/api/ai`，Key 仅在服务端读取忽略的 `.env.local`。首次发送需同意正文/历史/消息的数据去向；网关不记录内容。正文 12000 字符、问题 2000 字符、上下文 JSON 120000 字符、请求 1MiB、响应 256KiB、并发 2、每分钟 20 次、超时 120 秒；追问最多输出 2048 tokens，优化 16384 tokens。取消、断开和关闭服务尽力终止上游；迟到结果不写回，刷新不自动重试。

JSON v2 携带会话与版本，接受旧 v1；导入整批校验并重映射作品/版本/turn/引用。原 10MiB 导入限制仍在，全文历史增加本机空间与备份体积，当前不提供云同步。详情和真实联调局限见 [验收记录](ARTICLE-AI-ACCEPTANCE.md)。

### 历史回退来源

Git 提交 `28fd5e4` 为无持久化的历史设计基线。正式 Git 历史保存在 D:/vibe_code/oldman；原型源码和额外 bundle 已按用户要求清理，不再保留退役副本。回退前导出 JSON，代码回退不等于数据库降级。
