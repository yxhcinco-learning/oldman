# 后端与运营后台部署

## 当前线上测试：删除同步修复 0.3.2（2026-09-08）

按既有测试更新授权，从固定提交 `f3c79435e8b539cd9d047d0074f0c5719928537c` 上传小程序 **0.3.2**，官方 CLI 成功，总包 **816466 字节**。修复永久删除记录的重复明细读取、删除后的冗余完整同步及回收站无关发表查询。另从同一固定源成功生成手机预览二维码，预览包 **809935 字节**，用于本轮用户扫码复测；不代表已收到修复后的真机确认。

服务端、共享核心、部署、依赖和后台输入与线上 c8f19f1 一致，无需重新部署。gateway/web 继续为 **approved-demo-c8f19f1**；没有改动限流、重启服务或清理历史数据。完整 check **463 项**、build、npm 刷新、实际 430×932 删除/回收站/个人中心 **10 项**通过，真实 HTTP 和 SQLite 及请求数对照的证据边界见[删除修复验收](ARTICLE-PUBLICATION-ACCEPTANCE.md#删除操作与永久删除标记修复2026-09-08)。

发布输入 211 个源文件从 Git 提取并核对，210 个未改源文件通过固定源检查；配置仅替换正式 AppID、项目标识/描述、开启合法域名检查。固定源类型检查与开发者工具 npm、核心导出、140 个上传文件安全边界通过；仅清除隔离目录内生成的一个 source map。源归档 SHA-256 `885ea6f560bc7c6d0e23131f94914d766d2c2265d4b158fa4b292346bbf49eb4`，上传清单 SHA-256 `d3df79300069104f791c3788dd11d74fe65ba6077f7f34169bc4e9848157d09a`。

证据为 `.tmp/recycle-rate-diagnostic/server-source-comparison.json`、`mini-release-build.log`、`preview.log`、`preview-info.json`、`preview-0.3.2.png`；固定源、清单及上传回执在 `.tmp/cloud-refresh-fix/releases/f3c7943-0.3.2/`。完成后关闭隔离工程并打开原工作区。公众平台“设为体验版”仍受既有浏览器安全策略限制，本轮未执行该设置；最后明确确认的体验版仍为 0.2.0 / a713cff，当前通过新预览码提供复测。未提审、正式发布或推送 Git，原尺寸及发表真机待办保留。

## 我的文章刷新修复 0.3.1 记录（2026-09-08）

沿用用户“完成后自动更新到线上测试”的授权，从固定提交 `284191df990f53aa046da075166a7e0c21443a39` 上传小程序 **0.3.1**。官方 CLI 上传成功，总包 **816139 字节**，描述包含提交号及重复刷新/断网重试修复。公众平台仍被浏览器安全策略阻止访问，已请求用户手动将 0.3.1 设为体验版，尚无完成确认；不将上传成功记为体验版已生效。最后明确确认的体验版仍为 0.2.0 / a713cff，未提审、正式发布或推送 Git。

本次只修改客户端。固定提交的服务端、共享核心、部署、依赖及后台构建输入与已上线 c8f19f1 逐文件一致，网关与网页继续运行 **approved-demo-c8f19f1**。只读核对服务健康、auth=3、topics=1、usage=1 及数据库完整性；未重启服务、修改 Nginx、迁移数据库或清理历史作品。成功请求记录只能支持短时重复查询接近限流，不能证明截图当次为 429；客户端反馈循环有独立复现和修复回归。

完整 check **449 项通过**，build 与工作区开发者工具 npm 刷新通过；实际 430×932 定点界面 **8 项通过**，额外长流程自动化中断和原有尺寸/真机待办分别保留，详见[刷新修复验收](ARTICLE-PUBLICATION-ACCEPTANCE.md#我的文章重复刷新修复2026-09-08)。

固定源取自 Git，210 个源文件核对通过，项目配置仅替换正式 AppID、项目标识/描述并开启合法域名检查。固定源类型检查及真实开发者工具 npm 构建通过；仅移除隔离生成目录中的一个 `.js.map`，209 个未改源文件、核心导出和 140 个上传文件边界验证通过。源归档 SHA-256 `3c4b86d7c837711c1bf7349abe7feb6f8d5816f03fbb2908d0be1c3b2223b6d2`，上传清单 SHA-256 `3a556da1755492674ea8f8a7265770ce34ee1372ac470a21d72dcc8ddb82922a`。首次 Windows PowerShell 5 包装将 CLI 正常 stderr 误判为错误，改用 PowerShell 7 后完成验证，没有修改固定应用源或跳过检查。

证据位于 `.tmp/cloud-refresh-fix/`：`server-source-comparison.json`、`check.log`、`build.log`、`npm.log` 和 `author-430/`；固定包与上传回执位于 `releases/284191d-0.3.1/` 的 `prepared.json`、`upload-verification.json`、`upload-manifest.json`、`upload.log`、`upload-result.json`。上传后关闭隔离上传工程，重新打开原工作区，未清理用户身份或文件。服务器回滚边界仍按下文方案 05 记录执行，不用旧数据库覆盖新增数据。

## 方案 05 与审核后台更新记录（2026-09-08）

用户明确要求“可以，实现吧，完成后自动更新到线上测试”。据此从固定提交 `c8f19f1cd7482c3e12ca31d2c1f385a3f7064670` 更新本项目的网关、运营网页，并上传小程序 0.3.0 开发版本；不提审、不正式发布、不推送 Git。完整技术检查与尚缺的尺寸/手机证据见[发表验收](ARTICLE-PUBLICATION-ACCEPTANCE.md#已确认方案-05-实施2026-09-08)，测试更新不代表全部验收或归档。

| 对象 | 实际状态 |
| --- | --- |
| 网关及运营网页 | 均为 **approved-demo-c8f19f1**，两项 unit 的 WorkingDirectory 指向 `/opt/suiyue-yousheng/releases/approved-demo-c8f19f1`；已包含文章审核入口及公共列表已审摘要 |
| 数据库 | auth=3、topics=1、usage=1，三库 quick_check 及原 inode 核对通过；没有迁移、还原或用旧库覆盖新数据 |
| 配置及其他服务 | Nginx 与 runtime.env 摘要保持，八项健康配置通过；只切换本项目 gateway/web，未修改其他项目、域名、权限或外部服务 |
| 小程序上传 | **0.3.0 / c8f19f1**，官方 CLI 上传成功，实际总包 **813907 字节**；合法域名检查开启，正式 AppID 与本机私有配置一致 |
| 体验版设定 | 本轮公众平台入口被浏览器安全策略阻止，已请求用户将 0.3.0 手动设为体验版，尚无完成确认；最后确认的体验版仍为 0.2.0 / a713cff |
| 线上后台登录 | 刷新真实 Chrome 后，重启前的管理员会话已失效，返回登录表单；未重新输入管理员凭据或在线审核文章，成功登录后的业务验证来自本地隔离联调 |

服务器包从固定 Git 提交提取 83 个源文件，SHA-256 `b5a2594300182c2cc318308792c88c03ee13e5e163797890cc549d1ccec64c0e`。SFTP 上传后 TAT 核对全部输入哈希、归档成员和路径，使用 suiyue 账户解包、安装锁定依赖并构建 core/admin。上线前在新 release 的独立数据库及回环 3022 完成真实 HTTP/SQLite/sharp **24 项**检查，两个隔离客户端覆盖封面、固定投稿重试、人工审核、正文摘要、处理图片和删除撤销；3021 网页冒烟及 8 个静态资源通过。测试进程完成后退出，不调用付费模型、ASR 或真实微信换码。

切换前和实际切换时使用 SQLite backup API 保存三库一致性备份，并保存两项旧 unit、current/previous、配置摘要及源文件清单。目录 `/var/lib/suiyue-yousheng/backups/approved-demo-c8f19f1` 为 0700，备份文件为 0600。切换后 83 源文件摘要、15 个公网路径/方法、八项配置健康及三库身份核对通过。没有需要更新的 Nginx 差异，未替换或重载它。

固定小程序源在忽略目录 `.tmp/approved-demo-deploy/c8f19f1/mini/`，207 个未修改源文件逐一核对 Git；项目配置仅替换正式身份、描述及域名检查。固定源 TypeScript 与实际开发者工具 npm 构建、核心导出验证通过；去除构建自动生成的 `index.js.map` 后，140 个上传源文件的类型/敏感标记检查通过，清单 SHA-256 `f8b9559abbf6033fc6c6ade16a3b5f8e2f2116f74812caa391a35ec68c9614e5`。清单源大小不等于微信最终编译包大小，以 CLI 的 813907 字节为准。上传成功后关闭隔离上传工程，重新打开原工作区，不清理用户文件或身份。

本机证据目录 `.tmp/approved-demo-deploy/c8f19f1/` 含 `prepared.json`、三个上传回执、`server-deployment-result.json`、`SERVER-RESULT.md`、`mini-typecheck.log`、`devtool-npm.log`、`upload-verification.json`、`upload-manifest.json`、`upload.log` 与 `upload-result.json`。同目录 `admin-after/` 保存实际公网匿名后台 1280×900、1440×900、390×844 三尺寸报告和截图，无页面异常及横向溢出；不计为登录后的在线审核验证。浏览器策略禁止访问公众平台，未通过其他浏览器、原始协议或低层接口绕过；上传开发版本与设定体验版分别记录。

**回滚只切代码**：旧网关为兼容 schema 3 的 `phase3-208b557-gateway`，旧网页为 `web-a713cff`，各自 unit 已备份；current 指向新 release，previous 指向旧网页。故障时恢复对应旧 unit/链接并核对健康，禁止用旧数据库回灌或运行 schema 1/2 网关。部署成功，没有实际执行在线故障回滚演练。

## 文章发表测试网关首次更新历史（2026-09-07）

用户手机预览文章页出现“这篇文章暂时无法查看”，实测新列表接口返回 Nginx HTML 404，而原账号接口正常。用户明确追加授权“服务端没有更新线上测试？如果是的话更新”后，只更新测试网关及配套 Nginx、账号库；运营网页和小程序包保持原版本。

| 对象 | 当前实际状态 |
| --- | --- |
| 网关 | **phase3-208b557-gateway**，固定源码提交 `208b557`；unit 的 WorkingDirectory 指向 `/opt/suiyue-yousheng/releases/phase3-208b557-gateway` |
| 数据 | auth=3、topics=1、usage=1；三库 quick_check 通过、inode 保持；迁移前后 users、wechat_identities、cloud_works 的全部行摘要一致，未覆盖用户或作品 |
| 发表数据 | 切换后只读核对：已发表 0、待审核 0。未向在线库写入测试文章或测试账号，所有新投稿必须人工审核 |
| Nginx | 活动配置逐字等同固定源码，候选和切换后 `nginx -t` 均通过；启用发表/公共文章精确路由、处理图片和 8MiB 封面请求限制 |
| 运营网页 | 仍为 **web-a713cff**；unit 摘要、PID 和 current 均保持，本轮未上线新的“文章审核”页面入口；审核 API 已可用 |
| 小程序 | 体验版仍为 **0.2.0 / a713cff**，本轮未上传、提审或正式发布；文章页样式修复需从当前工作区重新编译预览 |

发布包从 `git archive 208b557` 提取网关、共享核心和部署文件，196213 字节，SHA-256 `fd59e3a59166832709a51d051b127f307072efa6bd4e5a9410e82a7a832608c3`。上传后检查哈希、路径和文件类型，使用 suiyue 用户在新 release 安装锁定依赖并构建 core；服务器 Node 24.18.0。上线后逐项校验 67 个源文件摘要一致。沿用该固定代码提交前完整 check 394 项和本地 build 的验收，工作区后续界面修复没有混入服务端包。

先用 auth 一致性副本执行 schema 2→3 迁移并核对私有行摘要；实际验证旧网关 schema 上限拒绝新库。副本以两个隔离测试账号、真实 SQLite/sharp 和 Fastify inject 验证固定投稿重试、未审核不可读、管理员会话/Origin/CSRF 通过后阅读、1000px 处理图片，以及私有删除同步撤销公开正文和图片。微信换码使用替身，不冒充真实微信登录；AI、语音及其他计费调用为 0。

切换时仅停止网关，使用 SQLite backup API 备份三库，保存原 unit、Nginx 和受限运行配置，再以服务用户迁移实际 auth 库、启动网关、检查健康并重载 Nginx。备份及部署证据位于 `/var/lib/suiyue-yousheng/backups/phase3-208b557-gateway`，目录 0700、文件 0600，含 `preflight.json`、`before.json`、`activation-result.json` 和副本联调日志；不把凭据或数据库放入仓库。部署脚本 SHA-256 为 `e308a6e266d1ba670cea8b62c0c5d3cd3f301814aa0d33c1be2f172f17f13186`，本机上传回执位于忽略目录 `.tmp/phase3-208b557-gateway/`。

公网 19 个路径/方法检查通过：新文章列表/详情/图片、发表和审核 API 未登录均返回 401；小程序接口为 JSON、no-store、没有 Basic Auth 挑战；未知路径 404，空登录 400，热门 200，根网页原有 Basic Auth 401 保持。另用声明 8MiB+1 的请求头实际验证封面上传返回 413，没有传输真实图片。网关八项配置健康为 true；gateway、web、nginx 均 active。本轮没有真实微信换码、手机投稿或在线管理员通过文章，这些证据继续单列待验。

**schema 3 回滚边界**：原 `phase2-7cffd9d-gateway` 及更旧网关不能读取新库，禁止直接切回或用旧备份覆盖新增数据。失败时保留当前三库并前向修复，或使用明确兼容 schema 3 的网关。运营网页继续独立回滚；不能运行同时切换网页/网关的整体脚本代替。本次切换成功，没有执行在线故障回滚演练，没有 Git 推送。

## a713cff 体验环境与网页补齐历史（2026-09-07）

用户确认已将小程序 **0.2.0** 手动设为体验版，并追加授权“如果有需要更新，也要更新”。据此将运营网页补齐到同一固定提交 `a713cff34b0710b9cce805d0e0d0714ef5157dec`；未包含另一个会话的文章发表开发。体验版设定依据为用户确认，不记作代理操作微信公众平台成功；未提审或正式发布小程序。

| 对象 | 当前实际状态 |
| --- | --- |
| 小程序 | 0.2.0，a713cff，704343 字节；开发者工具上传成功、用户确认已设为体验版 |
| 运营网页 | **web-a713cff**，目录 `/opt/suiyue-yousheng/releases/web-a713cff`；网页 unit 固定指向此目录，current 同步指向该目录，previous 指向旧网页 `483d8f4` |
| 网关 | 继续运行 `phase2-7cffd9d-gateway`，业务源码、核心与部署模板已核对与 a713cff 相同；本轮 PID、unit 和运行配置摘要保持不变，没有重启网关 |
| Nginx 与数据 | Nginx 配置保持且 `nginx -t` 通过；三库仍为 auth=2、topics=1、usage=1，`quick_check` 通过、inode 保持，没有迁移或还原数据库 |
| 网页入口 | `https://suiyue.maicong.chat/admin/topics` 返回新版后台；网页服务根路径转到 `/admin/topics`，原 H5 写作入口退出当前网页。公网根路径原有 Basic Auth 保持，直接使用后台 URL 可进入应用登录页 |
| Git 与其他服务 | 仅本地记录提交，没有 Git 推送；未修改其他项目、域名、权限或配置，不新增云服务 |

网页发布包由 `git archive a713cff` 选择对应源码生成，共 56 个成员、42 个文件、141418 字节；SHA-256 `2d80e1548ef8417a36671e7b3cac536831e34e730006b69f30ef712d0c148709`。SFTP 上传后经 TAT 校验哈希和成员，拒绝路径穿越、链接和私有文件，以 suiyue 用户解包、安装锁定依赖、构建 core/admin。切换前后均逐文件校验与发布源一致。没有将工作区、旧 H5、秘密或用户数据打包。

首次服务器安装因无登录用户的 npm 默认缓存落到 `/nonexistent` 而失败，未影响在线服务。为本次构建指定 release 内 npm 缓存后重新安装和构建通过，未切换为 root 安装、修改固定源码或升级依赖。原失败保留在受限备份目录 `build-first-failure.log/json`；正式构建记录在新 release 的 `build.log` 和 `build-result.json`。本轮沿用上传前同一固定源码已通过的完整 check（362 项测试）和本地 build，新增 Linux core/admin 构建及运行验证。

先在临时回环端口 3021 进行上线前检查：根路径跳转、后台 HTML 和 8 个静态资源通过，检查进程随后停止；再只替换网页 unit 与 current/previous 链接、重启 suiyue-web。公网后台 200，后台会话/话题/监控无认证 401，小程序账号/作品无认证 401，热门 200；网关八项健康配置为 true。实际浏览器验证新版标题、登录表单、错误凭据拒绝，1280×900、1440×900、390×844 均无遮挡，390px 实测无横向溢出，未见浏览器 error 日志。未使用真实管理员密码登录或改动运营内容，成功登录后的功能沿用既有自动化证据，不冒充本轮真实账号验收；未调用计费模型、语音或真实微信换码。

回滚与证据目录为 `/var/lib/suiyue-yousheng/backups/web-a713cff`：目录 0700、三库在线一致性备份及原网页 unit 为 0600，保留 `before.json`、`source-manifest.json`、`smoke-result.json`、`activation-result.json`、`final-source-check.json` 和部署脚本。当前部署脚本 SHA-256 为 `8964366fa8f3407536662a37868bd1eeb718640cb3f6a940b84cc44d166572d0`；首次版本与缓存修正版的上传回执保留在本机 `.tmp/web-a713cff-20260907/`。日志扫描仅记录是否命中敏感标记，不回显原始可疑内容。

**网页单独回滚**：核对该备份的 before 状态后，恢复其中的网页 unit、current/previous 链接，daemon-reload 并只重启 suiyue-web；旧网页 `483d8f4` 保留。新目录为网页专用发布输入，不运行会同时重启网关的整体 activate/rollback 脚本。部署脚本在切换失败时自动执行上述网页回退，绝不恢复数据库；此次未触发切换失败或实际回滚，不能记录为回滚演练通过。

## a713cff 小程序体验版准备与上传（2026-09-07）

用户明确要求以 `a713cff34b0710b9cce805d0e0d0714ef5157dec` 为准，核对线上所需改动并发布体验版；另一个会话的文章发表开发不属于此次包。以下是该固定提交的交付记录，不代表后续工作区版本已经发布。

| 对象 | 本次核对或执行结果 |
| --- | --- |
| 网关 | 实际运行 `phase2-7cffd9d-gateway`。线上 27 个 server 文件、12 个共享核心源文件及 14 个部署文件的分组 SHA-256 与 a713cff 完全相同，生产 dependencies 相同；仅 OpenSpec 开发依赖升级不需要服务端部署 |
| Nginx 与数据库 | 活动 Nginx 文件 SHA-256 与该提交模板相同，`nginx -t` 通过；auth=2、topics=1、usage=1，三库只读 `quick_check` 均为 ok；健康接口八项配置均为 true |
| 公网 | 热门 200；账号 me/session/renew/avatar、作品列表/mutations 未认证均 401，空登录请求 400，未列出接口 404；没有 Basic Auth 挑战，未执行真实微信换码、AI 或 ASR |
| 运营网页 | 上传时 current 为 `483d8f4`，发现 H5 入口退役、后台页面壳与类型引用差异；随后用户授权补齐，已部署 web-a713cff，见本页当前环境记录 |
| Git 远端 | 只读查询远端 main 为 `238f7374edf3e88558ad70546eb54f7097071f2e`，尚未包含 a713cff；小程序上传不依赖 Git 推送，本轮没有推送 |
| 小程序上传 | 官方开发者工具 CLI 上传 **0.2.0** 成功，总包 **704343 字节**；描述标明 a713cff、微信登录/私有作品/跨设备续写/保存修复及不含文章发表。使用本机已配置的正式 AppID，AppSecret 未进入包 |
| 体验版状态 | 上传后微信公众平台版本管理被浏览器安全策略阻止访问；**用户随后明确确认已手动设为体验版**。分别记录 CLI 上传成功与用户设置确认，未提审或正式发布 |

上传源从固定提交提取为本机忽略的发布输入 `.tmp/experience-a713cff-20260907/`，未切分支、重置工作区或带入后续修改。156 个选定源文件逐一核对；包内 96 个小程序源文件与提交一致，另含该版本核心生成包。发布项目配置仅替换正式 AppID、项目标识/描述并开启合法域名检查；排除生成 source map，按允许的文件类型及敏感标记检查。原始 source.tar 的 SHA-256 为 `3925bdd3de6b6e3b2aa0589407dfbe9a7c6bef3093588e0ffd0447b486fdccf7`，上传前清单 SHA-256 为 `1917d3f13bbb0a7ef5df7fa7619cc384f0db612c0c3fcf8d23d850e2bf4946f8`。

完整 `npm run check` 重跑通过 **362 项测试**、19 项规格、文档和边界检查；`npm run build`、固定源的小程序类型检查、开发者工具 npm 构建与共享导出验证通过。初次 check 的匿名事件限流测试预期 429 实得 204；测试使用真实时钟按整分钟分桶，运行跨分钟边界，未修改固定版本代码，重跑完整检查通过，原失败日志保留，不计通过。本轮未重新执行模拟器或真机功能验收，沿用该代码已有的三尺寸与用户 4.4 确认证据；用户设为体验版的确认不等于新增手机安装和全流程测试证据。

本机证据：上述目录中的 `source-verification.json`、`upload-verification.json`、`upload-manifest.json`、`check.log`（首次失败）、`check-retry.log`、`build.log`、`devtool-npm.log`、`upload.log` 和 `upload-result.json`。未修改线上服务或数据库，未产生付费模型/语音请求；凭据、上传输入和生成文件不提交。

## 第二阶段网关首次部署记录（2026-09-07，仅供追溯）

- 用户手机预览提示无法连接云端，实测账号与作品接口返回 404。用户追加授权后，网关已更新为 **`phase2-7cffd9d-gateway`**（源码提交 `7cffd9d`），目录 `/opt/suiyue-yousheng/releases/phase2-7cffd9d-gateway`，网关 unit 固定指向此目录。
- Nginx 已启用本版本的账号/作品精确白名单，`nginx -t` 和公网拒绝路径通过；资料 2KiB、头像 2MiB、作品请求 9MiB 超限均实测 413。账号/作品未登录返回 JSON 401，空登录请求 400，热门 200，未列出接口 404。
- auth.sqlite 已由 schema 1 事务升级到 **2**，topics/usage 仍为 1；三库完整性与原 inode 保持。切换前 SQLite backup API 备份、原网关 unit、Nginx 和运行配置位于 `/var/lib/suiyue-yousheng/backups/phase2-7cffd9d-gateway`（目录 root-only 0700，文件 0600）。
- 运营网页仍为 `483d8f4`，`current`、网页 unit/PID 保持；未更改其他项目。开发者工具和手机继续预览现有小程序包，本次没有上传、提审或正式发布小程序，也没有 Git 推送。
- **不能直接退回上一网关 `7cb0521-gateway`**：其 schema 1 上限已被实际兼容检查拒绝。若新网关失败，保留当前三库并前向修复，或使用确认兼容 schema 2 的后续网关；不得回灌旧备份覆盖新作品。此次采用固定网关目录，不运行会切换运营网页的整体 rollback 脚本。
- 新进程配置健康、数据库副本迁移/云作品/幂等/头像/删除冒烟、公网检查和日志敏感标记检查通过，付费调用为 0。实际微信登录及双手机接管仍需真机结果，见[第二阶段验收](PHASE-TWO-ACCEPTANCE.md)。

## 上一网关运行记录（2026-09-06，仅供追溯）

- **后端网关：`7cb0521-gateway`**，独立目录 `/opt/suiyue-yousheng/releases/7cb0521-gateway`；安装的网关unit固定指向该目录。包含最新共享依赖、改文撤回和短材料成文提示。
- **运营网页：仍为 `483d8f4`**，`current` 未切换，网页unit/PID未变。不能仅查看current就判断网关版本；用 `systemctl show suiyue-gateway -p WorkingDirectory` 核对。
- 本轮只授权网关，未调用整体 `activate-release.sh`、未更新Nginx/网页/小程序包。原unit/运行配置/三库受限备份：`/var/lib/suiyue-yousheng/backups/gateway-7cb0521`。数据schema/inode不变，详见[技术收尾](archive/phase-one/TECHNICAL-CLOSURE-20260906.md)。
- 当时的回滚为恢复原网关 unit；此方法仅适用于当时 schema 1，第二阶段迁移后已不可直接使用。未来明确整体部署时，activate-release 会重新安装统一路径 unit，需先记录两服务各自回滚目标及数据库兼容性。

以下历史整体部署流程和运行记录不覆盖上面的第二阶段分服务版本。

> 2026-09-06 范围更新：小程序是唯一用户端，H5 已在本地源码归档。本文件下述 Basic Auth/H5 验证记录描述既有线上版本，不能作为继续发布 H5 的要求。新构建网页仅为运营后台，根路径转入 /admin/topics；服务端兼容 API 与原鉴权暂保留。本次未部署或停站。后端检查不自动授权网页部署，维护矩阵见 [产品边界](PRODUCT.md)。

本说明只适用于用户另行授权后的少量同事临时体验，不表示正式开放。固定入口为 `https://suiyue.maicong.chat`；测试期用户网页继续使用 Nginx Basic Auth，小程序只绕过明确列出的在线接口并使用自身业务会话，内部话题后台使用独立应用会话。应用仍无用户端可见注册、云端文章或跨设备同步。`build-topic-editorial-backend` 最初仅更新模板；2026-09-06 用户另行授权后，受控环境已激活 `00f8a46` 并补齐话题后台及用量保护配置，真实会话结果与未通过项见[统一会话验收](archive/phase-one/XIAOWEN-CONVERSATION-ACCEPTANCE.md)。

2026-09-06 18:36（Asia/Shanghai）受控测试站点更新至 `483d8f4`，回滚版本为 `fc9cdc0`。仅更新既有站点及共享服务，小程序未上传；发布验证与限制见[统一会话验收](archive/phase-one/XIAOWEN-CONVERSATION-ACCEPTANCE.md#受控测试站点更新2026-09-06-1836)。

## 固定拓扑与文件

2026-09-06 后续正式身份配置：用户明确授权代理代填微信凭据，已按受限临时文件、SFTP 校验、原配置/身份库备份及清理流程完成，仅重启网关，活动代码版本仍为 `483d8f4`。这是下述默认用户手填流程的本次授权例外，不扩大为其他凭据或发布授权。具体证据和剩余事项见[正式 AppID 接入验收](archive/phase-one/FORMAL-APPID-ACCEPTANCE.md)。

- Lighthouse：`lhins-pg6lbxtx`（`ap-guangzhou`），只保留公网 80/443；SSH/TAT 管理边界不由本项目扩大。
- Nginx：TLS、安全头、按 IP 限流；用户网页 `/`、原 `/api/ai/*`、`/api/health`、`/api/speech/status`、原 `/api/speech` 和精确 `/api/operations/events` 保持 Basic Auth。匿名事件位置关闭 access log、保留 Origin 并使用独立 IP 限流；精确 `/api/topics`、安全 ID 形状的 `/api/topics/<id>`、已列出的小程序接口关闭 Basic Auth。`/admin/topics`、`/_next/static/*` 和 `/api/admin/*` 也关闭 Basic Auth，但后台页面由应用登录保护，管理 API 继续校验会话、精确 Origin、CSRF 和 JSON。未列出的 `/api/mini/*` 和其他 API 拒绝。
- systemd：`suiyue-web.service` 与 `suiyue-gateway.service`，专用无登录用户 `suiyue`，异常重启并响应 SIGTERM；网关在 `ProtectSystem=strict` 下只额外写入 `/var/lib/suiyue-yousheng`。
- release：`/opt/suiyue-yousheng/releases/<version>`；`current` 为活动版本，`previous` 为上次成功版本。
- 秘密：`/etc/suiyue-yousheng/runtime.env`，必须 `0600 root:root`；Basic Auth 文件 `/etc/nginx/suiyue-yousheng.htpasswd`，必须 `0640 root:www-data`。两者都不在 Git 或 release。
- release 外数据库：最小微信身份库 `/var/lib/suiyue-yousheng/auth.sqlite`、话题编辑库 `/var/lib/suiyue-yousheng/topics.sqlite` 与匿名付费用量库 `/var/lib/suiyue-yousheng/usage.sqlite`，父目录 `0700 suiyue:suiyue`；迁移前备份和失败迁移隔离副本分别在 root-only 的 `backups/` 与 `failed/`，均不随 release 清理。备份文件名用 `-auth` / `-topics` / `-usage` 区分。

仓库模板位于 `deploy/`。`runtime.env.example` 只有字段形状；严禁填写后提交。Linux 固定 `ASR_CREDENTIAL_SOURCE=project`、`ASR_ALLOWED_ORIGIN=https://suiyue.maicong.chat`，三库路径分别为 `/var/lib/suiyue-yousheng/auth.sqlite`、`topics.sqlite`、`usage.sqlite`；当前显式配置 `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh` 以匹配体验包。付费用量按上海自然日使用文章 AI 1,000,000 token、话题 AI 1,100,000 token、语音 7,200 秒的默认上限；上线前应按实际预算复核，0 表示停用。三项估算单价可留空。微信凭据、`TOPIC_ADMIN_USERNAME`、`TOPIC_ADMIN_PASSWORD_HASH` 和 DeepSeek Key 在仓库模板中保持空白，必须由用户写入 root-only 服务器文件。管理员散列只用 `npm run admin:hash-password` 在交互式终端生成，不把明文放入命令参数。运行账户不读取 Windows User 凭据。

## 发布顺序

1. 确认 Git 状态和固定提交，运行 `npm run check`、`npm run build`、敏感信息扫描与 `git diff --check`。
2. 用 `git archive` 从该提交生成单一压缩包；检查成员不得有绝对路径、`..`、`.git`、`.env.local`、密钥、node_modules、缓存、测试音频或用户数据，记录 SHA-256。
3. 通过专用 SFTP-only 账户上传；在 TAT 的 root 通道验证远端 SHA-256 后，先列成员再解压到新的 `/opt/suiyue-yousheng/releases/<version>`。不得覆盖现有 release。
4. 运行 `bash deploy/server/prepare-host.sh <release>`，建立隔离账户、`0700` 数据/备份/隔离目录和 HTTP/ACME 配置；脚本核对解析路径、所有者和权限。DNS 生效后使用现有 Certbot Nginx 账户为固定域名签发证书。
5. 通过不回显内容的本地脚本把完整 DeepSeek/腾讯云项目凭据和临时 Basic Auth 文件分别上传到 staging；TAT 只移动已知路径、设置 root 所有权与 0600/0640 权限，不在命令参数、输出或历史中出现明文。用户再自行编辑 `/etc/suiyue-yousheng/runtime.env`，填写微信凭据、三库路径、三项每日上限、管理员用户名和 scrypt 散列；可选估算单价必须以当前供应商页面为依据，不确定时留空。不得把值发到聊天或命令行。密码轮换后现有后台会话会自动失效。
6. 运行 `bash deploy/server/activate-release.sh <release>`。脚本先完成锁文件安装和生产构建，再停止网关，对已有账号库、话题库与用量库分别运行 `quick_check`、schema 上限检查和 SQLite 在线备份；随后安装 systemd unit、切换 `current`、重启并检查健康。失败时保留当前数据库；只有上一版本兼容全部当前数据库才回滚代码，否则停止网关等待前向修复。新网关可能已接收作品，禁止自动还原迁移前备份。
7. 运行 `bash deploy/server/enable-https.sh`；脚本要求证书和认证文件存在，将 root-owned 静态认证恢复页安装到 `/var/www/suiyue-yousheng`，并在 `nginx -t` 成功后才 reload。
8. 运行 `bash deploy/server/verify-host.sh`：核对3011/3012只监听回环、用户网页401挑战、公开话题免 Basic、后台页面可加载但未登录管理 API 为401、空登录失败、四个小程序拒绝路径、未列出API、三库完整性和网关重启 inode 持久性，并对最近服务日志做不回显的敏感标记扫描。该脚本不验证有效 Basic Auth 或有效后台密码，也不调用真实微信、DeepSeek、腾讯ASR或麦克风；这些仍从受控外部客户端单独完成。

不在构建阶段加载秘密。不要将密码、环境文件内容、签名 URL 或用户材料放进 TAT 命令；TAT 历史可能保留命令和输出。

## 访问凭据与轮换

测试期只建立有限的 `admin01`、`admin02` 类账号，每个账号使用不同的四位数字口令。明文只保存到本机 Git 忽略、ACL 仅当前 Windows 用户可读写的 `.env.deploy-access`，不得写入聊天、Git、TAT 命令、日志或验收文档；用户从本机读取后通过自己的私密渠道发给同事。四位数字安全性较弱，仅适用于当前少量同事的临时测试，现有 HTTPS、Nginx 按 IP 限流及应用侧限流保持不变。

轮换时在本机为每个有限账号生成互不相同的新四位数字和 htpasswd 文件，按同一 SFTP 流程替换服务器 `/etc/nginx/suiyue-yousheng.htpasswd`，保持 `0640 root:www-data`，再运行 `nginx -t && systemctl reload nginx`。不需要重新构建应用，也不会影响 IndexedDB。

移动浏览器在原生认证框期间切后台，可能把认证当作取消。前端页面路径的 401 因此由 Nginx 内部位置返回最小恢复页：响应仍为 401、保留 `WWW-Authenticate`、设置 `Cache-Control: no-store`，页面回到前台时至多自动重新请求一次，并保留至少 48px 的“重新登录”按钮。恢复页不包含账号密码输入，不读取或保存凭据，也不引入 Cookie 会话、产品账号或数据库；API/WebSocket 未认证仍使用原 401 拒绝响应。

话题后台账号与上述用户网页 Basic Auth 完全独立，只配置一名编辑。登录成功签发 HttpOnly、SameSite、生产 Secure 的随机 Cookie，服务端只保存散列；退出、到期或更换用户名/密码散列会让旧会话失效。后台密码不得复用四位体验口令，也不得写入 `.env.deploy-access`；只保留 scrypt 散列。Nginx 不读取后台凭据，不能用 Basic Auth 成功冒充后台登录。

## 健康、日志与证书

- 回环健康：`curl -fsS http://127.0.0.1:3012/api/health` 和 `curl -fsS http://127.0.0.1:3011/`。网关健康只报告 AI、ASR、微信身份、话题与用量保护是否配置，不能证明上游成功；激活话题后台必须看到 `miniIdentityConfigured`、`topicsConfigured`、`topicAiConfigured`、`topicAdminConfigured`、`costGovernanceConfigured` 均为 true。公网 `/api/health` 仍受 Basic Auth，响应不包含路径、账号、限额或秘密。
- 进程：`systemctl status suiyue-web suiyue-gateway`；只重启这两个 unit，不重启主机或其他项目。
- 安全日志与监控：`journalctl -u suiyue-web -u suiyue-gateway`。单条网关日志仅允许 requestId、action、status、durationMs、tokens、errorCategory；后台“运行监控”的15/60分钟与生命周期运营聚合仍随重启清空，付费用量区则从 `usage.sqlite` 读取匿名日汇总并跨重启保留。该库不保存用户标识、正文、引子、链接、音频或转写。该 Nginx 站点 access log 关闭，小程序 ticket WSS 与匿名事件位置再次显式关闭，error log 使用 `/var/log/nginx/suiyue-yousheng-error.log` 并由现有 Nginx logrotate 处理；journald 使用服务器容量/轮转策略和 unit 级速率限制。检查脚本只报告是否命中禁止标记，不输出可疑原行。
- 证书：现有 `certbot.timer` 自动续期；部署后运行只读续期配置检查，并在不影响其他证书的前提下验证 dry-run 或现有计时器状态。

## 验收与费用

公网依次验证无认证用户网页401仍带认证挑战和无缓存恢复页、有效认证首页、匿名事件无 Basic Auth 时 401/带认证后严格 schema 与限流、内部恢复地址不可直接访问、公开话题不弹 Basic、后台页面可加载但管理数据和运行监控必须登录、错误后台密码/Origin/CSRF/JSON 拒绝、有效后台登录和退出、无效业务 token 的AI/语音票据401、无效 ticket 的WSS 401、未列出API 404、HTTPS/证书/安全头、状态接口、三库重启后 inode/完整性、文字新建保存刷新及JSON备份。有效微信换码只允许一次非敏感体验账号并且输出不得出现 OpenID/code/token。用户端浏览器覆盖 360×640、390×844、430×932 和桌面；后台覆盖1280×900、1440×900和390×844，并检查焦点与横向溢出。

DeepSeek 的常规优化、润色和文字追问各最多一次非敏感短样本；话题候选只允许一次明确开启的 Responses + web search 样本，并记录顶层请求数、搜索调用数、token 和估算费用。不测试精简、扩写、配图。ASR 只有在准备了短的非敏感 PCM 时最多一次真实合成音频；状态成功或 WebSocket Upgrade 不等于真实转写。遇鉴权、余额或网络错误停止重复调用，不自动充值或购买。真实 iOS/安卓麦克风、系统键盘、后台和网络切换必须由持有设备的用户另行记录。

## 数据与回滚

域名、协议和端口是历史 IndexedDB Origin 的一部分；小程序本机文件空间受微信环境、AppID 和设备影响，应用内再按游客及已验证账号隔离。第二阶段上线后，主动登录自动同步完整私有作品与已保存写作输入，跨设备先获取最新快照；历史其他 Origin 的内容仍需 JSON 导入副本。账号库 schema 2 保存微信内部身份、会话哈希、可选资料、处理后的私有头像、作品快照和同步记录，不保存原音。话题库保存运营内容与后台会话，用量库只保存匿名日汇总和活动预留；后台账号不获得私有作品读取权限。七类匿名运营事件仍只形成进程内有界计数。

回滚前记录当前与 previous 的解析路径。正常回滚运行 `bash deploy/server/rollback.sh /opt/suiyue-yousheng/releases/<verified-version>`：先按目标版本清单检查三库完整性与 schema 兼容，再切换 `current`、重启并复查；脚本不恢复、不删除也不覆盖数据。若旧代码无法启动则切回原 release，三库保持原样。部署失败也不得自动回灌备份。灾难恢复必须另行授权，先保留完整当前库并核对新作品与恢复范围。首次部署没有上一版本时保留停止状态、数据库、release、备份、秘密、证书与 DNS，等待修复。

## 账号库部署配套与后续维护

auth.sqlite 第二阶段升级至 schema 2，包含私有作品与资料；文章发表阶段再升至 schema 3，增加唯一用户名及发表域数据。迁移前用 SQLite backup API 备份，三库保持 release 外受限权限。作品大小/账号容量/数量/频率配置见 runtime.env.example。Nginx 精确放行账号端点与有界作品 ID，作品 mutations 上限 9MiB，头像上限 2MiB，其他账号请求 2KiB，发表封面上限 8MiB；业务鉴权仍在服务端，管理员 Cookie 不能读取用户私有作品，访问日志关闭。

正式会话启用后，旧客户端换码不能抢占账号，旧最小 token 不能访问私有作品。当前小程序需要配套新网关；仅更新客户端指向旧网关会显示登录/同步不可用，不能算完成上线。

当前 release 的 deploy/schema-ceilings.json 声明 auth=3、topics=1、usage=1；第二阶段旧 release 的 auth 上限为 2，无清单旧版本按上限 1 检查。rollback.sh 在切换前验证目标可读全部当前数据库，兼容才回滚代码，永不恢复旧备份。activate-release.sh 一旦尝试启动新网关就视为可能已接流量：失败保留当前三库；旧版本不兼容时保持网关停止，采用前向修复。不得自动还原迁移前备份覆盖新数据。sqlite-db.mjs restore 拒绝覆盖已有 schema 3 库，灾难恢复须另行授权并先保留完整当前库。

2026-09-07 经分别追加授权，已在既有测试服务器完成第二阶段和文章阶段网关部署、实际 nginx -t、三库备份与迁移及公网验证。未执行破坏性的在线故障回滚演练，未调用付费模型/语音；网关更新均不包含 Git 推送或小程序上传。a713cff 体验版上传是单独授权的历史阶段，当前实际版本见本页顶部。
