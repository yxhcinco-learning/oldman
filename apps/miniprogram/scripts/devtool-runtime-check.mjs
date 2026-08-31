export const requiredCoreExports = ['workFromDraft', 'isWorkAiAssisted', 'AI_ASSISTANCE_LABEL'];

export const assertDevtoolCoreRuntime = (runtime) => {
  const missing = requiredCoreExports.filter((name) => !(name in runtime));
  if (missing.length > 0) throw new Error(`微信开发者工具运行包缺少共享导出：${missing.join('、')}`);
  if (typeof runtime.workFromDraft !== 'function' || typeof runtime.isWorkAiAssisted !== 'function') {
    throw new Error('微信开发者工具运行包的共享函数导出无效');
  }
  if (typeof runtime.AI_ASSISTANCE_LABEL !== 'string' || runtime.AI_ASSISTANCE_LABEL.length === 0) {
    throw new Error('微信开发者工具运行包的 AI 标识导出无效');
  }
};
