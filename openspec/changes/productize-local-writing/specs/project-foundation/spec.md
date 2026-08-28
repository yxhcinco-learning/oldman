## ADDED Requirements

### Requirement: Approved V2 interface fidelity
工程 SHALL 以 demo-approved-v2 为界面回归基准；除已批准的真实状态和数据能力外，不新增功能或常驻入口，不因产品化改变原卡片、编辑器及语音区域的布局。

#### Scenario: Open the real work library
- **WHEN** 用户查看真实作品首页
- **THEN** 卡片沿用 V2 的内边距、标题和右对齐时间/继续写，不展示卡片更多按钮或下方回收站、体验 AI 演示快捷入口；时间按真实本地日期显示，状态不虚构完成进度

#### Scenario: Access approved data tools
- **WHEN** 用户打开 V2 原有的首页更多入口
- **THEN** 可以备份、恢复、管理及回收作品；关闭后首页结构不改变，既有作品数据不删除

#### Scenario: Write or enter a demo
- **WHEN** 用户编辑正文、单段或进入聊天/优化演示
- **THEN** 编辑器不增加保存工具行，保存状态复用原控件与反馈；单段提示和字数沿用 V2，演示仅保留必要隔离标识，不影响真实内容

### Requirement: Reversible scoped development
工程 SHALL 保留 demo-approved-v2 基线及其后正式版本，遵循 AGENTS 和 OpenSpec，源码不包含缓存、密钥、原音或私密正文。按用户确认将正式 V2 平铺迁至 D:/vibe_code/oldman，后续仅在该根目录开发。

#### Scenario: Cleanup and verification
- **WHEN** 清理或重构 Demo
- **THEN** 每个验证小阶段主动本地提交；原 Demo 经核对且用户明确确认后清理，线上站点不改变

### Requirement: Single canonical project root
正式工程 SHALL 直接位于 D:/vibe_code/oldman 根目录，不嵌套 V2 子目录、不混合 V1 文件，不保留第二个活动工程目录。

#### Scenario: Replace the retired V1 checkout
- **WHEN** 按用户确认迁移正式 V2
- **THEN** 确认 V1 无独有配置、未提交改动或本地用户数据后，按用户明确要求直接删除 V1 内容及多余旧版备份，不另存退役目录；完整迁入 V2 的源码、Git 历史、隐藏配置和本地文件，校验完成后移除空的旧 V2 目录，不递归删除当前工作区根目录

#### Scenario: Restart from the canonical root
- **WHEN** 在 D:/vibe_code/oldman 启动服务
- **THEN** AGENTS、OpenSpec、依赖及 .env.local 均位于此根目录，文档命令不再引导至旧 V2 路径；仍使用 localhost:3001，不清空或迁移浏览器作品库，不发布线上站点

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
