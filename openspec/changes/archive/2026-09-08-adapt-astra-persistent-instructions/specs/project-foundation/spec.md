## MODIFIED Requirements

### Requirement: Durable development guidance
工程 SHALL 在 AGENTS 中维护规范入口、工作流程、权限安全和验证交付规则，将产品状态、实现细节、阶段结论及完成状态保留在对应文档；日常直接在 main 开发，不强制创建功能分支或 PR，未经用户明确允许不得执行分支操作。

#### Scenario: Complete a checked change
- **WHEN** 一个小阶段通过相应检查
- **THEN** 明确暂存本任务文件并自动本地提交，以 OpenSpec 和检查证据记录变更，不要求先创建分支或 PR，不自动推送或合并

#### Scenario: A branch operation appears useful
- **WHEN** 代理认为创建、切换、重命名、合并或删除分支有助于任务
- **THEN** 在执行前取得用户明确允许；任务开始时已位于非目标分支则先说明并确认

#### Scenario: Record a phase-specific decision
- **WHEN** 确认仓库可见性或某阶段完成情况
- **THEN** 更新对应变更或验收记录，不把该阶段结论添加为 AGENTS 的长期规则；提交、推送前仍检查敏感信息

#### Scenario: Archive a completed change autonomously
- **WHEN** 一个 change 的范围内任务完成，相关验收证据齐全且检查通过
- **THEN** 自行将增量规范同步至 openspec/specs 并归档，无需再次确认；修复文档引用、验证规范并按约定本地提交，不自动推送或发布

#### Scenario: Keep an incomplete change active
- **WHEN** change 范围内仍有未完成任务或缺少相应验收证据
- **THEN** 保持活跃并说明原因，不把 artifacts 完整当作验收通过，不通过跳过校验或擅自移出任务来强行归档；其他 change 的待办或明确的非目标不阻塞本变更

#### Scenario: Find the applicable source of truth
- **WHEN** 开始处理一个请求
- **THEN** 按范围查阅产品状态、OpenSpec 行为、设计或架构及开发说明；先按指令优先级和本次明确授权处理差异，只有无法据此消解且会影响结果的冲突才澄清；AGENTS 不复制历史称谓、机器路径和 AI 模拟实现细节

#### Scenario: Work within an approved scope
- **WHEN** 在已确认范围内进行普通实现或内部类型调整
- **THEN** 无需重复请求确认；问答和审查默认只读，超出范围或涉及破坏兼容性、数据丢失风险及未授权外部操作时先说明并确认

#### Scenario: Carry implementation authorization through planning
- **WHEN** 用户明确要求直接完成修改且范围可确定，实施前需要补齐 OpenSpec
- **THEN** 先记录变更再持续完成实施、相应验证和本次引入问题的修复；技能不得因进入提案流程而丢弃已有实施授权，仅提案或讨论请求仍不授权产品实现

#### Scenario: Handle a recoverable failure or a mid-task message
- **WHEN** 发生范围内可修复错误，或用户补充要求、询问进度
- **THEN** 修复错误或吸收补充后继续原目标；只有明确取消、暂停或实际阻塞才停止受影响工作，缺失权限或外部证据不伪造

#### Scenario: Explain a necessary approval
- **WHEN** 某项尚未授权操作触及实际权限边界
- **THEN** 完成不依赖该授权的准备，并说明待批准的具体操作与影响；若停止源于持久指令，指出文件和具体条款，不把建议解释为额外审批

#### Scenario: Read only relevant context and delegate independent work
- **WHEN** 处理局部文档修改或可并行的独立任务
- **THEN** 仅加载与结果有关的规范和技能资料；有实际收益时按明确文件范围委派独立工作，由主代理整合验收，不因技能关键词扩展任务


### Requirement: Proportionate verification
工程 SHALL 根据改动影响选择验证，保留代码阶段交付和 CI 的完整回归，记录未验证项，不以模拟结果替代真实联调或设备验收。

#### Scenario: Documentation-only changes
- **WHEN** 仅修改文档或注释，不改变应用代码与运行配置
- **THEN** 检查差异、引用、内容一致性与相关 OpenSpec，不强制应用构建；纯排版、错字等不改变行为的文档修正无需新建变更

#### Scenario: Code or runtime changes
- **WHEN** 修改代码、运行链路、依赖或界面
- **THEN** 代码运行 check，运行或打包相关变更加 build，界面增加浏览器回归；代码阶段交付和 CI 执行完整 check 与 build

#### Scenario: Stop verification after the required evidence passes
- **WHEN** 本次改动要求的检查已通过且没有新修改、失败或未解决疑点
- **THEN** 进入交付及相应提交，不扩大或重复检查；新增回归针对实际失败或行为边界，不为纯措辞调整编写映射实现的测试，代码阶段和 CI 的完整门禁仍保留
