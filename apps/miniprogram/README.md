# 微信小程序开发工程

这是“岁月有声”的唯一用户端。根目录 Vinext 工程只提供运营后台；H5 试验端已归档。小程序、后端与后台直接使用 `packages/core`，边界见 [CLIENT-SCOPE](../../docs/CLIENT-SCOPE.md)。

最新阶段结论见[当前状态](../../docs/STATUS.md)，不要从历史记录重复索要 AppID 或密钥。

## 本地身份配置

- 公共 `project.config.json` 固定使用 `touristappid`，可以安全提交。
- 实际开发 AppID 写在 Git 忽略的 `project.private.config.json`；常规检查仅用于本机开发和体验验证，不自动上传或发布；上传/提审须用户另行授权。
- AppSecret 只允许写入服务器运行环境，绝不能出现在本目录、客户端包、日志或仓库中。

用微信开发者工具导入本目录即可。AppSecret 尚未配置时，本地写作仍可使用；微信身份、AI 和语音接口会明确显示暂不可用，不会伪造成功状态。

2026-09-06 已切正式 AppID，本机私有配置显式启用域名校验，真实换码与HTTP成功、WSS鉴权拒绝路径通过；域名为 `https://suiyue.maicong.chat` / `wss://suiyue.maicong.chat`。用户已配置合法域名并确认 Android 基础语音/小文正常；iOS 尚未验证，平台材料由用户在独立发布清单处理，不代表已上传或发布。详见[正式AppID验收](../../docs/FORMAL-APPID-ACCEPTANCE.md)。
