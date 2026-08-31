# local-writing Specification

## Purpose
定义本地优先写作的真实编辑、IndexedDB 自动保存与恢复、作品生命周期，以及可校验、可救援的便携备份行为。
## Requirements
### Requirement: Real writing with recovery
系统 SHALL 支持标题、正文、单段编辑、输入模式切换；自动保存作品及待确认转写、未完成编辑，且仅在写入成功后显示已保存。

#### Scenario: Reopen after saved
- **WHEN** 编辑保存后刷新或重新打开
- **THEN** 内容与未完成编辑恢复且示例不混入作品库

#### Scenario: Rapid edits or failed write
- **WHEN** 连续编辑、存储失败或并发 revision 冲突
- **THEN** 不用旧内容覆盖新内容，失败时保留内存副本、报告问题并可导出

#### Scenario: Input during manual save
- **WHEN** 用户点击保存后在写入完成前继续输入
- **THEN** 等待包含最新输入的写入再退出编辑器，不丢弃新修订

### Requirement: Work lifecycle
系统 SHALL 支持新建、继续编辑、手动保存、软删除与恢复，显示真实字数与修改时间，无标题作品使用未命名作品。

#### Scenario: Delete and restore
- **WHEN** 用户将作品移入回收站再恢复
- **THEN** 作品及其内容不丢失并回到正常列表

### Requirement: Validated portable backups
系统 SHALL 提供单篇 TXT、复制正文及全量版本化 JSON 备份；导入必须校验并作为新副本添加。

#### Scenario: Valid import
- **WHEN** 导入同一作品的备份
- **THEN** 分配新 ID，不覆盖现有作品

#### Scenario: Invalid import or failed migration
- **WHEN** 备份损坏、未知版本或事务失败
- **THEN** 拒绝操作并保留已有数据，不清空数据库

#### Scenario: Rescue export includes unfinished input
- **WHEN** 存储失败且尚有待确认语音或未完成单段编辑
- **THEN** JSON 包含工作快照，TXT 另外标出未完成内容供人工保留
