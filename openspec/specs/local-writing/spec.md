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

### Requirement: Persistent topic-linked writing material
系统 SHALL 在作品中以非破坏方式关联议题快照和采访素材，并 MUST 将其与当前正文、待确认语音和 AI 候选分开保存；旧作品没有议题或素材时 SHALL 继续按普通作品打开。

#### Scenario: Save and reopen a topic-linked work
- **WHEN** 用户从议题开始写作、完成若干采访回答并刷新或重新打开作品
- **THEN** 正文、议题快照、来源修订、采访素材和当前工作模式按各自状态恢复，没有任何素材被重复追加到正文

#### Scenario: Continue offline after topic snapshot exists
- **WHEN** 用户已保存议题快照后断网或议题服务不可用
- **THEN** 系统仍可查看已保存背景、编辑本机正文和采访素材；需要联网的来源刷新或 AI 请求显示不可用，不阻止本机保存

#### Scenario: Persistence fails
- **WHEN** 保存议题快照或采访素材遇到存储失败、修订冲突或空间不足
- **THEN** 系统保留内存内容、报告真实问题并提供重试或救援导出，不显示为已保存、不覆盖较新正文

#### Scenario: Do not keep a content-free topic draft as a work
- **WHEN** 新建的议题关联草稿只有背景快照，尚无标题、正文、待确认语音或用户素材，并且用户离开该草稿
- **THEN** 系统可以保留编辑期间的崩溃恢复记录，但离开时不得把它作为“未命名作品”留在作品列表；已有用户内容或素材仍按普通作品保存

### Requirement: Compatible topic and material backup
版本化 JSON 备份 SHALL 包含作品关联的议题快照、来源元数据和采访素材，并继续安全处理没有这些字段的旧备份；导入 MUST 完整校验关联和大小后作为新副本创建。

#### Scenario: Export and restore a topic-linked work
- **WHEN** 用户导出包含议题背景和采访素材的新版备份并重新导入
- **THEN** 系统为作品、素材和引用分配一致的新关联，保留来源与正文分离，不覆盖现有作品

#### Scenario: Import legacy or invalid data
- **WHEN** 用户导入旧版备份，或新版备份包含损坏来源、超限素材、不匹配引用或未知结构
- **THEN** 旧版按普通作品恢复；无效新版整批拒绝且已有数据库保持，不删库、不部分导入
