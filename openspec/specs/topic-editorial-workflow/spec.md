> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

# topic-editorial-workflow Specification

## Purpose
定义内部编辑从引子或手稿、DeepSeek 候选、人工审核到修订、五席排期、发布与下线的持久化安全闭环。
## Requirements
### Requirement: Persistent editorial catalog
系统 SHALL 将话题稳定标识、完整修订、生成记录、首页席位、管理员会话和审计持久化到独立 SQLite；正式修订 MUST 不可原地改写，数据库不可用时热门与后台 MUST 失败关闭且不得回退静态种子。

#### Scenario: Import the reviewed seed catalog
- **WHEN** 新话题库首次初始化
- **THEN** 系统在单一幂等迁移中保留既有 21 条话题的标识、修订和发布时间，并建立当前首批五个显式首页席位，重复启动不重复数据

#### Scenario: Edit after publication
- **WHEN** 编辑希望修改已经发布的话题
- **THEN** 系统从最新正式修订创建更高版本候选，原正式修订与已有用户快照保持不变

#### Scenario: Topic database cannot be trusted
- **WHEN** 数据库路径、schema version、完整性或迁移失败
- **THEN** 话题与后台接口返回不含内部细节的 503，文章、AI、语音和本机作品继续工作，服务不读取种子假装成功

### Requirement: Seed-to-candidate generation
后台 SHALL 接受文字、链接或两者作为编辑引子，并 SHALL 通过一次显式 DeepSeek Responses 请求生成一套结构化候选；联网搜索默认开启但可关闭，模型结果 MUST 只进入候选并由人工确认后才能发布。

#### Scenario: Generate from text and links
- **WHEN** 编辑提供不超过 6000 字引子及零到五个 HTTP(S) 链接并点击生成
- **THEN** 系统至多发送一个顶层请求，返回可编辑的类型、标题、摘要、内部判断、相关切面、采访首问、标签、建议有效期和可选来源，且不自动发布

#### Scenario: Use or disable web search
- **WHEN** 编辑保持联网开启
- **THEN** 系统向 DeepSeek Responses API 提供 `web_search`，含链接时要求阅读链接、纯文本时允许按需补充搜索；编辑关闭联网时请求不得声明或触发搜索工具

#### Scenario: Submit link-only input without search
- **WHEN** 编辑只提供链接并关闭联网搜索
- **THEN** 系统在调用模型前拒绝请求并保留输入，说明需要开启联网或补充文字

#### Scenario: Generation fails
- **WHEN** 上游未配置、超时、限流、鉴权失败、格式错误或候选未通过 schema
- **THEN** 系统保存固定失败类别与允许的用量信息，不保存 reasoning、不重试计费请求，并允许编辑重试或改用手工草稿

### Requirement: Human-controlled editorial lifecycle
后台 SHALL 允许登录编辑修改草稿或候选、预览、拒绝、立即或定时发布、创建更正及提前下线；发布确认 MUST 是唯一公开入口，来源 MAY 为空。

#### Scenario: Publish a reviewed candidate
- **WHEN** 编辑完成必填内容核对并为候选选择席位与生效时间
- **THEN** 系统在事务中冻结正式修订、记录审核者和排期，只有达到生效时间后才进入公开接口

#### Scenario: Publish without external sources
- **WHEN** 编辑确认一个来源数组为空的完整候选
- **THEN** 系统允许发布并保留真实空数组，后台预览和用户端都不得虚构外部来源

#### Scenario: Reject or archive content
- **WHEN** 编辑拒绝候选或提前下线正式话题
- **THEN** 系统保留修订和审计；拒绝内容从未公开，归档内容停止进入公开列表和详情

#### Scenario: Encounter concurrent editing
- **WHEN** 后台以过期 revision token 保存或操作候选
- **THEN** 系统返回 409 并保留服务端新状态，界面提供刷新或复制本地内容的补救，不静默覆盖

### Requirement: Explicit five-slot scheduling
后台 SHALL 提供编号 1–5 的首页席位并按开始、结束时间计算可见性；同一席位的时间段 MUST 不重叠，空缺 MUST 保持为空而不得自动补位。

#### Scenario: Schedule a future topic
- **WHEN** 编辑把正式修订排入未来时间的空闲席位
- **THEN** 公开列表在开始时间前不返回该话题，到时无需常驻任务即可按席位顺序返回，到期后自动移除

#### Scenario: Attempt an overlapping placement
- **WHEN** 新排期与同一席位已有时间范围重叠
- **THEN** 系统以 409 拒绝整个事务并显示冲突排期，不截断或替换原内容

#### Scenario: Leave a slot empty
- **WHEN** 席位到期且没有接档排期
- **THEN** 热门列表少于五条并保持其他席位相对顺序，不按类型、时间或行为数据补齐

