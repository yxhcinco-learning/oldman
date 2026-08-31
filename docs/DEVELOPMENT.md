# 开发与验收

## 开工顺序

先读 AGENTS.md，再按任务涉及范围查阅产品边界、现行设计规范、架构和本次已确认的 OpenSpec 变更。产品文档记录范围与功能状态，OpenSpec 记录预期行为与验收场景，设计规范负责视觉，架构负责模块和数据边界。历史材料不覆盖现行规范；发现冲突先澄清，不自行选择性遵循。

OpenSpec CLI 锁定为 1.2.0，Codex 集成在 `.codex/skills`：

```powershell
npx openspec list
npx openspec status --change productize-local-writing
npx openspec instructions apply --change productize-local-writing
npm run spec:check
```

这里的 `productize-local-writing` 是 OpenSpec change ID，不是 Git 分支名；其他任务应先用 `npx openspec list` 找到对应 change。

增量流程：需求 → proposal/specs/design/tasks → 确认 → 实现/测试 → 验收 → archive。新增或改变行为先更新规范；纯排版、错字等不改变行为的文档修正无需新建变更，问答和审查默认只读。已确认范围内正常实现和内部类型调整不重复请求确认，越界或高风险操作遵循 AGENTS。AGENTS 只保留长期规则；阶段决策、授权与完成状态记录在对应 OpenSpec 变更和验收记录中。

change 范围内任务完成、验收证据齐全后，自行同步增量规范到 `openspec/specs`，再归档并修复相关文档链接，无需再次请求确认。归档前核对 artifacts、任务、验收记录与规范差异；CLI 的 artifacts 完整不代表任务已验收。使用 `npx openspec archive <change-id> --yes` 执行正常同步与归档，不用跳过校验或跳过规范同步来掩盖未完成项。归档后运行 `npm run spec:check`、检查引用及差异，再按本地提交约定交付。

变更范围内仍有真实联调、真机验收或其他任务未完成时，保留活跃并说明原因，不强行归档或擅自移出范围。其他 change 或明确的非目标不阻塞已完成变更的归档，其未验证状态仍需如实记录。

## Git 与自动本地提交

日常直接在 `main` 开发，不强制创建功能分支或 PR；未经用户明确允许，不创建、切换、重命名、合并或删除分支。仍通过 OpenSpec 记录变更与验收，历史标签不移动。

每完成一个可检查的小阶段，先运行相应检查，再明确暂存本任务文件并本地提交。禁止把他人的临时修改、密钥或产物打包提交；失败不伪造“已验收”提交。没有新变化不生成空提交。自动本地提交不代表自动推送、合并或部署。

CI 对 push 和可选 PR 运行 npm ci、check、build 和依赖审计；CI 不配置付费服务凭据，不以创建 PR 作为验收前提。

