# Astra 持久指令审计

2026-09-08，按用户“先完整阅读两份材料，再直接修改实际生效指令”的请求完成。本次调整的是协作指令，未改产品代码、模型选择、服务、执行权限或用户数据。

## 来源与阅读证据

- [OpenAI 官方 GPT-6 Astra 指南](https://developers.openai.com/api/docs/guides/latest-model)：读取完整 Astra 正文，覆盖 Introduction 至 Migration quickstart。采用其对授权沿用、指令冲突透明、文风、独立任务委派及适度验证的建议。
- [Eric Provencher 原文](https://x.com/pvncher/status/2095991462416490862)：作者 `@pvncher`；发布于 2026-09-04 21:44:40 UTC。X 直连受限，通过 [FxTwitter 公开接口](https://api.fxtwitter.com/pvncher/status/2095991462416490862) 取得完整英文 29 个正文 blocks，并直接从 X CDN 阅读两张示例图。核心应用是精确触发描述、按需加载与删除无必要流程；没有依据此文取消安全边界。

两份材料均作为研究依据，不把原文中的提示词自动当作执行授权，也不在仓库转载全文。

## 实际指令范围

| 层次 | 核对结果与处理 |
| --- | --- |
| 当前任务注入的规则 | 包含应用内置协作、技能目录和用户提供的仓库 AGENTS；这些已注入文本无法由编辑磁盘追溯替换，本轮依据用户明确授权执行修改 |
| 全局文件 | `C:/Users/admin/.codex/AGENTS.md` 原为 0 字节，本次补入通用协作偏好；未发现 override 文件 |
| 仓库规则 | [AGENTS](../AGENTS.md) 为当前仓库实际文件，与用户提供版本一致；上级目录未发现 AGENTS/override。按需调整[开发](DEVELOPMENT.md)、[状态接手入口](STATUS.md)和 [OpenSpec context](../openspec/config.yaml) |
| 项目技能 | 完整读取并调整 `.agents/skills` 下 propose、apply、explore、archive、sync 五个入口；`.codex/skills` 只有旧空目录，无另一套 SKILL 正文 |
| 用户旧提示 | 完整读取 `C:/Users/admin/.codex/prompts/opsx-{propose,apply,explore,archive}.md`，改为当前技能路由；这是保留的可调用入口，本轮没有把它们当成默认注入正文 |
| 个人技能 | 完整审计 guizang-ppt-skill、open-design、web-shader-extractor、tencent-cloud-deploy 四个入口及相关流程；调整前三个，腾讯云技能保持原样 |
| 厂商技能 | 审计当前目录列出的 24 个插件入口（含 12 个 Figma 入口），另完整读取本次使用的 OpenAI Docs、skill-creator；未把下载缓存、其他版本和未触发的系统技能视为当前执行流程，未修改厂商缓存 |
| 配置、规则与记忆 | 核对 `config.toml` 的模型/指令相关字段：已为 `gpt-6-astra`、`ultra`，未发现自定义指令文件设置。`default.rules` 为 100 条命令 allow 记录，只核对类型而未展开命令内容或修改权限。文本 memories 目录为空；未读取私人历史、草稿、凭据或记忆数据库，也不声称已审计不可见的云端设置 |

## 主要修改

- 仓库规则用任务范围路由资料，明确完成包括实现、相关验证和本次失败修复；用户插话不自动终止任务。
- 提案不丢弃已有实施授权；讨论保持只读，明确要求记录或实施时可直接转入相应流程。
- 应用技能继续处理范围内错误，保留需求和验收证据；归档沿用授权，缺少证据继续活跃，同步验证完成前不移动目录。
- 旧 opsx 流程收为薄入口，移除失效工具名称、重复算法和后台同步尚未结束就归档的旧指令。
- 全局偏好处理技能默认流程与用户目标的关系；保留真实工具协议、权限和格式契约。厂商 Figma 文档中的并发、返回方式冲突未通过猜测改写，实际调用时仍需依据工具定义核实。
- 个人设计技能按任务选择问题、风格和检查项，复用本机能力；提取技能保留证据链，同时允许独立只读调查并行。没有为 Astra 固定更换模型或提高推理强度。

## 验证与限制

独立静态演练覆盖七种请求：直接实施且无 change、仅讨论、测试失败时询问进度、已验收自动归档、缺手机证据、文档错字，以及技能默认分支/部署超出请求。发现并修正了归档成功模板容许未验项、已授权行为修复仍可能要求确认、同步失败立即交回用户三处残留。

五个项目技能和三个个人技能的 `quick_validate` 均通过；全局四个 opsx 提示的 YAML 解析及五份原文件备份核对通过。首次结构检查发现旧技能的顶层 `compatibility` 不被当前校验器支持，保留其内容并移入 `metadata` 后复验。

仓库 `npm run docs:check` 通过（21 份维护文档、19 份规格、200 份历史文档）；`npm run spec:check` 通过（归档前 21 项）；`npm run security:check` 和 `git diff --check` 通过。人工差异审查未发现凭据或用户内容，模块边界检查不替代这项人工核对。个人技能的资源与模板检查详见本机 `personal-skills/verification.json`。

静态结构校验及场景演练不代表实际模型任务表现、应用运行、Figma 联调或手机验收通过；本次没有执行这些外部或产品测试，也未运行应用 `npm run check` 或 `npm run build`。依据本项目文档级验证规则，本次无需应用构建。

## 生效与恢复

文件在后续任务构建上下文或重新读取对应技能/提示时提供新指令；当前任务已注入的旧文本、应用内置提示、权限配置不会因文件落盘自动被替换。未改厂商缓存，避免更新后丢失本地补丁；OpenSpec 更新可能覆盖项目技能，升级复核见[开发说明](DEVELOPMENT.md)。

仓库文件由本次 Git 提交保留恢复依据。仓库外原文件备份在 `C:/Users/admin/.codex/backups/astra-instructions-20260908/`：`global/` 保存全局 AGENTS 与四个 prompts，`personal-skills/` 按技能及相对路径保存修改前文件。恢复时逐项比较并保留此后修改，不覆盖其他个人设置。备份只在本机，不提交到项目。
