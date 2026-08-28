## MODIFIED Requirements

### Requirement: Preserve real product capabilities
视觉迁移 MUST 保留原生文字输入、真实作品时间与字数、本机保存/恢复、删除恢复和导出备份，不导入预览业务状态或示例数据，不修改语音协议。已确认的文章 AI 会话升级 MAY 事务新增存储，但 MUST 保留已有正文、草稿和旧备份导入能力。

#### Scenario: Existing and empty libraries
- **WHEN** 首次打开空库或打开已保存的作品
- **THEN** 空库不出现虚构作品，已有记录原样读取；长标题与时间在新卡片中可读

#### Scenario: Persistence fails
- **WHEN** 自动保存、恢复或管理操作失败
- **THEN** 错误持续可见，保留重试和导出入口；不假报成功、不清空内存或原存储

### Requirement: Keep AI isolation visible
正式聊天与优化 SHALL 使用真实文章助手并清楚区分生成中、待采用、已采用、失败与未开放能力；只有明确确认的候选或恢复版本 MUST 写入正文。历史模拟源码和独立预览仍须隔离，不能作为真实结果或写回来源。

#### Scenario: Exit after changing the copy
- **WHEN** 用户在历史模拟源码或独立预览中修改副本后退出
- **THEN** 真实作品未改变；正式产品入口不再导向该模拟树

#### Scenario: New optimization menu
- **WHEN** 用户打开正式文章优化
- **THEN** Echoes 风格呈现常规优化主入口、润色文笔/精简内容/扩写内容/添加配图及小文文字入口；后三项待开放，真实结果可预览、确认、撤销和追问
