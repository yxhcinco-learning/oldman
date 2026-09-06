## MODIFIED Requirements

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

#### Scenario: Match the current speech design
- **WHEN** 正文语音处于空闲、准备、录音、收尾、失败、待确认或修改状态
- **THEN** 小程序遵循 DESIGN-SYSTEM.md 定义的 52px 文字切换入口、实时波形与右侧状态、76px 麦克风、取消/完成及继续补充提示；待确认状态只以勾选和编辑图标表达操作，不另造放大的文字按钮，任一中间状态均不提前写入正文

#### Scenario: Use the XiaoWen composer on a short screen
- **WHEN** 用户打开小文、点击输入框或查看历史/关闭操作
- **THEN** 输入框、48px 语音操作和72px发送操作保持同一基线且占位文案垂直居中，禁用发送仍保留产品配色，标题栏操作有清楚间距且关闭按钮不出现额外描边

### Requirement: Stable mini-program bottom actions
话题详情等非 tab 页面需要常驻的底部主操作 MUST 固定在当前可用视口及安全区内，不得依赖会随页面回弹或惯性滚动产生位移的 sticky 容器；正文 MUST 预留等量空间且按钮尺寸、文字居中和左右边距 SHALL 遵循现行小程序设计规范。

#### Scenario: Scroll a long topic detail
- **WHEN** 用户滚动、回弹或快速滑动长话题详情
- **THEN** “直接写 / 接受小文采访”始终固定在视口底部安全区，按钮不发生上下漂移、变形或横向越界，最后一条来源仍可滚动到操作区上方
