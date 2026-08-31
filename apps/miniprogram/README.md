# 微信小程序开发工程

这是“岁月有声”的原生微信小程序客户端。Web 端继续由仓库根目录的 Vinext 工程提供，小程序与 Web 复用 `packages/core` 中的平台无关领域逻辑。

## 本地身份配置

- 公共 `project.config.json` 固定使用 `touristappid`，可以安全提交。
- 实际开发 AppID 写在 Git 忽略的 `project.private.config.json`；当前仅用于本机开发和体验验证，不允许上传或发布。
- AppSecret 只允许写入服务器运行环境，绝不能出现在本目录、客户端包、日志或仓库中。

用微信开发者工具导入本目录即可。AppSecret 尚未配置时，本地写作仍可使用；微信身份、AI 和语音接口会明确显示暂不可用，不会伪造成功状态。
