# 当前状态与第二阶段接手

核对日期：2026-09-07。本页只维护阶段结论与待办；产品能力见[产品](PRODUCT.md)，准确线上版本与回滚见[部署说明](DEPLOYMENT.md)，执行证据见[验收索引](ACCEPTANCE.md)。

## 阶段结论

第一阶段的小程序接入、统一小文会话、可靠性收尾与正式 AppID 配套已完成约定技术验收。小程序是唯一用户端，网页仅维护运营后台；H5 试验已归档。第二阶段的账号产品、私有云端作品与跨设备同步尚未实现，也尚无实施变更。

- [小程序接入](../openspec/changes/archive/2026-09-06-add-wechat-miniprogram-client/tasks.md)与[统一会话](../openspec/changes/archive/2026-09-06-unify-xiaowen-conversation-modes/tasks.md)已归档，不从旧证据重新生成已完成任务。
- 正式 AppID 已在本机私有配置与服务端配套，用户已配置合法域名并确认 Android 基础语音/小文；不需重复索要密钥。见[正式身份验收](archive/phase-one/FORMAL-APPID-ACCEPTANCE.md)与[最终技术收尾](archive/phase-one/TECHNICAL-CLOSURE-20260906.md)。
- [事实基线同步](../openspec/changes/archive/2026-09-06-synchronize-phase-two-baseline/tasks.md)已完成；本轮进一步归并文档入口和历史证据，未连接或修改线上。实际活跃任务始终用 `npx openspec list` 查询。

## 待办与保留边界

- iOS 真机未验证：后续涉及键盘、语音、安全区或发布时补实际证据，不记作通过。
- 主体、备案、类目、隐私与 AI 平台材料由用户负责，独立保留[发布清单](MINIPROGRAM-AI-PRIVACY-CHECKLIST.md)；不阻塞约定技术归档，也不代表审核通过。未上传、提审或发布小程序。
- 旧线上网页与兼容接口退役、独立 ASR 最小权限运行凭据，是未来需明确授权的运维事项；不能静默停站、删接口或轮换共享凭据。网关与网页版本不同本身不是故障。
- 用户旧备份、私有配置、`.tmp` 与服务器备份不属于文档垃圾；旧 JSON/action/聚合迁移继续服务数据恢复。历史 H5 源码只供追溯，不恢复为用户端。
- 有限真实模型样本通过不代表消除幻觉，自动化不替代真机；原始失败与修复证据保留在归档。

## 新会话开工

1. 检查 Git 分支和状态，读取 [AGENTS](../AGENTS.md)、本页、[产品](PRODUCT.md)、[架构](ARCHITECTURE.md)及[开发说明](DEVELOPMENT.md)。
2. 查看 [OpenSpec](../openspec/README.md) 与实际活跃变更。第二阶段先设计身份与作品归属、云端数据模型和权限，再确定首次入云、离线队列、冲突、删除/恢复与跨设备续写规则。
3. 按确认范围建立新变更后实现；不把本机 revision 或导入副本当同步协议，不信任客户端自报用户 ID，不混入运营账号体系，不重启 H5 或自动部署。
