# 开发与验收

## 开工顺序

先读 AGENTS.md、产品边界、现行设计规范、架构和本次 OpenSpec 变更。历史设计材料不覆盖现行规范。

OpenSpec CLI 锁定为 1.2.0，Codex 集成在 `.codex/skills`：

```powershell
npx openspec list
npx openspec status --change productize-local-writing
npx openspec instructions apply --change productize-local-writing
npm run spec:check
```

增量流程：需求 → proposal/specs/design/tasks → 确认 → 实现/测试 → 验收 → archive。当前一期已获用户批准；新需求先更新规范。尚有真实语音、真机验收时，不提前归档。

## Git 与自动本地提交

`main` 为集成基线，功能分支 `codex/<change-id>`，PR 关联 OpenSpec；历史标签不移动。

每完成一个可检查的小阶段，先运行相应检查，再明确暂存本任务文件并本地提交。禁止把他人的临时修改、密钥或产物打包提交；失败不伪造“已验收”提交。没有新变化不生成空提交。自动本地提交不代表自动推送、合并或部署。

CI 对 push/PR 运行 npm ci、check、build 和依赖审计；CI 不配置腾讯云密钥。分支保护若因权限不可用，记录差异，不购买服务绕过。

## 命令与端口

- `npm run dev`：前端 3001 + 网关 3002；Ctrl+C 退出。端口占用时检查原进程，不随意杀其他服务。
- `npm run dev:web` / `npm run dev:speech`：诊断时分别启动，不和组合启动器重复运行。
- `npm run check`：类型、Lint、测试、规范与边界校验。
- `npm run build`：本地 Vinext 构建，不发布。
- `npm run test:speech:live`：无参数只读本地状态，不产生语音。显式 `-- --pcm 文件.pcm` 且本地允许标记开启时才做最多 30 秒的真实联调；可加 `--expect 非敏感测试句`。用户已授权少量正常开发测试，不再逐次询问费用；不自动购买/充值。详见 SPEECH-SETUP。

默认仅绑定回环地址。不把开发服务暴露到局域网/互联网；手机真实麦克风和键盘在后续可信 HTTPS 环境验证。

本机 `.env.local` 记录 AppID 与 `ASR_CREDENTIAL_SOURCE=windows-user`，密钥由网关启动时读取 Windows User 环境，不复制进工程。`TENCENT_ASR_TOKEN` 对长期密钥留空；更换凭据后重启网关即可。其他环境使用 `project` 来源。

本地 Vinext 走 Node 运行时，构建才启用 Cloudflare 插件。`local-speech-proxy.test.ts` 使用真实 Vite 转发与假上游覆盖 WebSocket 全流程及外部 Origin 拒绝，不调用腾讯云。

## 数据与备份

数据库 `suiyue-yousheng` v1：works、recovery。输入异步串行写入；“已保存到本机”只在事务成功后显示。手动保存/返回等待最新写入；多标签冲突拒绝过期修订并保留内存内容供导出。

退出前确认保存状态。操作系统强制终止、断电或浏览器杀进程仍可能丢掉最后尚未提交的输入，不能宣传零丢失。

全量 JSON 包括回收站和活动草稿。格式 `app=suiyue-yousheng`、`schemaVersion=1`。导入上限 10MB、10,000 篇；损坏、未知版本、不一致段落信息拒绝整批导入。副本分配新作品/段落 ID。v1 是首次持久化，无旧版数据迁移；未来升级使用版本化事务，不删库重建。发现更高版本数据库时失败并保留原数据。

存储失败时不要刷新，先导出内存备份。复制正文只复制已确认正文；TXT 会另外标出待确认语音和未完成编辑。

## 必测路径

1. 空列表 → 新建 → 中文输入/换行/粘贴 → 单段修改 → 保存 → 刷新/重开。
2. 回收站移除/恢复；JSON 恢复副本；损坏备份不改变原文。
3. 保存失败、多标签冲突、快速输入和保存期间继续输入。
4. 空白/已有文章进入 AI 演示；聊天整理、优化、配图、撤销、退出不写真实仓库。
5. 长按 180ms、短按、授权中松手、取消、后台、断网、迟到结果、5 分钟结束。
6. 360×640、390×844、430×932 与桌面；转写 3–4 行、固定麦克风位置。

真机验收记录机型、OS/浏览器版本、HTTPS 地址、权限、键盘遮挡、后台和网络切换。桌面模拟不能替代。