### Requirement: Independent single-editor administration
后台 SHALL 使用独立单编辑身份、服务端会话和 CSRF 防护；管理员密码 MUST 为 6–1024 个字符并只以 scrypt 散列进入服务端配置，密码、会话、Cookie、密钥和用户文章 MUST 不进入审计或操作日志。

#### Scenario: Generate the shortest valid credential
- **WHEN** 管理员在交互式散列工具中输入六个字符的密码
- **THEN** 系统生成既有 scrypt 格式的散列且不回显明文，并拒绝五个字符或超过 1024 个字符的输入

#### Scenario: Establish and end an admin session
- **WHEN** 配置有效管理员凭据并通过独立登录页认证
- **THEN** 系统签发 HttpOnly、SameSite 严格且生产环境 Secure 的短期会话，显式退出、到期或密码散列轮换后不可继续使用

#### Scenario: Reject unauthorized mutation
- **WHEN** 管理写请求缺少有效会话、精确 Origin、JSON Content-Type、CSRF token 或当前 revision token
- **THEN** 系统在执行数据库或 AI 操作前以 401、403、415 或 409 拒绝，并只记录固定错误类别

#### Scenario: Use the admin on supported screens
- **WHEN** 编辑在桌面或窄屏手机打开后台
- **THEN** 桌面可完成生成、编辑、预览和排期，手机以单列保持查看、调整排期和提前下线操作可达，后台不进入产品导航或小程序

### Requirement: Non-sensitive editorial audit
系统 SHALL 为登录、生成、保存、拒绝、发布、更正、排期和归档记录操作者、动作、实体、时间及非敏感差异摘要，并 MUST 不记录凭据、令牌、密钥、模型 reasoning 或用户作品内容。

#### Scenario: Review editorial history
- **WHEN** 编辑查看话题修订、AI 生成或操作历史
- **THEN** 后台按时间显示允许的审计元数据、模型用量和固定失败类别，且可追溯哪次人工确认形成正式修订

### Requirement: Standard administrative workspace
话题后台 SHALL 使用区别于用户端阅读视觉的成熟企业管理布局：深色固定侧栏、白色顶栏、浅灰工作区、系统无衬线、标准 SVG 图标、紧凑工具栏、状态标签和有边界的数据区域；登录后的工作台 SHALL 只聚合现有话题、席位、操作与能力数据，不得虚构趋势或用户指标。

#### Scenario: Review the dashboard
- **WHEN** 编辑登录后进入后台工作台
- **THEN** 页面在统一后台壳层内显示可验证的话题状态数量、当前首页席位、近期更新、服务配置概况和通往主要任务的快捷入口

#### Scenario: Manage topics on a desktop
- **WHEN** 编辑在 1280×900 或 1440×900 打开话题内容
- **THEN** 页面以全宽数据表格和同一行筛选工具栏显示标题、类型、状态、修订、发布时间与操作，且无页面横向滚动

#### Scenario: Open a topic detail
- **WHEN** 编辑从表格选择一个话题
- **THEN** 系统打开具有固定标题和独立滚动区的右侧详情抽屉，在其中提供编辑、真实用户端预览、修订记录和既有审核发布操作，关闭后仍保留列表筛选与滚动上下文

#### Scenario: Work on a phone
- **WHEN** 编辑在 390×844 打开后台
- **THEN** 顶栏菜单可展开分组导航，数据表格转换为带字段标签的可读列表行，详情抽屉占满可见宽度，控件保持至少 44px 点击区，排期和紧急下线无页面横向滚动且仍可达

#### Scenario: Navigate all operational modules
- **WHEN** 编辑在工作台、话题内容、生成与新建、首页排期、生成与审计和运行监控之间切换
- **THEN** 各模块共享一致的面包屑、页面标题、工具栏、加载、空态、持续错误反馈和操作层级，运行监控仍明确只显示当前进程匿名聚合并与不可变审计区分

### Requirement: Daily topic generation budget guard
后台话题生成 SHALL 在顶层 DeepSeek Responses 请求前使用独立话题 AI 日预算；联网生成 MUST 保守覆盖服务端搜索可能扩展的模型上下文。额度拒绝 MUST 保留编辑引子、写入固定失败类别且不得创建候选、自动重试或影响手工草稿。

#### Scenario: Topic generation budget is unavailable
- **WHEN** 编辑提交有效引子但话题 AI 当日余额不足或用量账本不可用
- **THEN** 系统在访问 DeepSeek 前返回 429 或 503，生成记录标记 `daily_budget_exhausted` 或 `cost_governance_unavailable`，表单输入仍在且手工新建可用

#### Scenario: Settle topic response usage
- **WHEN** Responses 请求返回成功候选和 usage
- **THEN** 系统按实际输入/输出结算并释放未使用预留，既有生成记录继续保存 token 与搜索调用数但用量账本不保存引子、链接或候选内容
