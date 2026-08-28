## ADDED Requirements

### Requirement: Approved interface fidelity
工程 SHALL 以已验收设计基线（Git 提交 28fd5e4）为界面回归基准；除已批准的真实状态和数据能力外，不新增功能或常驻入口，不因产品化改变原卡片、编辑器及语音区域的布局。

#### Scenario: Open the real work library
- **WHEN** 用户查看真实作品首页
- **THEN** 卡片沿用已验收的内边距、标题和右对齐时间/继续写，不展示卡片更多按钮或下方回收站、体验 AI 演示快捷入口；时间按真实本地日期显示，状态不虚构完成进度

#### Scenario: Access approved data tools
- **WHEN** 用户打开首页现有的更多入口
- **THEN** 可以备份、恢复、管理及回收作品；关闭后首页结构不改变，既有作品数据不删除

#### Scenario: Write or enter a demo
- **WHEN** 用户编辑正文、单段或进入聊天/优化演示
- **THEN** 编辑器不增加保存工具行，保存状态复用原控件与反馈；单段提示和字数沿用已验收设计，演示仅保留必要隔离标识，不影响真实内容

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
工程 SHALL 在 AGENTS 中维护规范入口、工作流程、权限安全和验证交付规则，将产品状态、实现细节、阶段结论及完成状态保留在对应文档；日常直接在 main 开发，不强制创建功能分支或 PR。

#### Scenario: Complete a checked change
- **WHEN** 一个小阶段通过相应检查
- **THEN** 明确暂存本任务文件并自动本地提交，以 OpenSpec 和检查证据记录变更，不要求先创建分支或 PR，不自动推送或合并

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
