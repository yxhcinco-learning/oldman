# 架构与决策

## 当前维护结构

2026-09-06：小程序唯一用户端，网页仅运营后台。H5 用户端物理归档至 archive/h5，所有活跃模块不得引用它。完整历史 ADR 见[退役前快照](archive/h5/ARCHITECTURE.md)，其中双端与浏览器细节不再约束后续开发。

| 层 | 实现与依赖 |
| --- | --- |
| 用户端 | apps/miniprogram，原生 TS/WXML/WXSS，依赖共享核心与微信适配器 |
| 运营端 | app + features/topic-admin，React/Vinext；独立基础样式，根路由进入 /admin/topics |
| 服务端 | server，Fastify/Node；直接引用 packages/core，不依赖 H5 的 features/lib |
| 共享层 | packages/core，领域模型、会话编排、备份、协议；禁止 DOM、Node、wx |
| 归档层 | archive/h5，历史源码/测试/预览；排除类型、Lint、测试和发行归档，无活跃依赖 |

## 数据与事务

小程序本地聚合 schema v2 保存 Work、Draft、ArticleSession；串行写入、预期 revision、临时文件校验替换及崩溃恢复保护原文。正文版本、原始消息、素材、更正关联和候选采用状态分开。JSON v5 兼容 v1–v4，导入副本重映射所有 ID 和引用，不能把导入当同步。收到回复的结算先写每篇独立 `.result.json` 恢复记录；聚合失败保留记录及内存副本，重试只写本机，revision 冲突不覆盖。聚合已提交而索引失败时重试幂等；旧会话不能回写覆盖新回复。全部磁盘写入失败只保证当前进程内可救援。撤销用可选 revertedVersionId 关联恢复版本，不删除曾采用记录；历史恢复追加版本并保留当前手改快照。

服务器 auth.sqlite 保存最小内部用户、(app_id, openid) 身份与会话散列；topics.sqlite 保存运营编辑内容与审计；usage.sqlite 保存匿名日用量与预留。当前不存用户作品。云端作品与账号归属另立变更，不依据客户端传来的用户 ID 授权。

## 小文与语音

conversation.mode 是持久模式唯一来源。共享 prepareDialogue / settleDialogue 编排原始消息、模式事件和素材；protocolVersion=2 的 dialogue 在一次模型请求中完成语义判断与回复，不由客户端关键词路由。无话题开场由共享核心派生；短问候不自动成为素材。结束按钮先存普通模式再整理，自然语言切换只在有效结果保存后生效；候选采用才写正文。待确认修改经反问与纠正仍保留，新要求替换，明确 cancel-edit 只撤回要求。近期与早期相关材料在同一预算内按原话关联选入。具体已验证边界及剩余真机事项见[可靠性验收](XIAOWEN-RELIABILITY-ACCEPTANCE.md)。

小程序使用 RecorderManager、wx.request、wx.connectSocket；语音票据短时且单次消费。网关直连腾讯云，密钥仅服务端；AI 直连 DeepSeek。限额在上游调用前预留，未知结果保守结算，不自动重试计费调用。

服务端原 /api/ai、/api/speech 与匿名事件路径暂保留为独立兼容协议和回归接口；其实现已不依赖 H5。保留接口不代表保留 H5 产品，也不允许绕过既有 Origin、鉴权、限流和用量边界。未来删接口须单独盘点调用方和部署配置。

整理短材料仅重排和润顺已有表达，不把助手追问或未提供的伤情/心理补入作者经历；提示词明确逐句来源核对，固定联调与人工语义复核分别留证，不宣称模型可被提示词完全消除幻觉。

## 运营与部署

后台继续独立管理员会话、HttpOnly/Secure/SameSite Cookie、Origin、CSRF 和修订并发保护；候选不绕过人工审核。后台预览是运营内容预览，不复用或启动 H5 应用。

保留现有 Node 24、TypeScript、React/Vinext 和 npm 工具链用于管理台与服务，删除 H5 独有 IndexedDB/Tailwind 依赖。服务使用 Nginx + 两个 systemd 单元、回环 3011/3012 和 release 外三库。仅网关已授权独立部署7cb0521，安装unit固定release路径；current及网页仍483d8f4，不因本地根路由变化自动退役线上H5。分别按[部署记录](DEPLOYMENT.md)核对两服务版本及回滚目标，不用current推断网关版本。

新增依赖边界扫描禁止活跃代码回引归档与旧兼容层；check/build 保留后台、服务、共享核心和小程序验证，不安装归档依赖、不运行历史 H5 UI 测试。Git archive 排除 archive/ 与 docs/archive/。
