## MODIFIED Requirements

### Requirement: Approved interface fidelity
工程 SHALL 以现行 DESIGN-SYSTEM.md 与已确认 OpenSpec 为小程序界面依据，运营后台保持独立设计；Git 提交 28fd5e4 仅是历史来源，不是当前像素基线，不恢复演示或退役 H5 入口。

#### Scenario: Review a current product screen
- **WHEN** 调整作品、语音、小文或数据工具界面
- **THEN** 按现行小程序设计及真实状态验收，保留适老触控、保存与错误补救；运营后台单独做浏览器回归

#### Scenario: Locate a historical preview
- **WHEN** 查阅归档模拟页面或设计截图
- **THEN** 仅用于追溯，不作为产品依赖、当前要求或测试通过证据

### Requirement: One canonical repository with one user client and operations console
正式工程 SHALL 继续以当前仓库根目录为唯一项目根，并 SHALL 在其中维护运营后台、`apps/miniprogram` 唯一原生用户端、共享核心和现有服务端；小程序目录是同一产品的正式客户端，不得复制成另一个仓库、嵌套 Git 工程或依赖 `ask_job` 的源码和运行配置。

#### Scenario: Locate the official clients
- **WHEN** 开发者从仓库根目录检查工程结构
- **THEN** 运营后台、原生小程序、共享核心和网关均由同一 OpenSpec、锁文件策略与验证入口管理，本机私有配置承载正式 AppID，不依赖其他项目或借用身份

#### Scenario: Start operations development
- **WHEN** 开发者继续运行现有 `npm run dev`
- **THEN** 运营后台固定使用 localhost:3001/admin/topics 和本机网关；不启动退役 H5，不清空旧浏览器 IndexedDB

### Requirement: Safe mini-program project configuration
仓库提交的微信项目配置 MUST 不包含借用的真实 AppID、AppSecret、上传密钥或用户私密数据；本机 MAY 通过已忽略的 `project.private.config.json` 配置实际 AppID，常规 npm 和微信 CLI 验证 MUST NOT 自动上传、提审或发布。

#### Scenario: Inspect tracked mini-program files
- **WHEN** 执行 Git 文件与敏感信息检查
- **THEN** 只能看到安全占位 AppID 和无秘密的配置形状，实际 AppID private config 不在跟踪列表中

#### Scenario: Run a local developer-tool check
- **WHEN** 本机微信开发者工具已登录且小程序构建完成
- **THEN** 自动化可以打开、编译或生成本地预览证据，但除非用户另行明确授权，不执行 upload、submit 或 release 类操作
