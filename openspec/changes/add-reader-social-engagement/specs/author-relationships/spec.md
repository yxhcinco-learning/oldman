## Purpose

定义从文章进入作者公开主页、单向关注与双方互关，以及个人中心中的关系与收藏入口；在便于读者持续发现作者已发表文章的同时，明确公开身份、私有关系名单和账号变化时的数据边界。

## ADDED Requirements

### Requirement: Stable public author identity
系统 SHALL 为账号建立与昵称变化无关的稳定公开作者标识，作者主页、关注目标与评论署名链接 MUST 使用该标识而非昵称、OpenID 或私有作品标识。公开资料 SHALL 使用用户名和统一默认头像；文章继续保留投稿时的署名，公开作者主页展示当前用户名，不公开账号的自选头像。

#### Scenario: Open the author after a rename
- **WHEN** 读者从旧署名文章打开已改名作者的主页
- **THEN** 仍定位同一作者并显示其当前用户名，原文章署名不被修改，既有关注关系不丢失或转给他人

#### Scenario: Read the profile without private data
- **WHEN** 游客或其他账号查看作者主页
- **THEN** 仅返回公开资料、关注与粉丝总数、获赠总数及该读者有权查看的已发表文章，不返回私有草稿、作品数量、账号自选头像或关系名单

### Requirement: Mutual following derives from independent directions
系统 SHALL 允许有效账号关注或取消关注其他公开作者，单方向关系 MUST 唯一且不得关注自己；“互相关注” MUST 仅由双方各自有效的单向关注同时存在推导。取消关注只删除自己发起的方向，不要求对方同意，不删除对方的关注，不因打开主页自动关注。

#### Scenario: Follow and follow back
- **WHEN** A 关注 B，B 随后独立关注 A
- **THEN** 第一次仅建立 A 到 B 的关注，第二次双方显示“互相关注”，关注及粉丝数量分别反映实际方向

#### Scenario: Unfollow one direction
- **WHEN** 互相关注时 A 取消对 B 的关注
- **THEN** A 到 B 的关系删除，B 到 A 的关系保留，双方不再显示互关；操作响应丢失重试不重复改变计数

#### Scenario: Reject self following or failed updates
- **WHEN** 用户查看本人主页、伪造自关注请求或关注请求失败
- **THEN** 本人页面不提供自关注操作，服务端拒绝自关注；失败不显示已确认的新关系并保留重试机会

### Requirement: Relationship lists are private to the account
系统 SHALL 在个人中心提供本人的关注、粉丝和互关列表入口，支持真实分页、空态和对应关注操作；关注与粉丝明细 MUST 仅本人可查询。公共作者主页只提供统计与当前读者自己的关系状态，不提供第三方关系名单或通过分页参数枚举他人关系的通道。

#### Scenario: View one's own followers
- **WHEN** 登录用户打开自己的关注、粉丝或互关列表
- **THEN** 展示对应真实关系、公开作者资料及可用关注操作，空列表有清楚说明，重复分页不出现重复作者

#### Scenario: Request another person's relationship list
- **WHEN** 游客或登录用户替换目标标识请求其他人的关注、粉丝或互关明细
- **THEN** 拒绝读取明细，不能通过计数接口或作者主页响应得到隐藏名单

### Requirement: Personal engagement entries preserve the writing center
个人中心 SHALL 在保留现有资料编辑、创作入口和文章摘要的基础上，提供我的收藏、我的小花花、关注和粉丝入口；这些内容 MUST 绑定当前有效账号，正常页面不把库存、关系或收藏读失败误报为没有数据。退出、会话失效或切换账号后 SHALL 隐藏旧账号私有互动数据并丢弃迟到响应。

#### Scenario: Return to saved reading
- **WHEN** 用户从个人中心打开收藏并选择仍可阅读的文章
- **THEN** 进入当前公开版，返回保留对应列表位置；失效文章有占位和取消收藏入口，不跳转到作者私有编辑器

#### Scenario: Switch accounts during a list request
- **WHEN** 读取收藏、库存或关系列表期间退出或换账号
- **THEN** 旧数据立即隐藏，旧请求返回后不能填入新账号页面；网络失败保留错误与重试，不显示伪造的零库存或空列表
