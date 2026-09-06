> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/PRODUCT.md 与 active-client-scope 规范。

# project-foundation Specification

## Purpose
定义正式工程从已验收界面到可持续交付的基础约束，包括唯一仓库根目录、可逆开发、分级验证、统一命名、诚实外部交付，以及退役发布接入与残余缓存的安全清理要求。
## Requirements
### Requirement: Approved interface fidelity
工程 SHALL 以现行 DESIGN-SYSTEM.md 与已确认 OpenSpec 为小程序界面依据，运营后台保持独立设计；Git 提交 28fd5e4 仅是历史来源，不是当前像素基线，不恢复演示或退役 H5 入口。

#### Scenario: Review a current product screen
- **WHEN** 调整作品、语音、小文或数据工具界面
- **THEN** 按现行小程序设计及真实状态验收，保留适老触控、保存与错误补救；运营后台单独做浏览器回归

#### Scenario: Locate a historical preview
- **WHEN** 查阅归档模拟页面或设计截图
- **THEN** 仅用于追溯，不作为产品依赖、当前要求或测试通过证据

### Requirement: Reversible scoped development
工程 SHALL 保留已验收基线（Git 提交 28fd5e4）及其后正式版本，遵循 AGENTS 和 OpenSpec，源码不包含缓存、密钥、原音或私密正文；在当前仓库根目录开发。

#### Scenario: Cleanup and verification
- **WHEN** 清理或重构 Demo
- **THEN** 每个验证小阶段主动本地提交；原 Demo 经核对且用户明确确认后清理，线上站点不改变

### Requirement: Single canonical project root
正式工程 SHALL 直接位于当前仓库根目录，不嵌套另一套工程、不混合已淘汰的原型文件，不保留第二个活动工程目录。具体机器路径记录在本地开发说明中，不作为其他开发环境的路径要求。

#### Scenario: Replace a retired prototype checkout
- **WHEN** 按用户确认将正式工程迁至工作区根目录
- **THEN** 确认原型工程无独有配置、未提交改动或本地用户数据后，按用户明确要求清理原型内容及多余备份，不另存退役副本；完整保留正式工程的源码、Git 历史、隐藏配置和本地文件，校验完成后清理空的迁移源目录，不递归删除当前工作区根目录

#### Scenario: Restart from the canonical root
- **WHEN** 在 D:/vibe_code/oldman 启动服务
- **THEN** AGENTS、OpenSpec、依赖及 .env.local 均位于此根目录，文档命令只指向正式工程路径；仍使用 localhost:3001，不清空或迁移浏览器作品库，不发布线上站点

#### Scenario: Work in another checkout environment
- **WHEN** 在另一台电脑或 CI 检出仓库
- **THEN** 以该检出的仓库根目录执行命令，不要求本机盘符或另建嵌套项目，脚本与规范引用保持可用

### Requirement: Durable development guidance
工程 SHALL 在 AGENTS 中维护规范入口、工作流程、权限安全和验证交付规则，将产品状态、实现细节、阶段结论及完成状态保留在对应文档；日常直接在 main 开发，不强制创建功能分支或 PR，未经用户明确允许不得执行分支操作。

#### Scenario: Complete a checked change
- **WHEN** 一个小阶段通过相应检查
- **THEN** 明确暂存本任务文件并自动本地提交，以 OpenSpec 和检查证据记录变更，不要求先创建分支或 PR，不自动推送或合并

#### Scenario: A branch operation appears useful
- **WHEN** 代理认为创建、切换、重命名、合并或删除分支有助于任务
- **THEN** 在执行前取得用户明确允许；任务开始时已位于非目标分支则先说明并确认

#### Scenario: Record a phase-specific decision
- **WHEN** 确认仓库可见性或某阶段完成情况
- **THEN** 更新对应变更或验收记录，不把该阶段结论添加为 AGENTS 的长期规则；提交、推送前仍检查敏感信息

#### Scenario: Archive a completed change autonomously
- **WHEN** 一个 change 的范围内任务完成，相关验收证据齐全且检查通过
- **THEN** 自行将增量规范同步至 openspec/specs 并归档，无需再次确认；修复文档引用、验证规范并按约定本地提交，不自动推送或发布

#### Scenario: Keep an incomplete change active
- **WHEN** change 范围内仍有未完成任务或缺少相应验收证据
- **THEN** 保持活跃并说明原因，不把 artifacts 完整当作验收通过，不通过跳过校验或擅自移出任务来强行归档；其他 change 的待办或明确的非目标不阻塞本变更

#### Scenario: Find the applicable source of truth
- **WHEN** 开始处理一个请求
- **THEN** 按范围查阅产品状态、OpenSpec 行为、设计或架构及开发说明；遇到冲突先澄清，AGENTS 不复制历史称谓、机器路径和 AI 模拟实现细节

#### Scenario: Work within an approved scope
- **WHEN** 在已确认范围内进行普通实现或内部类型调整
- **THEN** 无需重复请求确认；问答和审查默认只读，超出范围或涉及破坏兼容性、数据丢失风险及未授权外部操作时先说明并确认

### Requirement: Proportionate verification
工程 SHALL 根据改动影响选择验证，保留代码阶段交付和 CI 的完整回归，记录未验证项，不以模拟结果替代真实联调或设备验收。

#### Scenario: Documentation-only changes
- **WHEN** 仅修改文档或注释，不改变应用代码与运行配置
- **THEN** 检查差异、引用、内容一致性与相关 OpenSpec，不强制应用构建；纯排版、错字等不改变行为的文档修正无需新建变更

