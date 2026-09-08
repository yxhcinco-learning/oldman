export const requiredCoreFunctions = ['workFromDraft', 'isWorkAiAssisted', 'conversationOf', 'conversationView', 'hasSessionContent', 'hasArticleContent', 'withoutTransientInput',
  'prepareDialogue', 'settleDialogue', 'startInterview', 'validateDialogueResult', 'buildAiRequest', 'emptyWritingState', 'makeBackupVolumes', 'stableJson', 'centeredCrops', 'publicationLabel'];
export const requiredCoreExports = [...requiredCoreFunctions, 'AI_ASSISTANCE_LABEL', 'cloudMutationSchema', 'cloudWorkSchema', 'cloudChangesSchema',
  'accountLoginSchema', 'accountProfileSchema', 'writingStateSchema', 'workSnapshotSchema', 'coverCropsSchema', 'submissionInputSchema', 'publicationSettingsInputSchema', 'publicationActionSchema'];

export const assertDevtoolCoreRuntime = (runtime) => {
  const missing = requiredCoreExports.filter((name) => !(name in runtime));
  if (missing.length > 0) throw new Error(`微信开发者工具运行包缺少共享导出：${missing.join('、')}`);
  const invalid = requiredCoreFunctions.filter(name => typeof runtime[name] !== 'function');
  if (invalid.length) {
    throw new Error(`微信开发者工具运行包的共享函数导出无效：${invalid.join('、')}`);
  }
  if (typeof runtime.AI_ASSISTANCE_LABEL !== 'string' || runtime.AI_ASSISTANCE_LABEL.length === 0) {
    throw new Error('微信开发者工具运行包的 AI 标识导出无效');
  }
};
