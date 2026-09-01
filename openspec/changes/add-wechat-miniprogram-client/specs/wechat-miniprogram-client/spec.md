## ADDED Requirements

### Requirement: Native mini-program product shell
系统 SHALL 提供原生微信小程序客户端，并 MUST 以“热门 / 文章 / 我的”作为固定底部导航，默认进入热门；页面名称、信息层级、真实空态和适老点击目标 SHALL 与当前正式版语义一致，不得通过 WebView、模拟数据或虚构账号资料替代正式功能。

#### Scenario: Open the mini program for the first time
- **WHEN** 用户首次打开小程序且本地没有作品
- **THEN** 系统进入“热门”，显示真实审核内容或真实不可用状态；“文章”提供固定可见的“开始写作”，“我的”只显示本地作品与备份等真实入口

#### Scenario: Switch the primary destination
- **WHEN** 用户在“热门 / 文章 / 我的”之间切换
- **THEN** 当前页面状态、作品草稿和话题请求分别保留，底部导航以图标、文字和当前态共同表达目的地且每项点击目标不少于 48px

### Requirement: Existing writing journeys remain available
小程序 SHALL 覆盖普通新建与续写、话题直接写、接受小文采访、采访整理、正文会话、候选预览/应用/放弃、修改记录、回收站和备份恢复；背景、用户素材、AI 候选和已确认正文 MUST 继续分层，任何进入、切换或关闭动作不得静默成文或改写正文。

#### Scenario: Start from a topic
- **WHEN** 用户从已审核话题选择“直接写”或“接受小文采访”
- **THEN** 两条路径进入同一作品语义；直接写只提供可收起背景，采访先显示静态身份说明并一次处理一个回答，打开本身不调用 AI

#### Scenario: Use XiaoWen on an existing article
- **WHEN** 用户在已有文章中向小文发送问题或明确修改要求
- **THEN** 请求、回答、失败和候选状态在同一文章会话展示；完整候选必须经过全文预览和明确应用才改变正文，关闭面板不自动取消仍在进行的请求

#### Scenario: Open the full-screen XiaoWen interview
- **WHEN** 用户从话题进入小程序的小文采访
- **THEN** 页面保持原生全屏形态，单一页头显示“小文访谈”且不再重复提供“收起”；话题行、叶片头像、消息气泡和固定输入区沿用 H5 的层级与间距，首次开场只显示“您好，我是小文，您的写作助手。接下来我们围绕这个话题聊一聊。”以及“先请您简单介绍一下自己吧。”两条短消息；有回答后“换个问题”位于当前问题气泡内部并与问题文字左缘对齐，“整理成文章”位于输入行上方并靠内容右缘；输入区在键盘关闭后回到底部安全区，占位文字垂直居中，禁用发送保持清楚的产品状态而非微信原生或近乎消失的样式

#### Scenario: Leave a content-free first interview
- **WHEN** 用户首次进入采访后没有回答、未发送文字、会话结果或进行中请求并关闭小文
- **THEN** 系统返回热门且不把只有话题背景的临时草稿加入文章列表

### Requirement: Platform-native editor interaction
小程序 SHALL 以原生文本输入、触摸、键盘高度与安全区能力实现标题、正文和小文输入，MUST 保留明显的语音/文字切换主路径以及长按正文录音；无法可靠提供的浏览器 DOM 光标手势可以降级，但不得让用户无法通过可见操作完成同一编辑目标。

#### Scenario: Switch between voice and text
- **WHEN** 用户点击底部语音/文字切换按钮
- **THEN** 编辑器切换到对应原生输入方式，不自动开始录音、不丢失正文或待确认转写，文字态使用可见的原生编辑控件

#### Scenario: Use an unsupported precision gesture
- **WHEN** 用户在微信平台尝试浏览器版用于精确字符落点的双击或长按，而平台不能可靠返回字符坐标
- **THEN** 系统进入目标段落或文末的文字编辑状态并保留可见切换入口，不伪造错误光标、不逐字渲染造成长文不可用

