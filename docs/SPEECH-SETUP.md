# 腾讯云实时语音：本地接入指引

本机已支持复用腾讯云部署工具配置过的凭据。真实联调状态见 docs/ACCEPTANCE.md；无需重复创建或提供 SecretKey，也不要把密钥发到聊天中。

## 1. 检查服务与额度

您的截图显示“中国大陆实时流量：已开通”。在控制台将用量/资源包筛选到 **实时语音识别**，不要把“录音文件识别”额度当成本项目额度。确认有效期、可用时长和后付费开关。

语音模型由服务端 `TENCENT_ASR_ENGINE_MODEL_TYPE` 选择，只接受普通话基础模型 `16k_zh`（默认）、中英大模型 `16k_zh_en` 和 `16k_zh_en_2.0`；受控公网本次显式使用 1.0 的 `16k_zh_en`，2.0 只保留为后续可切换项。本地可按需切换。免费额度、单价和规则会变化，以控制台为准；程序不自动充值、购买资源包或修改后付费设置。[官方计费说明](https://cloud.tencent.cn/document/product/1093/35686)

按 [AGENTS 的费用规则](../AGENTS.md#付费服务使用) 简单估算费用与总时长后，可按需用几段 10–20 秒的非敏感语音做小规模真实联调，无需逐次确认。批量、压测或高成本、费用不确定的调用先确认预算和上限；日常回归与 CI 不调用真实 ASR，其他业务逻辑按需使用真实实现或测试替身。

## 2. 准备受限凭据

本机已用 `codex-cvm` 子用户，并由用户添加 `asr:RealtimeRecognition` 操作权限；该操作的资源写为 `*`。不需要新建用户、重复生成密钥或开启控制台登录。正式运行建议改用只含 ASR 权限的独立身份，不把服务器/DNS 管理身份用于产品运行。[ASR 访问管理](https://cloud.tencent.com/document/product/1093/48421)、[实时识别授权参考](https://cloud.tencent.com/document/product/1093/48422)

AppID 使用所属主账号的 AppID，不是账号 UIN 或微信小程序 AppID；SecretId/SecretKey 使用子用户现有密钥。`TENCENT_ASR_TOKEN` 仅用于 STS 临时凭据，长期子用户密钥留空即可。[官方实时接口](https://cloud.tencent.com/document/product/1093/48982)

## 3. 填入本机环境文件

已验证的本机配置保存到 Git 忽略的 `.env.local`。当前使用 Windows User 中已有的 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`，启动网关时重新读取，不要求桌面应用已继承这些环境变量。文件只包含非秘密配置：

```dotenv
ASR_CREDENTIAL_SOURCE=windows-user
TENCENT_ASR_APP_ID=你的数字AppID
TENCENT_ASR_SECRET_ID=
TENCENT_ASR_SECRET_KEY=
TENCENT_ASR_TOKEN=
TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh
ASR_ALLOWED_ORIGIN=http://localhost:3001
ASR_MAX_CONNECTIONS=2
ALLOW_PAID_SPEECH_TEST=1
```

其他电脑或独立运行身份使用 `ASR_CREDENTIAL_SOURCE=project`（默认），通过服务端环境变量提供完整 ASR 密钥对，临时凭据同时提供 Token。两个来源互斥：不会混用 SecretId/SecretKey/Token，选定来源缺失时明确失败，不静默换成共享身份。Windows 读取有超时，异常不回显密钥。模型变量留空时兼容使用 `16k_zh`；修改为 `16k_zh_en` 或 `16k_zh_en_2.0` 后重启网关即可切换，其他值会让网关拒绝启动，避免拼写错误被静默忽略。

不要添加 `NEXT_PUBLIC_` / `VITE_` 前缀。`ALLOW_PAID_SPEECH_TEST` 只控制命令行音频联调，不是云端费用封顶开关；配置凭据后在页面主动录音就可能使用额度。

## 4. 启动与确认

停止旧服务，运行 `npm run dev`。始终打开 http://localhost:3001/，不要切成 127.0.0.1。

访问 http://localhost:3001/api/speech/status 应看到 `configured: true`。这**只表示字段齐全**，不证明密钥有效、权限正确、额度充足或网络可达；接口从不返回凭据。

运行 `npm run test:speech:live` 默认只检查本地配置，不上传音频，也不要求允许标记。真正的命令行联调需显式指定本地非敏感 PCM 文件：

```powershell
npm run test:speech:live -- --pcm outputs/测试音频.pcm --expect 非敏感测试句
```

音频必须为 16kHz、单声道、16 位 PCM，最多 30 秒。已设置允许标记后，工具通过 localhost:3001 的同源代理发送，保持与浏览器一致的 40ms 实时速率，校验最终结果，仅输出时长/字数/更新次数等指标，不记录转写全文。`--expect` 可省略；不把私人内容放在命令参数中。测试音频放在忽略目录，不提交。

页面验收：先长按并同意音频处理说明，再长按处理浏览器权限，等待“正在听”后说话。

授权弹窗期间松开会取消；即使稍后同意权限，也不会暗中录音。再次长按即可。

## 5. 真实验收

- 说普通话，确认转写是自己的话而非 Demo 固定故事。
- 松手后麦克风关闭，等待最终修正；继续说追加、不重复首句。
- 完成进入正文，刷新仍存在；待确认转写也能恢复。
- 拒绝授权、取消、断网、后台不会继续采音，已有文字可修正。
- 记录日期、总时长、控制台消耗和错误类型，不记录密钥/签名 URL。
- 本机允许标记可随用户授权保留；没有显式音频参数不发起识别，CI 不配置凭据。不使用时停止网关；共享凭据轮换需同时考虑部署工具，不能随意删除。

## 排查

| 提示 | 检查 |
|---|---|
| 尚未配置或网关无法启动 | AppID、凭据来源、完整密钥、模型值是否为 `16k_zh` / `16k_zh_en` / `16k_zh_en_2.0`、网关是否重启 |
| 无法连接网关 | 3002 是否启动，3001 是否使用组合启动器 |
| 来源不允许 | 地址是否严格为 `http://localhost:3001` |
| 麦克风未获允许 | 浏览器权限与安全上下文；先在电脑 localhost 验证 |
| 腾讯云未成功 | AppID、受限权限、Token、实时额度、流量地区与网络 |
| 网络过慢/收尾超时 | 保留文字，分短段再试，不持续重复连接 |

本地开发与构建均使用 Vinext 的 Node 链路，Sites/Cloudflare 发布插件已移除。语音转发保持 Origin，不改写或关闭来源校验。

单段最长 5 分钟、音频最多 10MB、默认 2 路连接。这是资源限制，不是费用承诺。原音只有内存缓冲，不持久保存。上线前仍需独立 HTTPS、服务端安全和真机验收方案。
