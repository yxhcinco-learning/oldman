> 适用范围（2026-09-06）：小程序为唯一用户端，网页仅运营后台。H5 专属 UI/浏览器实现条款仅作历史兼容记录，不是后续需求或验收门槛；共享业务、后端与后台要求继续有效。详见仓库 docs/CLIENT-SCOPE.md 与 active-client-scope 规范。

## ADDED Requirements

### Requirement: Visible AI-origin disclosure in interaction
系统 MUST 在完整候选和候选预览附近提供用户可感知的“AI 辅助生成、需要核对”标识，并 SHALL 将模型输出与用户原文、采访回答、议题来源和程序状态文字分开表达。聊天回答通过小文身份和助手气泡区分，不逐条重复核对提示。

#### Scenario: Receive an AI answer without a candidate
- **WHEN** 小文返回只读回答或澄清问题
- **THEN** 消息明确属于小文 AI 辅助回复，不被保存成用户正文或采访原始回答

#### Scenario: Review a full candidate
- **WHEN** 小文返回可应用的完整正文
- **THEN** 会话通过小文身份及“看看文章”入口区分来源，全文预览显示轻量 AI 辅助标识及核对提示，不在结果气泡重复堆叠标签；当前正文保持不变直到用户明确应用

#### Scenario: Show user-authored content
- **WHEN** 用户查看自己手写正文、原始采访回答或议题来源
- **THEN** 系统按真实来源展示，不把全部内容笼统标成 AI 生成，也不把模型连接性表达冒充用户原话

### Requirement: Applied AI provenance remains traceable
系统 SHALL 在文章会话和版本记录中保留候选由 AI 生成、应用或放弃的来源与状态；用户后续手改不得删除历史披露，恢复旧版本 MUST 追加记录而非改写既有来源。

#### Scenario: Apply then manually edit a candidate
- **WHEN** 用户应用 AI 候选后继续手工修改文章
- **THEN** 当前正文按用户修改保存，历史仍能核对曾应用的 AI 候选、对应版本和之后的手改，不把整篇宣称为纯模型或纯人工

#### Scenario: Dismiss a candidate
- **WHEN** 用户放弃 AI 候选
- **THEN** 候选保持可追溯的未采用状态，正文不改变，导出不得把未采用候选误判为已进入正文

### Requirement: AI disclosure in copy and export
当待复制、TXT 导出或其他面向外部使用的正文包含已应用 AI 候选时，系统 MUST 在输出内容中加入可见 AI 辅助标识；版本化 JSON 备份 MUST 保留机器可读来源和用户可读披露。系统不得因用户已确认候选就静默移除标识。

#### Scenario: Export an AI-assisted article
- **WHEN** 作品会话表明当前或历史正文应用过 AI 生成候选且用户导出 TXT 或复制正文
- **THEN** 输出包含明确、不会与正文事实混淆的 AI 辅助说明，文章内容和版本记录不被标签文字反向写入编辑正文

#### Scenario: Export a purely user-authored article
- **WHEN** 作品没有任何已应用 AI 候选且用户导出或复制
- **THEN** 系统不添加虚假的 AI 生成声明，仍保留普通产品和备份版本信息

#### Scenario: Export a full JSON backup
- **WHEN** 用户导出包含文章会话的全量备份
- **THEN** 备份 schema 明确保存生成候选、应用状态和披露信息，重新导入后仍能作出相同的标识判断

### Requirement: Release review for AI labeling
小程序正式提审前 MUST 核对现行生成合成内容标识规则、微信审核问项、隐私说明和导出格式，并 MUST 留存不含用户正文与秘密的验收证据；临时 AppID 的开发者工具预览不得被当作合规审核通过。

#### Scenario: Prepare an experience build
- **WHEN** 团队生成临时 AppID 的体验版或预览
- **THEN** 界面和导出标识可被测试，但记录明确说明尚未完成正式 AppID 审核、备案和最终合规复核

#### Scenario: Prepare a formal submission
- **WHEN** 用户明确授权使用正式 AppID 提审
- **THEN** 提审材料说明产品提供 AI 辅助生成，并附界面、复制/导出和隐私标识证据；缺少必要材料时停止提审而不隐藏 AI 功能
