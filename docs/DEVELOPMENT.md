# 开发与验收

## 开工顺序

先读 AGENTS.md、[当前状态](STATUS.md)、[产品边界](PRODUCT.md)和本次 OpenSpec。小程序是唯一用户端；网页目录只服务运营后台。历史 H5 资料在[归档](archive/h5/README.md)，不可作为新需求、依赖或验收门槛。

日常在当前仓库 main 工作，不另建副本或擅自操作分支。每个通过检查的小阶段仅提交本任务文件，不自动推送、部署或上传。OpenSpec CLI 使用锁定版本：npx openspec list，按实际变更 ID 读取 proposal/specs/design/tasks，完成且证据齐全后 npx openspec archive <change-id> --yes，同步后再次验证。

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

新架构必须通过退役依赖边界：活跃源码不能引用 archive/h5、旧 lib、H5 features 或预览。归档与 `.tmp`、`outputs`、`work`、`test-results` 等临时输出不参与 TypeScript、Lint 或测试发现；正式验收脚本保留检查，归档不参与发布输入；现有 CI 仍执行完整 check/build 与依赖审计。

## 数据与配置

小程序仍本地优先：文件聚合、恢复、revision、回收站及 JSON v5，旧 v1–v4 备份可导入副本。操作系统中断可能丢失未提交输入，不承诺零丢失。服务器三库不是作品云备份，不将用户 JSON、正文或音频放入 Git。

服务配置仍在忽略的 .env.local；服务器秘密位于 /etc/suiyue-yousheng/runtime.env。正文/语音/身份失败均不回退假数据。[语音配置](SPEECH-SETUP.md)、[部署](DEPLOYMENT.md)、[隐私](PRIVACY.md)保留有效服务边界。旧 localhost 数据不迁移、不清除，已归档浏览器操作不再是开发入口。

## 小程序本地验收入口

共享接口变化后执行 `npm run devtool:build-npm --workspace @suiyue/miniprogram`，刷新实际 npm 运行包并验证导出；命令只清代码编译缓存，不清作品、文件或身份。然后执行普通编译。开发者工具若显示首页白屏且自动化超时，先查原生编译和模拟器启动日志；排除编译错误后可重新启动 IDE 复核，不能将单纯构建成功当运行成功。

独立自动化入口 `node apps/miniprogram/scripts/qa-dialogue-simulator.mjs`：通过 CLI `auto --project <小程序绝对路径> --auto-port 9420 --port <当前IDE端口>` 启用，等待编译后连接。`MINI_AUTOMATOR_PATH` 指向本机独立安装的 miniprogram-automator，`MINI_QA_OUTPUT` 指向非提交截图目录。开始前停首页、无用户编辑；运行期间不要修改小程序源码（热编译会重置替身），结束恢复原服务和首页。测试使用每次独立 qa-dialogue 目录、模拟网络响应，不上传、不调用付费模型。脚本输出实际窗口尺寸；360×640、390×844、430×932分别设置真实模拟器机型，不用 mock 系统信息冒充尺寸验收。

上述模拟器脚本默认包含两页长按语音回归；设置 `MINI_QA_DICTATION_ONLY=1` 可只运行语音定点检查。真实前端语音状态机接设备/权限/Socket替身，覆盖录音布局、短按、取消、转写后发送以及正文待确认内容隔离，不申请真实麦克风权限或使用 ASR。DevTools 的 `tap()` 返回不等于页面事件已执行，断言和下一步松手前须等待事件落地；不能把测试触摸延迟当成产品自动发送。

`scripts/dialogue-live-check.ts` 是显式真实模型入口：默认3次问候/素材/整理，`--pending-edit` 最多3次改文/反问/撤回，`--cancel-edit` 为单次撤回定点复验。先估算费用，每次最多30000输入估算tokens/2048输出tokens，失败即停、不自动重试；不纳入 CI。本地费用单价未配置不代表免费。
