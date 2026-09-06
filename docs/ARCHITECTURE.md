# 架构与决策

## 模块

- app：页面入口、全局样式和元数据。
- features/writing：编辑器、作品列表、编辑恢复与操作状态。
- features/speech：正文长按与小文点按控制、音频采集及语音事件。
- features/ai：文章助手界面、会话请求控制、上下文选取与共享协议。
- features/topics：议题读取、详情展示及写作入口；不抓取或保存第三方全文。
- features/topic-admin：独立内部后台的登录、候选编辑、预览、修订、排期、生成记录与审计界面；不进入用户导航。
- features/demo：历史模拟交互，只接收深副本和退出回调，保留独立测试；正式产品不导入。
- lib/domain：Work、Draft、Segment、ArticleSession、ArticleVersion、AiTurn 与纯函数。
- lib/storage：WorkRepository、IndexedDB、版本化备份。
- packages/core：网页、小程序和测试共享的领域、备份、AI 来源与协议纯逻辑，不引用 DOM、Node 或 `wx`。
- apps/miniprogram：WXML/WXSS/TypeScript 原生客户端，本地聚合文件、微信网络、录音与文件适配器独立于网页 UI。
- server：仅回环地址的 Fastify 网关，承载 WebSocket ASR、HTTP 文章 AI、SQLite 话题读写、DeepSeek 话题候选、微信/管理员会话及匿名付费用量账本。

## ADR-001 保留工具链

沿用 React 19 / TypeScript / Vinext / npm。本次不迁移框架；Vinext beta 稳定性在公开发布前另行评估。固定运行时并提交锁文件。

开发和构建均使用现有 Vinext 本地 Node 链路。2026-08-28 用户停用 GPT Sites，已移除 Sites/Cloudflare Vite 插件、Worker 类型、Wrangler 直接依赖及 D1/R2 占位配置，不迁移 React/Vinext 框架。之前 Cloudflare 开发插件的无差别 WebSocket 升级监听器曾截断语音代理；保留相关回归，不改写 Origin 或用户访问地址。

审计后在相同工具链内更新安全修复版本：Next 16.3.3、React/RSC 19.2.8、Vinext beta.8、Vite 8.2.2。移除发布专用依赖时未升级剩余包；实际以 package-lock.json 为准，不能仅用 `--omit=dev` 掩盖参与开发/构建的依赖风险。

## ADR-002 本地事务

IndexedDB v4 的 works 保存作品快照、revision、deletedAt；recovery 保存活动草稿；articleSessions 保存不可变正文版本与统一小文会话。v1–v3 以惰性方式恢复原素材和旧轮次，首次会话写入后以 conversation.mode 为唯一模式来源。模式和消息更新在本地事务成功后才显示，失败不声称已切换；正文应用仍采用事务、基准冲突检查和撤销。

## ADR-003 语音边界

AudioWorklet 重采样至 16kHz PCM16；同源 WebSocket 代理至 127.0.0.1:3002；服务端签名并连接腾讯云固定地址。独立状态机管理长按、授权、采音、收尾、取消。网关限制连接、时长、输入大小及 Origin，不记录内容。

