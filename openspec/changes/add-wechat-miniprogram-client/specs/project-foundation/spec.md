## ADDED Requirements

### Requirement: One canonical repository with two official clients
正式工程 SHALL 继续以当前仓库根目录为唯一项目根，并 SHALL 在其中维护现有网页端、`apps/miniprogram` 原生小程序、共享核心和现有服务端；小程序目录是同一产品的正式客户端，不得复制成另一个仓库、嵌套 Git 工程或依赖 `ask_job` 的源码和运行配置。

#### Scenario: Locate the official clients
- **WHEN** 开发者从仓库根目录检查工程结构
- **THEN** 网页、原生小程序、共享核心和网关均由同一 OpenSpec、锁文件策略与验证入口管理，`ask_job` 只提供临时 AppID 参考且不被修改

#### Scenario: Start web development
- **WHEN** 开发者继续运行现有 `npm run dev`
- **THEN** 网页仍固定使用 localhost:3001 和现有本机网关，新增小程序目录不改变或清空浏览器 IndexedDB

### Requirement: Cross-platform core and explicit adapters
工程 SHALL 将领域 schema、状态转换、备份格式、话题与 AI 协议保留在不依赖 React、DOM、Node-only API 或微信全局的共享边界；网页和小程序 MUST 分别实现存储、网络、Socket、录音、键盘和文件选择适配器。

#### Scenario: Import shared code in both runtimes
- **WHEN** 网页、Fastify 或小程序构建共享领域模块
- **THEN** 共享模块不读取 `window`、`document`、IndexedDB、文件系统、`process.env` 或 `wx`，平台能力只从适配器注入

#### Scenario: Detect accidental platform coupling
- **WHEN** 新代码把 React/DOM/Node-only 模块导入小程序共享边界，或把 `wx` 导入网页共享边界
- **THEN** 类型、边界或打包检查失败，不能以开发者工具暂时可运行作为通过

### Requirement: Safe mini-program project configuration
仓库提交的微信项目配置 MUST 不包含借用的真实 AppID、AppSecret、上传密钥或用户私密数据；本机 MAY 通过已忽略的 `project.private.config.json` 配置临时 AppID，常规 npm 和微信 CLI 验证 MUST NOT 自动上传、提审或发布。

#### Scenario: Inspect tracked mini-program files
- **WHEN** 执行 Git 文件与敏感信息检查
- **THEN** 只能看到安全占位 AppID 和无秘密的配置形状，临时真实 AppID private config 不在跟踪列表中

#### Scenario: Run a local developer-tool check
- **WHEN** 本机微信开发者工具已登录且小程序构建完成
- **THEN** 自动化可以打开、编译或生成本地预览证据，但除非用户另行明确授权，不执行 upload、submit 或 release 类操作

### Requirement: Complete verification covers both runtimes
代码阶段交付和 CI SHALL 在现有 `npm run check` 与 `npm run build` 基础上覆盖共享核心和小程序类型、单元、schema、包体/页面配置及构建检查；微信专属交互 MUST 另有开发者工具和真机证据，且 CI 不配置 AppSecret 或调用计费上游。

#### Scenario: Complete a code implementation stage
- **WHEN** 小程序或共享运行时代码完成一个阶段
- **THEN** 根级 check/build、相关小程序检查和敏感输出审查全部通过后才提交该阶段，未验证真机项在任务与验收记录中保持未完成

#### Scenario: Run in CI without WeChat credentials
- **WHEN** CI 执行完整检查
- **THEN** 使用确定性换码、AI 和 ASR transport 测试成功、失败、取消与边界，不需要真实 AppID/AppSecret、微信登录态或计费凭据
