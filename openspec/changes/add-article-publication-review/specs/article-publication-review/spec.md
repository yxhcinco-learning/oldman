## Purpose

定义作者从私有写作进入封面设置、署名预览、人工投稿审核及好友分享的闭环，约束公开版本、用户名归属、图片权限和删除行为，保证未投稿正文及会话始终隔离且验收证据可追溯。

## ADDED Requirements

### Requirement: Preview before explicit submission
系统 SHALL 保存当前正文后进入发表设置，要求非空标题、已确认正文和作者必选封面；预览 MUST 显示实际署名、默认头像、裁切效果和适用 AI 标识。修改用户名后返回同篇预览。发表前 MUST 核对云作品、设置及署名版本，只冻结明确确认的内容。

#### Scenario: Save or submit fails
- **WHEN** 保存、上传、版本核对或提交失败
- **THEN** 保留正文及发表设置，提供重试，不显示投稿成功；取消或返回不创建新作品

#### Scenario: Private inputs remain private
- **WHEN** 正文旁还有未采用候选、待确认语音、未发送小文输入或访谈素材
- **THEN** 投稿及公开预览不包含这些数据，仅包含已确认正文及最小 AI 来源标识

### Requirement: Durable controlled cover images
系统 MUST 持久保存账号隔离的封面和裁切设置，提供 1:1 列表图及 5:4 阅读与好友分享图的移动缩放裁切。上传最多 8MiB、解码最多 4000 万像素，规范化主图长边最多 2048px，去除元数据且不开放原始图片；发表内容和图片占用独立每账号 100MiB 配额，七天后清理无设置或投稿引用的上传。

#### Scenario: Image and session failures
- **WHEN** 图片损坏、超限、取消选图、上传中断、应用重启或会话被接管
- **THEN** 已保存的正文与旧封面仍保留，迟到结果不能写入其他账号；无有效权限不能读取或上传图片

#### Scenario: Cancel a replacement or resume cropping
- **WHEN** 作者更换原图或调整已有裁切后取消，或在确认前重启
- **THEN** 取消恢复操作前封面；未取消的裁切进度持久保留并可继续，两种比例分别确认后才更新发表预览；只调整一种时保留另一种结果

### Requirement: Immutable manually reviewed publication
系统 MUST 将私有工作稿、固定投稿快照和当前公开版分开；每篇最多一份待审稿、一个稳定公开 ID。所有账号 SHALL 人工审核，不提供自动通过。重复操作 MUST 幂等并拒绝同操作 ID 不同内容。

#### Scenario: Revision submitted and rejected
- **WHEN** 已发表文章改稿并再次提交，随后被驳回
- **THEN** 原公开版继续有效；作者看到驳回原因，修改后可重新投稿，通过后替换原文章而非新增卡片

#### Scenario: Withdrawal races review
- **WHEN** 作者撤回、管理员下架或作品删除与旧审核操作竞态
- **THEN** 版本核对和事务只允许有效操作，撤回发表或下架同时取消待审稿，旧请求不能重新公开

### Requirement: Scoped manual administration
后台 SHALL 提供待审列表、完整投稿预览、通过、驳回、已发表列表和下架；驳回及下架必须提供简短原因。MUST 沿用独立管理员身份、Origin、CSRF 和并发保护，并记录动作、版本、操作者及时间。

#### Scenario: Administrator attempts private access
- **WHEN** 管理员读取未投稿作品、未投稿封面或作者后续私有改稿
- **THEN** 拒绝访问；审核只能看到已提交快照，不能修改作者原文，普通用户不能调用审核接口

### Requirement: Authenticated public reading and friend sharing
文章 Tab SHALL 展示真实已审核内容，按首次发表时间倒序每页 20 篇；公开详情及图片 MUST 验证有效登录和当前发表状态。好友分享只使用已发表标题、处理后的封面和稳定文章 ID，登录后返回原文章。

#### Scenario: Empty list and unavailable service differ
- **WHEN** 列表请求成功且没有已审核文章
- **THEN** 显示“还没有发表的文章”的正常空状态，保留写作入口，不显示文章失效提示或示例文章
- **WHEN** 列表接口尚未部署、网络失败或服务异常
- **THEN** 显示列表读取失败及可操作的重试，不把错误伪装成空库，不复用单篇文章的“这篇文章暂时无法查看”提示

#### Scenario: Shared article becomes unavailable
- **WHEN** 分享接收者打开已撤回、下架或删除文章
- **THEN** 不返回正文或公开图片，显示统一不可用提示；不保证回收微信已发送卡片缓存

#### Scenario: Logged out reader opens shared link
- **WHEN** 接收者未登录打开有效好友分享
- **THEN** 登录后返回目标文章，读取当前公开版，不进入作者编辑页面或匿名网页

### Requirement: Publication lifecycle preserves private recovery
作品删除 MUST 在线事务撤销待审和公开内容，失败不删除原稿；回收站恢复不自动发表。永久删除 SHALL 清除在线投稿正文及专属图片，只保留无正文必要记录。JSON v6 SHALL 保持文字和会话备份，不包含封面或投稿身份。

#### Scenario: Import or restore a work
- **WHEN** 导入备份或恢复回收站文章
- **THEN** 作品保持私有，导入创建新 ID 并需重新选封面，不能借历史回执或旧审核使文章公开

### Requirement: Evidence separates simulated and actual use
系统 SHALL 以真实本地 HTTP、SQLite、图片处理和两个隔离客户端验证服务闭环，运行完整检查、构建、小程序三尺寸和后台三尺寸回归；手机选图及好友实际收发 MUST 单列证据。

#### Scenario: Device evidence is unavailable
- **WHEN** 本地检查通过而实际手机或好友收发未完成
- **THEN** 对应任务保持未完成、变更保持活跃，不以模拟结果宣称真机通过，不自动部署
