## MODIFIED Requirements

### Requirement: Preserve real product capabilities
第二阶段 SHALL 在我的页展示真实微信登录、可选头像昵称、同步状态、作品/回收站/备份和退出入口；游客使用默认展示，云作品区分本地保存与云确认，不显示虚构账号数据。以下既有真实能力规则继续适用，其仅本机文案改为随实际保存状态显示。

视觉迁移 MUST 保留原生文字输入、真实作品时间与字数、本机保存/恢复、删除恢复和导出备份，不导入预览业务状态或示例数据，不修改语音协议。已确认的文章 AI 会话升级 MAY 事务新增存储，但 MUST 保留已有正文、草稿和旧备份导入能力。

#### Scenario: Existing and empty libraries
- **WHEN** 首次打开空库或打开已保存的作品
- **THEN** 空库不出现虚构作品，已有记录原样读取；长标题与时间在新卡片中可读

#### Scenario: Persistence fails
- **WHEN** 自动保存、恢复或管理操作失败
- **THEN** 错误持续可见，保留重试和导出入口；不假报成功、不清空内存或原存储

#### Scenario: Real personal center
- **WHEN** 用户登录或退出微信账号
- **THEN** 个人中心同步显示实际账号状态，不增加手机号或强制填写资料

