## ADDED Requirements

### Requirement: Backups exclude unwritten new context
JSON备份 SHALL 使用与作品保存一致的内容边界，未开始写作的新话题、模式及系统开场 MUST NOT 被导出为文章；真实输入、会话记录和原有作品 MUST 完整保留，包括用户明确清空后的最新编辑。

#### Scenario: Export before saying anything
- **WHEN** 当前新草稿只有话题或访谈开场，没有真实输入或请求记录
- **THEN** 导出的作品及会话列表不新增该草稿，导入该备份也不会产生空文章

#### Scenario: Export actual or previously saved content
- **WHEN** 当前草稿含真实输入、未发送文字或会话记录，或本来就是已保存的文章
- **THEN** 备份包含相应最新草稿与历史会话；已有文章被清空时导出清空后的内容，不恢复旧正文

#### Scenario: Rescue current content after a storage error
- **WHEN** 用户导出当前内容且已有作品元数据读取失败
- **THEN** 可从传入内存草稿、会话及未发送输入完成救援，不因元数据读取失败阻断救援；可读取已有作品身份时，仍保留该作品的最新清空状态