#### Scenario: Open the system keyboard on a short screen
- **WHEN** 系统键盘弹出、收起或高度改变
- **THEN** 当前输入和主操作保持可见，页面按微信键盘事件和安全区调整，不遮挡发送、完成或取消操作且不产生横向溢出

#### Scenario: Avoid double keyboard displacement
- **WHEN** Android 或 iOS 微信已经通过可用窗口高度变化避让键盘，同时输入组件又上报键盘高度
- **THEN** 小程序只补偿尚未由窗口缩小覆盖的高度，不把标题、待确认语音或小文弹层重复上推到状态栏/胶囊之下；有产品内“完成/发送”操作的输入不再显示微信 textarea 默认确认栏

#### Scenario: Match the established H5 voice states
- **WHEN** 正文语音处于空闲、准备、录音、收尾、失败、待确认或修改状态
- **THEN** 小程序复用 H5 的 52px 文字切换入口、实时波形与右侧状态、76px 麦克风、取消/完成及继续补充提示；待确认状态只以勾选和编辑图标表达操作，不另造放大的文字按钮，任一中间状态均不提前写入正文

#### Scenario: Use the XiaoWen composer on a short screen
- **WHEN** 用户打开小文、点击输入框或查看历史/关闭操作
- **THEN** 输入框、48px 语音操作和72px发送操作保持同一基线且占位文案垂直居中，禁用发送仍保留产品配色，标题栏操作有清楚间距且关闭按钮不出现额外描边

### Requirement: Stable mini-program bottom actions
话题详情等非 tab 页面需要常驻的底部主操作 MUST 固定在当前可用视口及安全区内，不得依赖会随页面回弹或惯性滚动产生位移的 sticky 容器；正文 MUST 预留等量空间且按钮尺寸、文字居中和左右边距 SHALL 与 H5 一致。

#### Scenario: Scroll a long topic detail
- **WHEN** 用户滚动、回弹或快速滑动长话题详情
- **THEN** “直接写 / 接受小文采访”始终固定在视口底部安全区，按钮不发生上下漂移、变形或横向越界，最后一条来源仍可滚动到操作区上方

### Requirement: Local work remains usable without online identity
小程序 SHALL 在启动时后台尝试建立微信业务会话，但 MUST NOT 把登录、话题、AI 或语音服务成功作为查看和编辑本地作品的前置条件；在线失败 MUST 只影响相应在线能力。

#### Scenario: Launch offline with saved work
- **WHEN** 用户离线打开已有本地作品且业务 token 已失效或微信换码失败
- **THEN** 作品列表、正文编辑、回收站和本地备份仍可使用；热门刷新、AI 和语音显示具体在线不可用状态且不删除本地内容

#### Scenario: Recover online capability
- **WHEN** 网络恢复且系统取得新的有效业务会话
- **THEN** 后续话题、AI 和语音请求恢复，不要求用户填写账号资料、不重建或迁移本地作品

### Requirement: Web and mini-program clients coexist
系统 SHALL 继续交付现有 React/Vinext 网页端，小程序新增或失败不得改变网页 IndexedDB、浏览器交互、Basic Auth 体验入口或原有 API 契约；共享业务规则变更 MUST 由两个客户端的契约测试共同覆盖。

#### Scenario: Build both clients
- **WHEN** 在仓库根目录执行完整检查和构建
- **THEN** 网页与小程序的类型、单元、边界和打包检查均执行；任一客户端失败都会使完整验证失败，但不会删除另一客户端的本地数据

#### Scenario: Update a shared rule
- **WHEN** 字数上限、备份 schema、候选状态或话题协议发生共享变更
- **THEN** 网页和小程序使用同一核心定义或同一生成产物并各自回归，不维护两套未经校验的业务常量
