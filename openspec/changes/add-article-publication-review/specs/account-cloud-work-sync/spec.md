## MODIFIED Requirements

### Requirement: Optional private profile
系统 SHALL 支持用户主动选择私有头像和修改唯一展示用户名；MUST 鉴权读写、限制输入并去除头像元数据，失败保留旧资料。未自定义时自动分配“岁月作者＋数字编号”，沿用 nickname 接口字段；当前及历史名字 MUST 保留原账号归属，数据库保证规范化后的唯一性。公开文章只使用投稿时的名字及系统默认头像。

#### Scenario: Cancel or invalid profile
- **WHEN** 用户取消选择、拒绝平台授权、上传超限或图片无法解码
- **THEN** 不改变原头像用户名，不阻塞写作，不生成公开原图地址

#### Scenario: Duplicate or historical username
- **WHEN** 两账号同时选择同名或尝试使用另一账号历史名字
- **THEN** 至多原归属账号成功，其余收到重名提示且保留原用户名；原账号能改回旧名

#### Scenario: Migrate existing names
- **WHEN** 升级含空名字或规范化重名的旧账号数据
- **THEN** 有效不重名名字保留，重名按账号创建顺序确定保留者，其他名字补数字且不影响作品归属

## ADDED Requirements

### Requirement: Work deletion revokes publication atomically
系统 MUST 在原有云作品删除事务内撤销待审和公开版本；不能仅由新客户端先发撤回请求保证一致性。恢复不重新发表，永久删除同时清除投稿正文和专属封面。

#### Scenario: Legacy client deletes published work
- **WHEN** 旧客户端通过已有私有作品接口删除已发表作品
- **THEN** 同一事务撤销公开及待审内容，失败保留原稿，旧审核和操作重试不能复活公开文章