40ms 发送 1280 字节 PCM，按 index 合并临时/最终结果；签名和结束信令参考 [腾讯云官方 SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-js) 与 [WebSocket 接口](https://cloud.tencent.com/document/product/1093/48982)。`TENCENT_ASR_ENGINE_MODEL_TYPE` 只允许 `16k_zh`、`16k_zh_en` 和 `16k_zh_en_2.0`，空值兼容前者，选定值只进入服务端签名参数；非法值在启动阶段失败，不由客户端任意指定。实现不代表真实账号/浏览器兼容性已验收。

`server/credentials.ts` 显式选择 `project` 或 `windows-user`。后者在服务端用固定、隐藏且有超时的 PowerShell 子进程读取 User 环境，秘密只在内存传递，不写项目或日志。只读取选定来源，不混用密钥对和临时 Token；缺失保持网关未配置。本机 `.env.local` 的语音部分只保存 AppID、来源和其他非秘密参数；DeepSeek 配置见 ADR-006。

正文语音面板与文章会话听写共用 `useSpeechDictation`、`SpeechSession` 和同一浏览器内的语音知情授权标记。正文继续使用 `HoldGesture`：指针只由 `pointerup/pointercancel` 结束，键盘由 `keyup` 或持有期间的 blur 结束。小文会话语音按钮使用同一 hook 的 `tap` 交互：空闲点按直接启动，活动中再次点按调用 `SpeechSession.cancel()` 释放资源，但不回滚已经落入受控输入框的识别文字；Escape、页面隐藏、pagehide 和卸载仍按取消边界清理，异常退出可恢复本轮前缀。两种交互均以 `SpeechSession.phase` 表达准备、连接、录音和收尾。会话听写不自动触发 DeepSeek、正文写回或新的服务端接口。

## ADR-004 历史 AI 模拟隔离

接入真实 AI 以前，聊天与优化在独立组件树内初始化副本，不引用存储或真实语音；旧模拟源码和独立测试仍保留。2026-08-28 用户确认的 `add-article-ai-session` 已将正式入口切换到 ADR-006，不能将本历史决策解释为禁止新的确认写回。

真实业务不依赖模拟数据，失败不回退模拟；导入边界由 `scripts/check-boundaries.mjs` 检查。预览源码与真实运行时保持独立。

## ADR-005 Echoes 正式设计

2026-08-28 用户确认将独立预览全面用于正式产品。现行视觉由根目录 DESIGN-SYSTEM.md 和 product-design-system 规范管理，旧基线仅作历史参考。共享 SVG、图标和工具栏属于纯展示组件；正式运行时不依赖 previews。该设计阶段没有改变数据结构或协议；后续 AI 会话按 ADR-006 扩展存储。

## ADR-006 文章级 AI 会话

无话题空会话的问候由共享 `conversationView` 作为展示空态派生，不进入持久消息、请求上下文或素材。静态访谈开场依据已有正文/有效会话材料与话题快照选择，不以“有任何消息”冒充已有实质交流，也不解析客户端关键词。两端无话题顶部只保留单行操作，等待时仍以已保存mode为准；控制操作与发送输入分开，只有本次实际发送的输入才清空。

结果阅读文案由客户端共享的 `readableResultSummary` 转换旧“查看候选”指引，服务端原始回复、文章正文、版本和备份不因此改写。预览不重复会话说明卡片，只呈现来源提醒、状态/对照和正文，采用/放弃仍走既有事务。

`conversationView` 从请求状态派生助手等待、失败和重试气泡，使用与正式回复一致的稳定消息 ID；占位不写入会话或素材。两端复用此视图，等待仅以三点呈现、文字作为读屏标签，发送原位的“停止”复用现有取消流程。顶部主题区统一状态与下划线操作；H5 ResizeObserver、小程序渲染后测量及尺寸事件按实际溢出距离驱动话题滚动，短题静止，减少动效时停用动画。结束切换与候选采用仍使用原有编排，不新增存储格式或协议。

统一会话协议需要服务端先部署再更新客户端。网关区分 unsupported_protocol、invalid_request、context_too_large，不回传原始字段或用户内容。小程序识别旧网关对 dialogue 的特定通用拒绝提示为服务待更新，不自动降级旧采访协议、不自动重试或删减素材；原始消息仍保存在本机供更新后显式重试。

共享核心 packages/core/src/conversation.ts 负责编排模式、连续原始消息、材料来源和更正关系；H5 与小程序只适配存储、网络和显示。自由输入使用 protocolVersion=2 的 dialogue action，同一次模型调用完成语义意图与回复，不增加分类器或客户端关键词路由。旧 action 保留兼容，不再作为新访谈的正式路径。

手动输入停顿 1200ms、完成语音/段落、保存退出及 AI 操作前建立变化检查点。每个 turn 记录基准版本、动作、提示、结果与采纳状态；候选不冒充当前正文。所有动作先进入会话，`result.answer` 作为小文修改说明，turn `status` 作为独立候选状态；生成完成停留会话，用户主动打开全文预览后检查标题/正文基准及 revision，再事务应用。撤销/恢复追加版本，不删除历史；后续有手改时必须再次确认。

请求始终携带当前全文，最多选取 16 条近期 turn、32 个历史版本，旧版本按问题字词相关度排序；省略数显式提示，本机历史不裁剪。上游通过原生 fetch 调 DeepSeek 官方 Chat Completions，固定 `deepseek-v4-flash`、非思考模式、JSON 输出，无自动重试。模型指令区分历史建议和当前全文，文章内容不作为系统指令。相同正文的修改说明由程序校正；部分变化时，程序还会确定性删除说明中明确“未变/保持不变/无需修改”和把同一引文改为自身的条目，过滤后为空则使用中性对照提示。该校正不增加模型调用，也不改变候选正文、引用或状态；其他事实与文笔仍需用户复核。

自由输入返回可校验的 dialogue.intent（reply/start/finish/confirm-edit/edit）、可选原文素材关联及候选。访谈中的改文请求先保存 pendingEdit，用户确认后结束访谈并将整理和原要求合并成一次候选；只有 finish 或普通对话明确 edit 可以返回 body。候选仍复用预览、应用、放弃、版本冲突和撤销。

每篇作品只有一个 conversation，持久 mode、messages、materials 和 pendingEdit；消息角色区分用户、AI 与系统切换记录。问候和控制输入先保存原始消息，不自动成文；模型可从当前消息引用连续原文片段，supersedes 保留更正关系。旧 draft.materials 问答与 turn 按各自可恢复顺序迁移，不构造时间顺序，不丢弃旧字段。

H5 保留小文面板，小程序访谈保留全屏。模式条显示“访谈中 / 结束访谈并整理”或“普通对话 / 开启访谈”。切换不清空历史、输入或候选，刷新和重开不调用模型。旧优化 action 和历史标签继续可读、可重试。

小程序共享依赖的本地生成版本附带 bundle 内容指纹，npm 二次构建前后检查会话函数导出的存在与类型；六个会话函数在平台边界显式再导出。显式刷新命令完成后只清理当前项目 compile 缓存，使 TypeScript 导入图重新编译，绝不清理作品/文件/身份。编辑器读取与展示错误隔离：展示失败保留已读草稿、修订及正文，不另造空草稿；模拟器回归通过独立存储根及假 transport 验证真实页面，不在生产代码加入测试分支。

常规优化、润色文笔、两个只读快捷意图和自由对话共用会话展示，不自动跳转 preview。应用或放弃只更新 status/正文，保留原 answer；“修改记录”继续使用 Dialog 页头操作槽，候选的查看结果与撤销为同一消息操作组。普通成功确认使用约3秒的非模态 toast，状态仍持久保存在 turn 和修改记录；冲突、失败和覆盖风险保持内容流内持续可见。统一反馈的基础实现见 [会话反馈验收](AI-CONVERSATION-FEEDBACK-ACCEPTANCE.md)，紧凑化结果和统一页头尺寸证据见 [语音与结果反馈验收](AI-VOICE-RESULT-FEEDBACK-ACCEPTANCE.md)及[修改记录页头统一验收](AI-RECORD-HEADER-ACCEPTANCE.md)。

移动端根画布以 `window.visualViewport` 的高度和顶部偏移更新 CSS 变量，不支持时回退 `100dvh`；页头、正文滚动区和底部工具栏继续由同一 flex 布局管理。正文语音收起是编辑器内存展示状态，只在空闲且没有待确认文字时提供，收起后不渲染语音舞台或额外展开条；正文点击间隔由编辑器内存判定，单击恢复语音，350ms内第二次点击切换到当前页受控 textarea。触屏/触控笔另以600ms计时和10px移动阈值识别长按，不调用 `preventDefault` 或显式 pointer capture；原生 `contextmenu` 也可进入同一路径。第二次点击或长按坐标通过共享的标准 `caretPositionFromPoint` / WebKit `caretRangeFromPoint` 兼容层取得预览段落内偏移，再叠加前置段落与双换行分隔映射到 textarea 的 UTF-16 折叠 selection；空白或 API 不可用回退到文末。标题从正文区移到页头按钮，独立 `Dialog` 使用本地标题草稿和原生单行输入，确认时才更新 `Draft.title`；打开或取消不改变正文 `inputMode`、正文、待确认文字或恢复状态。普通正文不再建立 `segmentEdit`，旧的未完成普通段落编辑在恢复时合并并迁移到当前页文字模式；`segmentEdit.id === 'pending'` 的语音待确认编辑继续使用独立页面，并用同一坐标兼容层把真实转写内的点击偏移传给独立 textarea，不计状态提示；取消只清除 `segmentEdit`，完成才把编辑值写回 `pendingVoice`。

`WritingToolbar` 的单个52px按钮只在目标 `voice | text` 间切换，图标表示目标模式，不触发录音；按钮使用 `var(--tint)` 且无外投影，与相邻叶片入口保持同一 Echoes 色阶。小文面板不再保存 compact/expanded 状态或渲染尺寸控制，使用一个约72dvh、上限620px且受 Visual Viewport 约束的高度；消息区和底部 composer 分离滚动，短屏先压缩消息区。`ProductApp` 持有当前 work 的未发送 prompt、面板开关和 attention 状态，prompt 不进入 Workspace、IndexedDB、备份或请求，work id 变化即清空。面板卸载不会销毁共享 `ArticleAiController`，因此请求继续；控制器 busy/error 与面板开关共同派生工具栏的 processing/unread/error 状态。显式取消、`finish()` 离开作品和应用销毁才调用 `controller.cancel()`。会话受控 textarea 在空 prompt 时固定52px，实际文字通过 `scrollHeight` 在52–148px间增长，弹窗底部只保留8px基础间距或系统安全区，不引入 contenteditable 或新协议。

首次访谈使用精简静态开场；再次开启承接已有会话。收起、返回、重开保留模式，即使只有开场也保留会话恢复记录。按钮结束先保存普通模式和切换事件再请求整理；自然语言结束只有收到有效结果才保存切换。失败和取消保留原始消息及显式重试，重试复用 turnId，不重复消息和素材；迟到结果不能覆盖新状态。

浏览器只访问同源 `/api/ai`，Key 仅在服务端读取忽略的 `.env.local`。首次发送需同意正文、历史、消息及采访所用议题/素材的数据去向；网关不记录内容。正文 12000 字符、上下文 JSON 120000 字符、请求 1MiB、响应 256KiB、并发 2、每分钟 20 次、超时 120 秒；追问与采访最多输出 2048 tokens，候选最多 16384 tokens。显式取消、离开作品、断开和关闭服务尽力终止上游；仅收起小文不终止。迟到结果不写回，刷新不自动重试。

编辑器的小文发现提示不进入文章会话或数据库。当前正文首次达到80个非空白字时，以既有 `suiyue-optimize-tip-v1` 在本机记录“已展示”，文案为“小文可以陪您接着写，也能帮您整理。”；提示约6秒自动消失且不抢焦点、不发请求。清理浏览器数据后可能再次出现，不跨设备同步。

JSON v5 携带统一会话、模式事件、原文消息、素材来源/更正关系、旧素材、版本和 AI 披露，继续接受 v1–v4；导入重映射作品、消息、素材、版本、turn 和引用。备份包含空正文会话，披露继续依据实际采用的候选校验。10MiB 导入上限不变。

AI 标识采用保守的作品历史谓词：只有明确应用的完整候选计入，`ready` 或 `dismissed` 不计入；一旦计入，后续手动版本或恢复版本不删除历史披露。小文消息、候选预览和对应应用版本显示可见标识，用户原始正文、采访回答和话题来源保持各自真实来源。复制/TXT 通过共享纯函数生成可见说明，JSON v5 保存并校验结构化披露，标识文字不反向写入编辑正文。

## ADR-007 受控公网测试运行时

2026-08-30 用户授权在既有腾讯云 Lighthouse 上进行临时、小范围公网测试。固定 Origin 为 `https://suiyue.maicong.chat`：Nginx 在 80/443 终止 TLS，用户网页 `/`、原 `/api/ai/*` 和原 `/api/speech` 继续受 Basic Auth 与浏览器 Origin 约束；精确话题只读接口和明确列出的小程序接口关闭 Basic Auth。未来激活话题后台时，`/admin/topics`、其不可变前端静态资源和 `/api/admin/*` 同样绕过 Basic Auth，但由应用自身的管理员会话、精确 Origin、CSRF、JSON Content-Type 和限流保护；未列出的 API 继续拒绝。前端与网关使用专用 `suiyue` 用户、独立 3011/3012 回环端口、systemd 服务和版本化 release；不开放应用端口，不复用或停止服务器上的其他项目。

用户端不新增可见账号或邀请码；内部话题后台采用单一管理员配置。Linux 网关从同一个 root-only 环境文件读取腾讯云、DeepSeek、微信 AppID/AppSecret、管理员用户名/scrypt 散列及数据库路径；缺失或无效时只关闭对应在线能力，网页本机写作不回退假身份或假话题。身份库、话题库和付费用量库分别位于 release 外的 `/var/lib/suiyue-yousheng/auth.sqlite`、`topics.sqlite` 与 `usage.sqlite`，目录仅 `suiyue` 可写；systemd 只放行该目录。激活前停止网关，对三库执行 `quick_check`、schema 上限检查和 SQLite 在线备份；失败迁移把三库的失败态分别移入 root-only 隔离目录，再恢复迁移前副本。普通代码回滚只核对兼容性，不删除、覆盖或降级数据库。

Fastify 保持原始请求日志关闭，只输出 requestId、动作、状态、耗时、可用 token 数和固定错误类别；同一安全日志 sink 前的 `OperationMonitor` 丢弃 requestId，只按固定动作在内存聚合生命周期与最近 15/60 分钟的计数、状态、延迟直方图、token 和错误类别。管理员会话保护的 `/api/admin/monitoring` 提供该快照与能力布尔值，重启即清空，不建立行为数据库。Nginx 关闭该站点 access log，小程序语音 ticket 和匿名事件位置再次显式关闭访问日志，错误日志沿用服务器 logrotate，systemd stdout/stderr 由 journald 轮转。`/api/health` 契约保持只报告配置布尔值，不显示账号、AppID、路径、OpenID 或秘密。

每个浏览器 Origin 继续拥有独立 IndexedDB。公网域名首次访问为空库；localhost 或其他域名文章只能由用户显式导出 JSON、再在目标浏览器恢复为副本，服务器不接收备份或文章同步。部署、验证和回滚见 [受控公网部署](DEPLOYMENT.md)；产品协议仍由 ADR-002、ADR-003 和 ADR-006 管理。

## ADR-008 精选议题与写作素材

首页议题来自服务端 SQLite 人工审核库，分为近期、时令和慢议题；公开列表只返回当前有效的五个显式首页席位，按 1–5 排序，可少于五条，不做自动混排、补位或无限流。`WorksHome` 内部状态只切换固定底部“文章 / 热门 / 我的”三个展示面，不改变存储或网络状态；“我的”只调用既有作品与备份对话框，不引入账号模型。每条话题包含摘要、有效期、0–5 条来源链接、内部编辑判断、可选角度和审核/更正版本；前台隐藏 `whyItMatters`，来源为空时不渲染来源区。发布接口只读，AI 只能形成候选，不能绕过人工发布；来源由编辑逐项审核，不再由域名白名单决定发布资格。服务端不接收用户正文，也不复制第三方全文。

用户开始写作时把议题复制为本机快照，离线仍可查看；话题更新经用户确认替换。背景事实、原始消息、有效用户素材、AI 建议和已采用正文分层保存。显式结束访谈统一整理；内容不足只解释，不强行成文。

## ADR-009 话题编辑数据库与审核闭环

话题运行时使用独立 `topics.sqlite`，schema v1 采用 WAL、外键、严格表、事务和启动 `quick_check`。数据模型包含话题、不可变修订、AI 生成记录、首页席位、管理员、后台会话和审计。状态沿用 `draft / candidate / rejected / published / corrected / archived`；草稿与候选通过 `editVersion` 乐观并发原地编辑，发布后只能追加更高修订。席位记录修订、开始和结束时间，同一席位时间段重叠在事务内返回冲突；公开查询按当前时间判断 `publishedAt`、有效期、归档与席位，无常驻定时器。首次空库幂等导入 21 条种子并固化原选择规则的五个席位，静态目录随后只作迁移夹具；库损坏、配置失败或未来 schema 一律返回 503，不回退种子。

管理员用户名与 scrypt 密码散列来自服务端环境。登录签发随机 Cookie，数据库只保存 token/CSRF 散列；HttpOnly、SameSite、生产 Secure、精确 Origin、CSRF、登录限流、过期、退出和凭据指纹轮换共同保护会话。所有后台写请求还要求 JSON 与修订前置条件，过期页面返回 409。审计只记录操作者、动作、实体、时间和非敏感差异摘要。

话题 AI 使用独立 DeepSeek Responses 适配器，文章小文继续使用 Chat Completions。编辑输入 0–6000 字、0–5 个 HTTP(S) 链接且至少一项；链接存在时强制联网，纯文本可关闭联网。一次按钮操作最多一个顶层请求、并发一、无自动重试，结构化输出只创建 `candidate`；记录模型、token、联网与搜索调用数和固定错误类别，不保存思维链或上游原始响应。来源、日期和事实都可由编辑修改或删除，无来源仍可发布。

## ADR-010 隐私型运营事件与当前进程监控

H5 的运营 transport 只接受共享枚举中的七个低频动作，并发送严格的 `{ event }`；不存在通用 metadata、客户端队列、标识 Cookie 或自动重试。`/api/operations/events` 要求精确 Origin、JSON、256B body、严格 schema 与全局分钟上限；未来 Nginx 精确路由继续继承 H5 Basic Auth，并增加不进入应用聚合的 IP 限流。写作、备份等本地动作先按原流程完成，事件失败被隔离。

后台的运营指标仍以当前进程快照回答“是否被使用、在线请求是否正常”，不回答“谁做了什么”。固定动作最多 128 类，分钟窗口最多 60 桶，延迟使用固定直方图区间，错误类别每项有界；不保存 requestId、IP、Header、Body、话题/作品 ID 或原始事件。ADR-011 只为请求前预算判断另存跨重启匿名日汇总，不把运营事件或用户轨迹写入持久层；外部告警或第三方分析仍必须另立规范。

## ADR-011 AI 与语音付费用量治理

文章模型响应在进入共享严格契约前，仅兼容实测的唯一错位 `dialogue.body`：顶层没有 body 时移动该字段，随后仍校验正文类型、未知字段、意图授权、素材和引用。顶层与嵌套同时存在 body 时拒绝，绝不选择覆盖，也不发第二次模型请求。该适配不改变客户端或备份协议。

文章 AI、话题 AI 和网页/小程序实时语音共用独立 `usage.sqlite`。schema v1 使用 WAL、严格表、事务、启动 `quick_check` 和未来版本拒绝；按 `Asia/Shanghai` 自然日只保存三类聚合用量及仍在途的匿名预留，不保存用户、文章、话题引子、链接、音频、转写、请求正文或请求时间线。启动时把上次崩溃遗留的预留按上界保守结算；正常完成以 DeepSeek `usage` 或实际语音秒数结算，无法确认的失败与取消同样按预留上界结算。

每次付费请求必须先在 `BEGIN IMMEDIATE` 事务内预留预算，再创建 DeepSeek 请求或腾讯 WebSocket。文章请求按实际请求体 UTF-8 上界和该 action 最大输出预留；话题离线生成按本地输入上界预留，开启 `web_search` 时按搜索可能续推的保守上界预留；语音按今日余额动态缩短会话许可。文章 AI、话题 AI 和语音分别使用每日 token/token/秒上限，网页和小程序共享语音池；0 表示主动停用。预算不足在上游调用前拒绝，不影响本机写作、作品、已发布话题和后台内容管理。

开发环境默认 `.data/usage.sqlite` 与明确的保守日上限；生产必须显式配置绝对路径和三项非负整数上限，否则付费能力失败关闭，`/api/health` 只报告 `costGovernanceConfigured=false`。可选 DeepSeek 输入/输出每百万 token 与腾讯语音每小时人民币单价仅生成趋势估算；由于缓存、峰谷、搜索续推、资源包、阶梯价和供应商规则会变化，供应商控制台始终是账单依据。后台受登录保护的监控页显示今日已用、在途预留、限额、余额、上海时区重置时间和可选估算，并与重启即清零的运营进程指标分区展示。

### 历史回退来源

Git 提交 `28fd5e4` 为无持久化的历史设计基线。正式 Git 历史保存在 D:/vibe_code/oldman；原型源码和额外 bundle 已按用户要求清理，不再保留退役副本。回退前导出 JSON，代码回退不等于数据库降级。
