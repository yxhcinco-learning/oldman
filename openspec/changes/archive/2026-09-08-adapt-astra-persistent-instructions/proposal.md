## Why

用户要求依据 OpenAI GPT-6 Astra 官方指南与 Eric Provencher 的原文，直接审计并调整实际可用的持久指令。现有 OpenSpec 技能存在丢弃实施授权、普通错误即停止、重复归档确认等规则，与仓库已授权自主完成的约定冲突。

## What Changes

- 仓库规则明确按任务读取、沿用授权、响应中途补充、按影响验证及完成后收尾；保留分支、发布、费用和数据边界。
- 修正项目 OpenSpec 技能及运行时 context 中的重复确认、固定输出和无条件重读；保留 schema、路径、依赖和同步验证契约。
- 用户另行明确授权的全局 AGENTS、旧 opsx 提示及个人设计技能同步调整；原文件在本机备份，不将全局个人文件复制入仓库。
- 记录实际读取范围、来源、验证和恢复路径；不改产品代码、模型选择、权限规则或厂商插件缓存。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-foundation`：补充持久指令的授权沿用、任务完成条件、按需上下文与验证停止条件。

## Impact

影响 AGENTS.md、开发/接手说明、openspec/config.yaml 和 .agents/skills；全局文件属于同一用户请求的本机维护部分，不改变其他项目的产品规则。没有新增运行功能、模拟功能、依赖、计费调用或外部发布，不接触用户作品与凭据。既有发表变更的真机待办保持活跃。
