# 开发与验收

## 开工顺序

先检查 Git 状态并遵循 AGENTS.md；接手产品实施时读[当前状态](STATUS.md)，涉及产品范围时读[产品边界](PRODUCT.md)，实施变更时读对应 OpenSpec。局部文档或指令维护按需读取，不要求每次加载全部入口。小程序是唯一用户端；网页目录只服务运营后台。历史 H5 资料在[归档](archive/h5/README.md)，不可作为新需求、依赖或验收门槛。

日常在当前仓库 main 工作，不另建副本或擅自操作分支。每个通过检查的小阶段仅提交本任务文件，不自动推送、部署或上传。OpenSpec CLI 使用锁定版本：npx openspec list，按实际变更 ID 读取 proposal/specs/design/tasks，完成且证据齐全后 npx openspec archive <change-id> --yes，同步后再次验证。

项目 OpenSpec CLI 固定为 1.12.0，使用 `npx openspec` 或 npm 脚本调用本地依赖；全局安装独立更新，不决定项目版本。升级时执行 `npm install --save-dev --save-exact @fission-ai/openspec@<目标版本>`，再执行 `npx openspec update` 刷新项目技能。新版技能位于 `.agents/skills/`，包含归档所需的规格同步技能；保留现有工作流选择。核对生成文件差异、通过完整检查与构建后，一起提交依赖声明、锁文件和项目技能。

项目技能含本地协作调整；刷新后核对已有授权是否沿用、错误是否可在范围内修复、资料是否按需读取，以及验收完成是否自动同步归档，避免重新引入强制停等。用户 prompts 中的旧 opsx 入口只路由到当前技能，不维护第二套流程。调整依据与本机备份见[指令审计](ASTRA-INSTRUCTION-AUDIT.md)。

## 命令与端口

使用 .nvmrc 的 Node 24.14.1，在仓库根目录 npm ci。导入 apps/miniprogram 到微信开发者工具；本机身份与私有配置规则见[小程序工程说明](../apps/miniprogram/README.md)，私有配置与秘密不进 Git。

| 命令 | 当前职责 |
| --- | --- |
| npm run dev | 运营后台 3001 + 服务网关 3002 |
| npm run dev:admin | 独立运营后台，访问 http://localhost:3001/admin/topics |
| npm run dev:server | 独立网关，微信/AI/语音/话题/运营 API |
| npm run check | 类型、Lint、活跃测试、严格 OpenSpec、文档引用、敏感与依赖边界 |
| npm run docs:check | 维护文档链接、归档 Markdown 引用与正式规格 Purpose；不联网或校验历史截图存在性 |
| npm run build | 共享核心、运营后台、小程序；不发布 |
| npm run build:admin | 运营后台构建，不包含退役 H5 |
| npm run test:server-admin | 后端、共享契约与运营 UI 测试 |

保留 npm run test:speech:live、test:topic-ai:live 和 scripts/dialogue-live-check.ts 的独立显式联调，不在普通回归自动调用。付费规模及权限按 AGENTS；无权限、凭据或真机证据不宣称通过。管理后台密码只用 npm run admin:hash-password 的交互输入生成散列。

## 验证分级

纯文档：差异、链接、内容及相关 OpenSpec。代码：npm run check；运行、打包或阶段交付再执行 npm run build。小程序 UI 补开发者工具和对应真机，运营 UI 补浏览器回归；不再要求 H5 四尺寸或双端功能对齐。归档 H5 测试不计当前通过数量，核心/网关测试不能随 H5 一起丢弃。

指令或技能文档调整补结构、引用和实际决策场景审查，不因此运行应用全套测试。相关检查通过后进入交付；重复或扩大验证需要新改动、失败或未解决疑点，不能以未运行的实测填补证据。

新架构必须通过退役依赖边界：活跃源码不能引用 archive/h5、旧 lib、H5 features 或预览。归档与 `.tmp`、`outputs`、`work`、`test-results` 等临时输出不参与 TypeScript、Lint 或测试发现；正式验收脚本保留检查，归档不参与发布输入；现有 CI 仍执行完整 check/build 与依赖审计。

## 数据与配置

