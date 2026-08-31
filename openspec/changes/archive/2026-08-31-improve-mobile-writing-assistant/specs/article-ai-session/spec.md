## ADDED Requirements

### Requirement: Accurate current-turn change explanations
系统 SHALL 让优化或改文的修改说明只描述本轮候选相对输入正文的实际变化；说明 MUST 不把明确标注“未变”“保持不变”“无需修改”的内容或把同一引文替换成自身的条目列为修改。校正 MUST 不增加模型请求，不改变候选正文、引用、状态或确认流程。

#### Scenario: Partial candidate with unchanged items in the explanation
- **WHEN** 候选全文包含实际变化，但模型说明同时列出“某句改为同一句（未变）”或“保持不变”的项目
- **THEN** 会话和全文预览只显示其余实际修改说明，不显示这些伪改动项目；候选正文与待应用状态保持原样

#### Scenario: Explanation contains only non-changes while body differs
- **WHEN** 候选全文与原文不同，但模型说明经过确定性校正后没有可保留内容
- **THEN** 系统显示中性提示请用户对照原文查看具体变化，不虚构修改点、不丢弃候选或自动应用

#### Scenario: Entire candidate is unchanged
- **WHEN** 候选全文与输入正文完全相同
- **THEN** 系统继续明确显示本次保留原文、未产生正文修改，并忽略模型声称的修改
