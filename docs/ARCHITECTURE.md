# 架构与决策

## 模块

- app：页面入口、全局样式和元数据。
- features/writing：编辑器、作品列表、编辑恢复与操作状态。
- features/speech：长按控制、音频采集与语音事件。
- features/demo：待接入 AI 功能的当前模拟实现，只接收深副本和退出回调；目录名是既有技术标识，不代表项目定位。
- lib/domain：Work、Draft、Segment 与纯函数。
- lib/storage：WorkRepository、IndexedDB、版本化备份。
- server：仅回环地址的 Fastify WebSocket ASR 网关。

## ADR-001 保留工具链

沿用 React 19 / TypeScript / Vinext / npm。本次不迁移框架；Vinext beta 稳定性在公开发布前另行评估。固定运行时并提交锁文件。

开发和构建均使用现有 Vinext 本地 Node 链路。2026-08-28 用户停用 GPT Sites，已移除 Sites/Cloudflare Vite 插件、Worker 类型、Wrangler 直接依赖及 D1/R2 占位配置，不迁移 React/Vinext 框架。之前 Cloudflare 开发插件的无差别 WebSocket 升级监听器曾截断语音代理；保留相关回归，不改写 Origin 或用户访问地址。

审计后在相同工具链内更新安全修复版本：Next 16.3.3、React/RSC 19.2.8、Vinext beta.8、Vite 8.2.2。移除发布专用依赖时未升级剩余包；实际以 package-lock.json 为准，不能仅用 `--omit=dev` 掩盖参与开发/构建的依赖风险。

## ADR-002 本地事务

IndexedDB v1 的 works 保存 ID、时间、revision、deletedAt 与编辑快照；recovery 保存活动作品指针。写队列串行，事务内比较 revision，冲突拒绝而非覆盖。UI 依赖存储接口；未来升级事务化，禁止删库恢复。

## ADR-003 语音边界

AudioWorklet 重采样至 16kHz PCM16；同源 WebSocket 代理至 127.0.0.1:3002；服务端签名并连接腾讯云固定地址。独立状态机管理长按、授权、采音、收尾、取消。网关限制连接、时长、输入大小及 Origin，不记录内容。

40ms 发送 1280 字节 PCM，按 index 合并临时/最终结果；签名和结束信令参考 [腾讯云官方 SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-js) 与 [WebSocket 接口](https://cloud.tencent.com/document/product/1093/48982)。实现不代表真实账号/浏览器兼容性已验收。

`server/credentials.ts` 显式选择 `project` 或 `windows-user`。后者在服务端用固定、隐藏且有超时的 PowerShell 子进程读取 User 环境，秘密只在内存传递，不写项目或日志。只读取选定来源，不混用密钥对和临时 Token；缺失保持网关未配置。用户已授权的本机 `.env.local` 只保存 AppID、来源和其他非秘密参数。

## ADR-004 AI 模拟交互的当前隔离实现

聊天引导、文章优化等功能尚未接入真实 AI。当前独立组件树内初始化副本，不引用存储或真实语音；完成/优化/撤销只作用于副本，关闭组件即销毁。真实业务不依赖模拟数据，具体导入边界由 `scripts/check-boundaries.mjs` 检查。

这些约束描述当前实现，不作为 AGENTS 的长期协作规则。本次不改动模块名、界面现有提示或数据写入方式；后续接入真实 AI 时，应先确认行为及数据边界，再更新本决策、对应 OpenSpec 和测试。

## 回退

Git 提交 `28fd5e4` 为无持久化的历史设计基线。正式 Git 历史保存在 D:/vibe_code/oldman；原型源码和额外 bundle 已按用户要求清理，不再保留退役副本。回退前导出 JSON，代码回退不等于数据库降级。