小程序本地先落盘，再以持久操作自动同步；聚合 v3、备份 v6，旧 v1–v5 可导入副本。auth.sqlite schema 3 包含账号、私有作品、唯一用户名归属与独立发表数据，topics/usage 仍为 schema 1。操作系统中断可能丢失未提交输入，不承诺零丢失。不将用户 JSON、正文、头像、封面或音频放入 Git。发表侧车文件与正文聚合分开保存，JSON v6 不含封面。新数据库不得回填旧备份；旧 release 的 auth 上限低于 3 时回滚检查必须拒绝，备份、恢复入口继续执行 schema 兼容检查。

`tests/cloud-sync-integration.test.ts` 使用两个隔离磁盘目录、真实回环 HTTP 网关与 SQLite，微信换码使用替身，覆盖接管、完整快照、确认丢失/重启和删除，不调用付费服务。`CLOUD_WORK_MAX_BYTES`（默认 8MiB、硬上限 8MiB）、`CLOUD_ACCOUNT_MAX_BYTES`（100MiB）、`CLOUD_ACCOUNT_MAX_WORKS`（1000，含回收站）、`CLOUD_ACCOUNT_REQUESTS_PER_MINUTE`（120）由服务端配置，非法配置拒绝启动。

服务配置仍在忽略的 .env.local；服务器秘密位于 /etc/suiyue-yousheng/runtime.env。正文/语音/身份失败均不回退假数据。[语音配置](SPEECH-SETUP.md)、[部署](DEPLOYMENT.md)、[隐私](PRIVACY.md)保留有效服务边界。旧 localhost 数据不迁移、不清除，已归档浏览器操作不再是开发入口。

## 小程序本地验收入口

共享接口变化后执行 `npm run devtool:build-npm --workspace @suiyue/miniprogram`，刷新实际 npm 运行包并验证导出；命令只清代码编译缓存，不清作品、文件或身份。然后执行普通编译。开发者工具若显示首页白屏且自动化超时，先查原生编译和模拟器启动日志；排除编译错误后可重新启动 IDE 复核，不能将单纯构建成功当运行成功。

若磁盘 npm 导出校验已通过，而实际页面加载的 npm 仍缺少新导出，关闭项目可能不足以释放全局运行缓存。确认没有其他正在编辑的项目后退出整个 IDE，等待旧自动化端口释放，再从同一项目路径冷启动；不以反复构建或清除用户数据代替运行时核对。

独立自动化入口 `node apps/miniprogram/scripts/qa-dialogue-simulator.mjs`：通过 CLI `auto --project <小程序绝对路径> --auto-port 9420 --port <当前IDE端口>` 启用，等待编译后连接。`MINI_AUTOMATOR_PATH` 指向本机独立安装的 miniprogram-automator，`MINI_QA_OUTPUT` 指向非提交截图目录。开始前停首页或登录页、无用户编辑；运行期间不要修改小程序源码（热编译会重置替身），结束恢复原服务并停在登录页。测试使用每次独立 qa-dialogue 目录、模拟网络响应，不上传、不调用付费模型。脚本输出实际窗口尺寸；360×640、390×844、430×932分别设置真实模拟器机型，不用 mock 系统信息冒充尺寸验收。

上述模拟器脚本默认包含两页长按语音回归；设置 `MINI_QA_DICTATION_ONLY=1` 可只运行语音定点检查。真实前端语音状态机接设备/权限/Socket替身，覆盖录音布局、短按、取消、转写后发送以及正文待确认内容隔离，不申请真实麦克风权限或使用 ASR。DevTools 的 `tap()` 返回不等于页面事件已执行，断言和下一步松手前须等待事件落地；不能把测试触摸延迟当成产品自动发送。

设置 `MINI_QA_UNWRITTEN_ONLY=1` 可只验证空稿保存边界：无输入/无转写退出、访谈同ID往返及前台恢复、首句未发送输入与正文保存、文章列表计数和空态。与语音定点模式分开运行；账号、同步、发表状态和录音均为替身，文件仓储与页面真实执行，禁止真实账号请求。