#### Scenario: Code or runtime changes
- **WHEN** 修改代码、运行链路、依赖或界面
- **THEN** 代码运行 check，运行或打包相关变更加 build，界面增加浏览器回归；代码阶段交付和 CI 执行完整 check 与 build

### Requirement: Consistent product naming
项目文件 SHALL 统一使用“岁月有声”“正式版”或“当前工程”，不再用历史原型的版本代称区分活动项目；现行规范、归档文件名和测试描述保持一致。

#### Scenario: Review documentation and references
- **WHEN** 维护 README、AGENTS、设计规范、OpenSpec、归档材料或测试描述
- **THEN** 使用统一产品称谓，设计基线通过固定提交定位；不重写 Git 历史或标签，不误改外部接口路径、数据库格式版本及依赖校验值

### Requirement: Honest local delivery
工程 SHALL 固定 localhost:3001，并提供类型、Lint、单元、流程、构建和规范检查，外部验收不得自动宣称通过。

#### Scenario: Port conflict
- **WHEN** 3001 已被其他服务占用
- **THEN** 启动失败并报错，而非自动切换端口

#### Scenario: Missing external access
- **WHEN** 缺少 GitHub 权限或腾讯云凭据
- **THEN** 保留可交付的本地实现并将对应远程任务标记待办

### Requirement: No retired hosting integration
工程 SHALL 按用户确认移除本地 GPT Sites 发布接入及其专用依赖，保留 React、TypeScript、npm、Vinext 与现有本地语音链路；不自动修改、删除或发布远端站点。

#### Scenario: Run without Sites
- **WHEN** 在正式根目录安装依赖并启动开发或执行构建
- **THEN** 不需要 `.openai/hosting.json`、Sites 登录或 Cloudflare Worker 插件，不注入 D1/R2 占位绑定；仍使用 localhost:3001 和本机语音网关，现有 UI 与浏览器作品库不改变

#### Scenario: Remove unused publishing dependencies
- **WHEN** 清理 Sites 接入
- **THEN** 移除 Sites Vite 插件、Cloudflare Vite 插件、Worker 类型及 Wrangler 直接依赖，同步 npm 锁文件；自动检查验证开发/构建配置和语音代理，无真实 ASR 调用

### Requirement: One canonical repository with one user client and operations console
正式工程 SHALL 继续以当前仓库根目录为唯一项目根，并 SHALL 在其中维护运营后台、`apps/miniprogram` 唯一原生用户端、共享核心和现有服务端；小程序目录是同一产品的正式客户端，不得复制成另一个仓库、嵌套 Git 工程或依赖 `ask_job` 的源码和运行配置。

#### Scenario: Locate the official clients
- **WHEN** 开发者从仓库根目录检查工程结构
- **THEN** 运营后台、原生小程序、共享核心和网关均由同一 OpenSpec、锁文件策略与验证入口管理，本机私有配置承载正式 AppID，不依赖其他项目或借用身份

#### Scenario: Start operations development
- **WHEN** 开发者继续运行现有 `npm run dev`
- **THEN** 运营后台固定使用 localhost:3001/admin/topics 和本机网关；不启动退役 H5，不清空旧浏览器 IndexedDB

### Requirement: Cross-platform core and explicit adapters
工程 SHALL 将领域 schema、状态转换、备份格式、话题与 AI 协议保留在不依赖 React、DOM、Node-only API 或微信全局的共享边界；运营后台与小程序 MUST 按各自需要实现存储、网络、Socket、录音、键盘和文件选择适配器。

#### Scenario: Import shared code in both runtimes
- **WHEN** 运营后台、Fastify 或小程序构建共享领域模块
- **THEN** 共享模块不读取 `window`、`document`、IndexedDB、文件系统、`process.env` 或 `wx`，平台能力只从适配器注入

#### Scenario: Detect accidental platform coupling
- **WHEN** 新代码把 React/DOM/Node-only 模块导入小程序共享边界，或把 `wx` 导入网页共享边界
- **THEN** 类型、边界或打包检查失败，不能以开发者工具暂时可运行作为通过

### Requirement: Safe mini-program project configuration
仓库提交的微信项目配置 MUST 不包含借用的真实 AppID、AppSecret、上传密钥或用户私密数据；本机 MAY 通过已忽略的 `project.private.config.json` 配置实际 AppID，常规 npm 和微信 CLI 验证 MUST NOT 自动上传、提审或发布。

#### Scenario: Inspect tracked mini-program files
- **WHEN** 执行 Git 文件与敏感信息检查
- **THEN** 只能看到安全占位 AppID 和无秘密的配置形状，实际 AppID private config 不在跟踪列表中

#### Scenario: Run a local developer-tool check
- **WHEN** 本机微信开发者工具已登录且小程序构建完成
- **THEN** 自动化可以打开、编译或生成本地预览证据，但除非用户另行明确授权，不执行 upload、submit 或 release 类操作

### Requirement: Complete verification covers active runtimes
代码阶段交付和 CI SHALL 在现有 `npm run check` 与 `npm run build` 基础上覆盖共享核心和小程序类型、单元、schema、包体/页面配置及构建检查；微信专属交互 MUST 另有开发者工具和真机证据，且 CI 不配置 AppSecret 或调用计费上游。

#### Scenario: Complete a code implementation stage
- **WHEN** 小程序或共享运行时代码完成一个阶段
- **THEN** 根级 check/build、相关小程序检查和敏感输出审查全部通过后才提交该阶段，未验证真机项在任务与验收记录中保持未完成

#### Scenario: Run in CI without WeChat credentials
- **WHEN** CI 执行完整检查
- **THEN** 使用确定性换码、AI 和 ASR transport 测试成功、失败、取消与边界，不需要真实 AppID/AppSecret、微信登录态或计费凭据
