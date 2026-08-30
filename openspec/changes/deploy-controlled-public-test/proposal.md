## Why

“岁月有声”当前只支持 localhost 验收，异地同事无法在可信 HTTPS 环境体验真实保存、DeepSeek 文章助手和腾讯云语音。现在需要一次受控、可回滚的临时公网测试，以少量真实用户验证现有核心链路，同时保持文章仅在各自浏览器 IndexedDB 中并避免把阶段性访问控制写入产品。

## What Changes

- 增加可复用的 Linux 生产部署骨架：固定版本构建、受限运行账户、systemd 托管、回环监听、健康检查、异常重启、日志约束和可回滚发布目录。
- 增加 Nginx 同源 HTTPS 入口：`/` 转发 Vinext，`/api/ai/*` 转发 Fastify HTTP，`/api/speech` 保留 WebSocket Upgrade，并配置兼容 microphone self 的安全响应头。
- 在反向代理层增加测试期 Basic Auth 或等价保护和简单按 IP 限流；不在产品代码中增加账号、邀请码、测试条、管理后台或用户配额。
- 固定测试域名及精确 HTTPS Origin，Linux 以 `project` 来源从权限受限的服务端环境文件读取 DeepSeek 与腾讯云 ASR 凭据；秘密不进入 Git、客户端、镜像、命令输出或业务日志。
- 增加最小公网、重启和回滚验收，真实外部调用只做少量非敏感短样本，并如实区分自动浏览器验证、合成音频验证和仍需用户操作的真机麦克风/键盘验证。
- 更新产品、架构、开发和隐私说明，将“无公开服务”调整为“仅限访问保护下的小范围临时公网测试”，不承诺正式上线、账号或云端文章。

## Capabilities

### New Capabilities

- `controlled-public-deployment`: 受控公网测试的进程托管、同源 HTTPS、访问保护、秘密管理、健康/日志、验证与回滚边界。

### Modified Capabilities

无。现有写作、文章 AI 与语音产品行为不变；公网入口和运行约束由新增部署能力管理。

## Impact

涉及部署脚本与服务/代理模板、环境变量模板、运行文档、产品/架构/隐私状态、腾讯云 Lighthouse 与 DNSPod 既有资源，以及目标服务器上的独立发布目录、systemd 和 Nginx 配置。不会迁移或上传 localhost/其他 Origin 的 IndexedDB 数据，不新增数据库、账号系统、外部搜索、发布平台或额外云资源；不推送、合并或修改 Git 历史。
