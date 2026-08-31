# 架构与决策

## 模块

- app：页面入口、全局样式和元数据。
- features/writing：编辑器、作品列表、编辑恢复与操作状态。
- features/speech：正文长按与小文点按控制、音频采集及语音事件。
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

40ms 发送 1280 字节 PCM，按 index 合并临时/最终结果；签名和结束信令参考 [腾讯云官方 SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-js) 与 [WebSocket 接口](https://cloud.tencent.com/document/product/1093/48982)。`TENCENT_ASR_ENGINE_MODEL_TYPE` 只允许 `16k_zh`、`16k_zh_en` 和 `16k_zh_en_2.0`，空值兼容前者，选定值只进入服务端签名参数；非法值在启动阶段失败，不由客户端任意指定。实现不代表真实账号/浏览器兼容性已验收。

`server/credentials.ts` 显式选择 `project` 或 `windows-user`。后者在服务端用固定、隐藏且有超时的 PowerShell 子进程读取 User 环境，秘密只在内存传递，不写项目或日志。只读取选定来源，不混用密钥对和临时 Token；缺失保持网关未配置。本机 `.env.local` 的语音部分只保存 AppID、来源和其他非秘密参数；DeepSeek 配置见 ADR-006。

正文语音面板与文章会话听写共用 `useSpeechDictation`、`SpeechSession` 和同一浏览器内的语音知情授权标记。正文继续使用 `HoldGesture`：指针只由 `pointerup/pointercancel` 结束，键盘由 `keyup` 或持有期间的 blur 结束。小文紧凑按钮使用同一 hook 的 `tap` 交互：空闲点按直接启动，活动中再次点按调用 `SpeechSession.cancel()` 释放资源，但不回滚已经落入受控输入框的识别文字；Escape、页面隐藏、pagehide 和卸载仍按取消边界清理，异常退出可恢复本轮前缀。两种交互均以 `SpeechSession.phase` 表达准备、连接、录音和收尾。会话听写不自动触发 DeepSeek、正文写回或新的服务端接口。

## ADR-004 历史 AI 模拟隔离

接入真实 AI 以前，聊天与优化在独立组件树内初始化副本，不引用存储或真实语音；旧模拟源码和独立测试仍保留。2026-08-28 用户确认的 `add-article-ai-session` 已将正式入口切换到 ADR-006，不能将本历史决策解释为禁止新的确认写回。

真实业务不依赖模拟数据，失败不回退模拟；导入边界由 `scripts/check-boundaries.mjs` 检查。预览源码与真实运行时保持独立。

## ADR-005 Echoes 正式设计

2026-08-28 用户确认将独立预览全面用于正式产品。现行视觉由根目录 DESIGN-SYSTEM.md 和 product-design-system 规范管理，旧基线仅作历史参考。共享 SVG、图标和工具栏属于纯展示组件；正式运行时不依赖 previews。该设计阶段没有改变数据结构或协议；后续 AI 会话按 ADR-006 扩展存储。

## ADR-006 文章级 AI 会话

设计难度中等：现有框架和网关可复用，主要风险在历史证据、持久化一致性和过期结果覆盖，不需要新增 Agent 框架或向量数据库。常规优化和润色文笔保留固定 action；自由输入统一为同篇文章会话中的 `chat` action；“接着问我”和“讲清楚了吗”复用只读 `question` action，不新增协议字段或模型调用分类器。

手动输入停顿 1200ms、完成语音/段落、保存退出及 AI 操作前建立变化检查点。每个 turn 记录基准版本、动作、提示、结果与采纳状态；候选不冒充当前正文。所有动作先进入会话，`result.answer` 作为小文修改说明，turn `status` 作为独立候选状态；生成完成停留会话，用户主动打开全文预览后检查标题/正文基准及 revision，再事务应用。撤销/恢复追加版本，不删除历史；后续有手改时必须再次确认。

请求始终携带当前全文，最多选取 16 条近期 turn、32 个历史版本，旧版本按问题字词相关度排序；省略数显式提示，本机历史不裁剪。上游通过原生 fetch 调 DeepSeek 官方 Chat Completions，固定 `deepseek-v4-flash`、非思考模式、JSON 输出，无自动重试。模型指令区分历史建议和当前全文，文章内容不作为系统指令。相同正文的修改说明由程序校正；部分变化时，程序还会确定性删除说明中明确“未变/保持不变/无需修改”和把同一引文改为自身的条目，过滤后为空则使用中性对照提示。该校正不增加模型调用，也不改变候选正文、引用或状态；其他事实与文笔仍需用户复核。

自由输入只发送一次 `chat` 请求，不增加分类器调用，也不在客户端用关键词猜测意图。模型可只返回 `answer` 回答问题，或同时返回完整 `body` 形成待确认候选；要求不明确时只返回简短追问。会话层以是否存在 `body` 分别保存为 `answered` 或 `ready`。历史 `question` / `rewrite` 记录和重试继续兼容；`chat` 候选采用后仍以 `rewrite` 记录版本来源，因此无需升级数据库/备份版本。候选继续复用基准检查、事务应用、撤销和恢复。文风要求允许合理修辞和氛围表达，但提示词保护人物关系、具体动作、时间地点、数字、对话和事件结果，并要求披露氛围性增写；模型输出仍由用户逐段核对。原始反例及用户校正见 [对话改文验收](CONVERSATIONAL-REWRITE-ACCEPTANCE.md)，统一发送的实现证据见 [统一发送验收](AI-UNIFIED-SEND-ACCEPTANCE.md)。

编辑器移除当前无能力的聊天占位和优化菜单，以单一“小文”入口直接创建 `ArticleAssistant` 会话视图；这只是入口收敛，不把此前另行规划的聊天概念定义成小文。会话首页不渲染预设快捷指令，所有可见新请求都从自由输入经单次 `chat` action 发送，不在客户端做关键词分类。既有 `regular`、`polish` 及精确内部提示“接着问我”“讲清楚了吗”的 `question` 契约继续用于旧会话兼容与回归，不新增可见入口；历史 action、备份 schema 和旧标签不迁移。服务端 `question` 提示词继续施加单问题、最多三处和正文取证限制，控制器确定性删除意外返回的 body。

常规优化、润色文笔、两个只读快捷意图和自由对话共用会话展示，不自动跳转 preview。应用或放弃只更新 status/正文，保留原 answer；“修改记录”继续使用 Dialog 页头操作槽，候选的查看结果与撤销为同一消息操作组。普通成功确认使用约3秒的非模态 toast，状态仍持久保存在 turn 和修改记录；冲突、失败和覆盖风险保持内容流内持续可见。统一反馈的基础实现见 [会话反馈验收](AI-CONVERSATION-FEEDBACK-ACCEPTANCE.md)，紧凑化结果和统一页头尺寸证据见 [语音与结果反馈验收](AI-VOICE-RESULT-FEEDBACK-ACCEPTANCE.md)及[修改记录页头统一验收](AI-RECORD-HEADER-ACCEPTANCE.md)。

移动端根画布以 `window.visualViewport` 的高度和顶部偏移更新 CSS 变量，不支持时回退 `100dvh`；页头、正文滚动区和底部工具栏继续由同一 flex 布局管理。正文语音收起是编辑器内存展示状态，只在空闲且没有待确认文字时提供，收起后不渲染语音舞台或额外展开条；正文点击间隔由编辑器内存判定，单击恢复语音，350ms内第二次点击切换到当前页受控 textarea。触屏/触控笔另以600ms计时和10px移动阈值识别长按，不调用 `preventDefault` 或显式 pointer capture；原生 `contextmenu` 也可进入同一路径。第二次点击或长按坐标通过共享的标准 `caretPositionFromPoint` / WebKit `caretRangeFromPoint` 兼容层取得预览段落内偏移，再叠加前置段落与双换行分隔映射到 textarea 的 UTF-16 折叠 selection；空白或 API 不可用回退到文末。标题从正文区移到页头按钮，独立 `Dialog` 使用本地标题草稿和原生单行输入，确认时才更新 `Draft.title`；打开或取消不改变正文 `inputMode`、正文、待确认文字或恢复状态。普通正文不再建立 `segmentEdit`，旧的未完成普通段落编辑在恢复时合并并迁移到当前页文字模式；`segmentEdit.id === 'pending'` 的语音待确认编辑继续使用独立页面，并用同一坐标兼容层把真实转写内的点击偏移传给独立 textarea，不计状态提示；取消只清除 `segmentEdit`，完成才把编辑值写回 `pendingVoice`。

`WritingToolbar` 的单个52px按钮只在目标 `voice | text` 间切换，图标表示目标模式，不触发录音；相邻叶片入口控制 `ArticleAssistant` 的挂载。小文面板以 compact/expanded 类控制高度，消息区和底部 composer 分离滚动；输入聚焦把面板展开，页头也可显式切换。`ProductApp` 持有当前 work 的未发送 prompt、面板开关和 attention 状态，prompt 不进入 Workspace、IndexedDB、备份或请求，work id 变化即清空。面板卸载不会销毁共享 `ArticleAiController`，因此请求继续；控制器 busy/error 与面板开关共同派生工具栏的 processing/unread/error 状态。显式取消、`finish()` 离开作品和应用销毁才调用 `controller.cancel()`。会话受控 textarea 在空 prompt 时固定52px，实际文字通过 `scrollHeight` 在52–148px间增长，弹窗底部只保留8px基础间距或系统安全区，不引入 contenteditable 或新协议。

浏览器只访问同源 `/api/ai`，Key 仅在服务端读取忽略的 `.env.local`。首次发送需同意正文/历史/消息的数据去向；网关不记录内容。正文 12000 字符、问题 2000 字符、上下文 JSON 120000 字符、请求 1MiB、响应 256KiB、并发 2、每分钟 20 次、超时 120 秒；追问最多输出 2048 tokens，优化 16384 tokens。显式取消、离开作品、断开和关闭服务尽力终止上游；仅收起小文不终止。迟到结果不写回，刷新不自动重试。

编辑器的小文发现提示不进入文章会话或数据库。当前正文首次达到80个非空白字时，以既有 `suiyue-optimize-tip-v1` 在本机记录“已展示”，文案为“小文可以陪您接着写，也能帮您整理。”；提示约6秒自动消失且不抢焦点、不发请求。清理浏览器数据后可能再次出现，不跨设备同步。

JSON v2 携带会话与版本，接受旧 v1；导入整批校验并重映射作品/版本/turn/引用。原 10MiB 导入限制仍在，全文历史增加本机空间与备份体积，当前不提供云同步。详情和真实联调局限见 [验收记录](ARTICLE-AI-ACCEPTANCE.md)。

## ADR-007 受控公网测试运行时

2026-08-30 用户授权在既有腾讯云 Lighthouse 上进行临时、小范围公网测试。固定 Origin 为 `https://suiyue.maicong.chat`：Nginx 在 80/443 终止 TLS 和 Basic Auth，`/` 转发回环 Vinext，`/api/ai/*` 与 `/api/speech` 转发回环 Fastify，语音保留原始 Origin 和 WebSocket Upgrade。前端与网关使用专用 `suiyue` 用户、独立 3011/3012 回环端口、systemd 服务和版本化 release；不开放应用端口，不复用或停止服务器上的其他项目。

阶段性访问保护和简单 IP 限流只在 Nginx；产品不新增账号、邀请码、管理后台、测试提示或配额。Linux 网关固定 `ASR_CREDENTIAL_SOURCE=project`，从 root-only 环境文件读取腾讯云和 DeepSeek 秘密，并按当前体验包使用 `16k_zh`；中英模型保留为需先确认可用额度的服务端选项。Fastify 保持原始请求日志关闭，只输出 requestId、动作、状态、耗时、可用 token 数和固定错误类别；Nginx 关闭该站点 access log，错误日志沿用服务器 logrotate，systemd stdout/stderr 由 journald 轮转。

每个浏览器 Origin 继续拥有独立 IndexedDB。公网域名首次访问为空库；localhost 或其他域名文章只能由用户显式导出 JSON、再在目标浏览器恢复为副本，服务器不接收备份或文章同步。部署、验证和回滚见 [受控公网部署](DEPLOYMENT.md)；产品协议仍由 ADR-002、ADR-003 和 ADR-006 管理。

### 历史回退来源

Git 提交 `28fd5e4` 为无持久化的历史设计基线。正式 Git 历史保存在 D:/vibe_code/oldman；原型源码和额外 bundle 已按用户要求清理，不再保留退役副本。回退前导出 JSON，代码回退不等于数据库降级。
