## ADDED Requirements

### Requirement: Single ownership of maintained documentation
维护文档 SHALL 按职责分别维护产品范围、架构、开发命令、阶段状态与线上部署版本。已完成阶段证据 MUST 归档并由验收索引直达，不用独立跳转空壳维持重复入口；历史事实与当时版本记录保留，不作为当前结论的副本维护。

#### Scenario: Close and archive stage evidence
- **WHEN** 一阶段验收或清理结束
- **THEN** 证据放入既有归档分类，当前状态仅链接结论与待办；产品和开发说明不重复阶段验收经过，准确线上版本由部署说明维护

#### Scenario: Consolidate or move a document
- **WHEN** 删除冗余入口或移动验收记录
- **THEN** 当前及历史 Markdown 引用直接指向真实文档，合并后仍能找到唯一维护源；保留原始证据，不要求退役代码或历史截图在现行工程重建，不删除用户备份或有效工具
