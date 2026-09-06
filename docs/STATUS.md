# 当前状态与第二阶段接手

核对日期：2026-09-07。本页只维护阶段结论与待办；产品能力见[产品](PRODUCT.md)，准确线上版本与回滚见[部署说明](DEPLOYMENT.md)，执行证据见[验收索引](ACCEPTANCE.md)。

## 阶段结论

第二阶段的微信账号、私有云作品、自动同步、单设备续写、个人中心和 JSON v6 已完成实现。活跃变更为 [add-account-cloud-work-sync](../openspec/changes/add-account-cloud-work-sync/tasks.md)，实施和证据见[第二阶段验收](PHASE-TWO-ACCEPTANCE.md)。代码在当前 main 分阶段本地提交，未推送。

用户手机预览出现云接口 404 后追加授权部署，测试网关已更新到 `phase2-7cffd9d-gateway`，Nginx 账号/作品白名单及 auth.sqlite schema 2 已启用。运营网页仍为 `483d8f4`；未上传、提审或发布微信小程序包，手机可继续通过开发者工具预览验证。准确版本与恢复边界见[部署说明](DEPLOYMENT.md)。

账号与作品共用 auth.sqlite schema 2，游客/账号本机隔离、固定操作重试、版本核对、冲突恢复稿及删除标记已接通。真实本地 HTTP 网关、SQLite 和双客户端独立磁盘联调 6 项通过；微信换码使用替身，不调用计费服务。

本地工程与模拟器验收已完成：`npm run check` 310 项测试及 `npm run build` 通过，开发者工具 npm 包已刷新。360×640、390×844、430×932 的会话回归各 69 项通过，账号界面分别 8、8、7 项通过，详见[第二阶段验收](PHASE-TWO-ACCEPTANCE.md)。

第一阶段约定技术验收继续有效。小程序是唯一用户端，网页仅维护运营后台，H5 试验已归档。

- [小程序接入](../openspec/changes/archive/2026-09-06-add-wechat-miniprogram-client/tasks.md)与[统一会话](../openspec/changes/archive/2026-09-06-unify-xiaowen-conversation-modes/tasks.md)已归档，不从旧证据重新生成已完成任务。
- 正式 AppID 已在本机私有配置与服务端配套，用户已配置合法域名并确认 Android 基础语音/小文；不需重复索要密钥。见[正式身份验收](archive/phase-one/FORMAL-APPID-ACCEPTANCE.md)与[最终技术收尾](archive/phase-one/TECHNICAL-CLOSURE-20260906.md)。
- [事实基线同步](../openspec/changes/archive/2026-09-06-synchronize-phase-two-baseline/tasks.md)和[文档结构精简](../openspec/changes/archive/2026-09-06-streamline-project-documents/tasks.md)均已完成并归档；清理未连接或修改线上。后续始终用 `npx openspec list` 查询实际活跃变更。

## 待办与保留边界

- 第二阶段 Android/iOS 实际登录、头像昵称、断网暂停、键盘与跨设备接管尚未验证；第一阶段 Android 语音确认不能替代。change 保持活跃，证据齐全后才同步正式规格、归档。
- 测试服务器的 Nginx 配置、三库备份/迁移、版本兼容及公网接口已验证；旧 schema 1 网关不能读取当前账号库，不得用旧库覆盖新增作品。实际故障回滚演练和正式发布仍未执行。
- 主体、备案、类目、隐私与 AI 平台材料由用户负责，独立保留[发布清单](MINIPROGRAM-AI-PRIVACY-CHECKLIST.md)；不阻塞约定技术归档，也不代表审核通过。未上传、提审或发布小程序。
- 旧线上网页与兼容接口退役、独立 ASR 最小权限运行凭据，是未来需明确授权的运维事项；不能静默停站、删接口或轮换共享凭据。网关与网页版本不同本身不是故障。
- 用户旧备份、私有配置、`.tmp` 与服务器备份不属于文档垃圾；旧 JSON/action/聚合迁移继续服务数据恢复。历史 H5 源码只供追溯，不恢复为用户端。
- 有限真实模型样本通过不代表消除幻觉，自动化不替代真机；原始失败与修复证据保留在归档。

## 新会话开工

1. 检查 Git 分支和状态，读取 [AGENTS](../AGENTS.md)、本页、[产品](PRODUCT.md)、[架构](ARCHITECTURE.md)及[开发说明](DEVELOPMENT.md)。
2. 查看 [OpenSpec](../openspec/README.md) 与实际活跃变更，读取 proposal、design、specs、tasks 和[第二阶段证据](PHASE-TWO-ACCEPTANCE.md)，从未勾选项继续。
3. 真机结果单列设备、系统与实际观察，证据齐全再同步规格、归档；不混入运营账号体系，不重启 H5 或自动部署，不重复索取已配置凭据。