账号与登录界面运行 `node apps/miniprogram/scripts/qa-account-simulator.mjs`，使用相同的自动化环境变量；另设 `MINI_QA_EXPECTED_WIDTH=360`（或 390、430）断言实际机型，避免同名开发者工具窗口导致尺寸误记。允许从无真实账号的首页或登录页开始，使用独立磁盘目录及账号/同步替身，禁止真实换码和账号网络请求。覆盖登录失败与重试、个人中心、退出确认、资料组件、未登录直接路径拦截、隐私入口及登录后草稿恢复。页面栈更新早于原生转场完成，连续跳转前等待动画稳定。切换机型后连接失效时退出当前项目，再通过同一个 `auto` 入口启动；不并用两个自动化入口重复打开项目。

设置 `MINI_QA_EDITOR_ONLY=1` 可聚焦编辑恢复，跳过既有登录/资料布局检查：使用相同隔离账号夹具，验证语音/文字空白稿跨页返回、保存失败重试、未发送输入恢复、暂停编辑及读取错误的重新打开。不与另一套自动化入口同时连接；启动编译完成并停在登录页后再运行，连接超时不计通过。

文章发表界面入口 `node apps/miniprogram/scripts/qa-publication-simulator.mjs` 使用相同自动化变量，额外指定 `MINI_QA_COVER` 为非敏感合成图片。验证单次构图与两种只读效果、图片实际加载及设置回显、改名预览、投稿状态、我的文章、公开阅读、分享参数和失效提示；账号/网络/原生选图为替身，文件和组件真实执行，结果不能代替手机选图与好友实际收发。

设置 `MINI_QA_LIST_ONLY=1` 可只验证文章列表反馈：真实 MiniPublicationClient 连接隔离网络响应，检查成功空列表、未部署接口 404、断网、重试后有文章、按钮边距/触控尺寸和写文章入口。保留 `MINI_QA_EXPECTED_WIDTH` 断言，机型切换后先等实际编译与登录页恢复；不使用模拟系统宽度充当三尺寸证据。

设置 `MINI_QA_JOURNEY=1` 在完整发表回归后追加 `qa-client-journey.mjs`：检查固定投稿重入、个人中心的一篇最近草稿及两条摘要、独立文章管理的搜索/筛选/20篇分页、设置/数据工具/回收站、返回路径、全屏裁切取消、可选预览、资料改名、长内容及原编辑工具栏。逐个验证实际按钮宽高、行宽、边界与底栏遮挡，并保存各页截图。主流程另验证不预览直接投稿、改稿改名后直接提交当前内容。键盘高度、账号网络和长内容来自隔离夹具，不计为手机软键盘或真实网络验收；不与 `MINI_QA_LIST_ONLY` 同时使用。

当前脚本使用原生弹窗回调替身验证删除及恢复，只允许本次创建的 `qa-delete-` 作品，生命周期网络替身通过真实微信文件仓储移入回收站并恢复，禁止永久删除和其他作品 ID。原生弹窗实际点击需单独记录，前轮原生确认的历史证据不记成本轮实测，也不能据此宣称已经删除真实在线作品。切换模拟器机型后关闭当前项目再用 CLI auto 打开，等编译完成后连接，避免沿用失效自动化会话；不清理用户文件或身份缓存。

后台发表联调先设 `SUIYUE_PUBLICATION_QA_OUTPUT` 为独立忽略目录，运行 `npx tsx scripts/publication-qa-server.ts`（回环 3812、临时库）。另以 `GATEWAY_PROXY_TARGET=http://127.0.0.1:3812` 运行 `npx vinext dev --port 3811`；设本机 `PLAYWRIGHT_PATH` 后运行 `node scripts/qa-publication-admin.mjs`。测试会审核并下架合成稿，每次重跑先重启夹具生成新临时库，不连接真实账号库。自动化退出后停止本次本地测试进程，截图/数据库保留于忽略目录。详细结果见[发表验收](ARTICLE-PUBLICATION-ACCEPTANCE.md)。

`scripts/dialogue-live-check.ts` 是显式真实模型入口：默认3次问候/素材/整理，`--pending-edit` 最多3次改文/反问/撤回，`--cancel-edit` 为单次撤回定点复验。先估算费用，每次最多30000输入估算tokens/2048输出tokens，失败即停、不自动重试；不纳入 CI。本地费用单价未配置不代表免费。