付费调用遵循 [AGENTS 的费用规则](../AGENTS.md#付费服务使用)：简单估算后可按需做低成本、小规模真实联调；批量、压测或高成本、费用不确定的调用先确认预算和上限。常规回归与 CI 不调用计费外部服务；业务逻辑按需使用真实实现或测试替身，真实联调结果单独记录。

## 验证分级

按改动影响选择检查，交付时写明已执行与未执行项：

| 改动 | 必要验证 |
|---|---|
| 纯文档、注释 | `git diff --check`、引用与内容一致性；涉及 OpenSpec 时运行 `npm run spec:check`，不要求应用构建 |
| 业务代码或测试 | `npm run check`，覆盖本次行为与失败路径 |
| 运行配置、依赖、打包链路 | `npm run check`、`npm run build`，必要时验证启动；依赖变动检查锁文件及审计 |
| 界面、交互 | 在代码检查基础上增加相关尺寸、状态与操作的浏览器回归 |
| 代码阶段交付及 CI | `npm run check`、`npm run build` 完整回归；真实联调和真机验收单列 |

本地文档-only 小阶段按第一档验证即可提交；CI 的完整检查不因此关闭。所有提交仍需审查敏感信息和生成产物；检查失败不能以减少验证范围来规避。

## 命令与端口

命令在当前仓库根目录执行；本机位置是 `D:\vibe_code\oldman`，不是其他环境必须采用的路径。AGENTS、OpenSpec、package.json 和 `.env.local` 均在仓库根目录。脚本使用相对路径，CI 不依赖本机盘符。

- `npm run dev`：前端 3001 + 网关 3002；Ctrl+C 退出。端口占用时检查原进程，不随意杀其他服务。
- `npm run dev:web` / `npm run dev:speech`：诊断时分别启动，不和组合启动器重复运行；后者保留命令名，同时承载语音、文章 AI 与只读议题接口。
- `npm run check`：类型、Lint、测试、规范与边界校验。
- `npm run build`：本地 Vinext 构建，不发布。
- `npm run test:speech:live`：无参数只读本地状态，不产生语音。显式 `-- --pcm 文件.pcm` 且本地允许标记开启时才做最多 30 秒的真实联调；可加 `--expect 非敏感测试句`。按上述费用规则判断是否执行；不自动购买/充值。详见 SPEECH-SETUP。

默认仅绑定回环地址。不把开发服务暴露到局域网/互联网；手机真实麦克风和键盘在后续可信 HTTPS 环境验证。

受控公网测试是独立、已确认的部署流程，不使用开发服务器，也不恢复 GPT Sites/Cloudflare 接入。固定域名、systemd/Nginx 模板、秘密边界、验证和回滚步骤见 [受控公网部署](DEPLOYMENT.md)。部署使用版本化 release 和 3011/3012 回环端口；Nginx 才监听公网 80/443。修改部署配置仍需 `npm run check`、`npm run build`、Nginx/systemd 实机验证和对应 OpenSpec 证据。

本机 `.env.local` 的语音部分记录 AppID 与 `ASR_CREDENTIAL_SOURCE=windows-user`，腾讯云密钥由网关启动时读取 Windows User 环境，不复制进工程。`TENCENT_ASR_TOKEN` 对长期密钥留空；`TENCENT_ASR_ENGINE_MODEL_TYPE` 只允许 `16k_zh`（默认）、`16k_zh_en` 或 `16k_zh_en_2.0`，修改后重启网关即可切换。其他环境使用 `project` 来源。

### 文章 AI 接入配置

用户已选定 DeepSeek V4 Flash。项目根目录已有 `.env.local`，在 `DEEPSEEK_API_KEY=` 后填写自己的 Key 即可；不要发到聊天或写入 Git。接口地址预填 `DEEPSEEK_BASE_URL=https://api.deepseek.com`，模型预填 `DEEPSEEK_MODEL=deepseek-v4-flash`；[DeepSeek 官方文档](https://api-docs.deepseek.com/)说明该模型标识指向最新 Flash 版本。其他环境可从 `.env.example` 获取空白模板，勿覆盖既有语音配置。

现已接通常规优化、润色、统一自然语言会话，以及议题采访的单问题追问和所选素材整理。`npm run dev` 加载 `.env.local`，修改配置后需重启网关。只由服务端读取上述变量，不使用 `NEXT_PUBLIC_` / `VITE_` 前缀，不把凭据、正文、素材或会话写入日志。`GET /api/ai/status` 只报告配置状态，不产生模型调用，也不代表效果验收。

第一次操作会解释向 DeepSeek 发送标题、正文、话题背景、采访回答、相关修改记录以及用户和小文的对话，并要求同意。无配置、超长正文、未确认语音、保存失败时不调用；网络失败不退回 mock。生成进度和候选先回到文章会话，用户主动查看全文预览，应用前核对最新正文；用户关闭/取消尽力中断上游，不自动重试。会话语音只填入输入框，不自动发送给 DeepSeek 或写正文。普通测试不加载模型 Key，也不调用付费服务。

真实联调请用非敏感短文、先估算次数与费用，并记录实际结果；一次“配置正常”或 mock 成功不能代替模型效果。首轮测试见 [文章 AI 验收](ARTICLE-AI-ACCEPTANCE.md)，对话改文的一次真实调用及核心事实漂移反例见 [对话改文验收](CONVERSATIONAL-REWRITE-ACCEPTANCE.md)，同一发送请求的回答/候选联调见 [统一发送验收](AI-UNIFIED-SEND-ACCEPTANCE.md)。Fastify 网关本身不提供用户身份认证，公网测试必须由 Nginx 的 HTTPS 访问保护包裹，应用端口不得直接开放。

### Linux 运行配置

生产网关从 `/etc/suiyue-yousheng/runtime.env` 读取配置，文件必须为 `0600 root:root`。Linux 只允许 `ASR_CREDENTIAL_SOURCE=project`，完整的 `TENCENT_ASR_SECRET_ID` / `TENCENT_ASR_SECRET_KEY`（以及同批 STS 凭据需要的 Token）与 DeepSeek Key 只在服务端环境文件；不得复制 Windows `windows-user` 方式、放入 release、客户端、镜像、命令输出或日志。公网 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh` 以匹配当前体验包；以后确认中英模型额度后可修改变量并仅重启网关。`ASR_ALLOWED_ORIGIN` 必须精确为最终 HTTPS Origin，改域名/协议/端口会创建另一份浏览器数据空间。

开发和构建均保留 Vinext 本地 Node 链路，已删除 GPT Sites 发布配置、专用插件和依赖；不需要 Sites 登录或 Cloudflare 绑定。`local-project.test.ts` 覆盖开发/构建配置及依赖清理，`local-speech-proxy.test.ts` 使用真实 Vite 转发与假上游覆盖 WebSocket 全流程及外部 Origin 拒绝，不调用腾讯云。

## 数据与备份

入口沿用已验收设计：首页右上角“更多” → 管理作品 → 选择作品，可复制、导出 TXT 或移入回收站；“更多” → 回收站 → 选择作品，可恢复。全量备份/恢复也在同一个更多菜单，不再在卡片或首页底部增加按钮。文章 AI 从编辑器原“聊天/优化”进入，共享会话和版本，见架构 ADR-006。

数据库 `suiyue-yousheng` v3：works、recovery、articleSessions。v3 在作品草稿中增加可选议题快照、采访素材和模式字段，v1/v2 以缺省值惰性归一化，不新建 store、不改写原正文。输入异步串行写入；“已保存到本机”只在事务成功后显示。手动保存/返回等待最新写入；多标签冲突拒绝过期修订并保留内存内容供导出。

不设额外常驻保存工具行：保存中复用页头按钮，成功提供读屏状态和手动保存反馈，失败有持续提示与重试/导出。退出前点保存等待成功。操作系统强制终止、断电或浏览器杀进程仍可能丢掉最后尚未提交的输入，不能宣传零丢失。

全量 JSON v4 包括回收站、活动草稿、议题快照、采访素材、会话、版本和每篇作品的 AI 来源披露，格式 `app=suiyue-yousheng`、`schemaVersion=4`，仍接受 v1/v2/v3。v4 的 `disclosures` 必须与已应用 turn 和 `appliedVersionId` 确定性一致，导入后仍由会话来源重新核对，不能伪造或静默丢失。导入上限 10MiB、10,000 篇；损坏、未知版本、不一致段落/素材/版本引用或披露拒绝整批导入。副本分配新作品、段落、素材、版本和 turn ID 并重映射引用。未来升级仍使用版本化事务，不删库重建，发现更高版本数据库时失败并保留原数据。

存储失败时不要刷新，先导出内存备份。复制正文只复制已确认正文；TXT 会另外标出待确认语音和未完成编辑。若会话历史存在已明确应用的完整 AI 候选，复制与 TXT 开头还会加入可见 AI 辅助说明；待确认或未采用候选不触发该说明。

## 必测路径

1. 空列表 → 新建 → 页头标题确认/取消 → 中文输入/换行/粘贴 → 待确认语音修改取消/完成 → 保存 → 刷新/重开。
2. 回收站移除/恢复；JSON 恢复副本；损坏备份不改变原文。
3. 保存失败、多标签冲突、快速输入和保存期间继续输入。
4. 固定底部“热门 / 文章 / 我的”三页导航、话题详情和来源；内容区顶部不重复页签，服务不可用不阻塞作品；“直接写”不插入背景文字；首次采访开场不请求 AI，空采访退出不留空作品，有回答或处理中退出进入文章；旧快照、更新比较与显式采用。
5. 小文普通会话保持不变；采访首问、聊天式单问题追问、换题、关闭暂停与重开恢复；文字/语音回答只存素材；整理、澄清或候选、放弃/应用/撤销；错误/取消保留输入且不改正文。
6. 长按 180ms、短按、授权中松手、取消、后台、断网、迟到结果、5 分钟结束。
7. 360×640、390×844、430×932 与桌面；议题卡、来源链接、背景与采访操作可达，无裁切、无横向溢出。

真机验收记录机型、OS/浏览器版本、HTTPS 地址、权限、键盘遮挡、后台和网络切换。桌面模拟不能替代。

`tests/design-baseline.test.ts` 保护用户已确认的 Echoes 设计 tokens、文章度量、响应式和组件边界，并对照独立预览来源核验；不再冻结旧主题的整体CSS哈希。语义测试不是视觉检查的替代，修改规则须先获得设计变更确认，并对照浏览器结果更新 DESIGN-SYSTEM.md。正式应用不能 import 预览业务源码或模拟键盘。
