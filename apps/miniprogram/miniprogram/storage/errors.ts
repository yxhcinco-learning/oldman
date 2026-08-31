export type StorageErrorCategory = 'conflict' | 'capacity' | 'permission' | 'corrupt' | 'missing' | 'invalid' | 'system';

const messages: Record<StorageErrorCategory, string> = {
  conflict: '作品已有更新，当前内容未覆盖。请重载、另存副本或先做救援导出。',
  capacity: '本机可用空间不足，当前内容仍保留在页面中。请清理空间后重试或救援导出。',
  permission: '微信暂时无法写入本地文件，当前内容仍保留在页面中。',
  corrupt: '本地作品文件已损坏，系统已停止覆盖并保留其他可读取作品。',
  missing: '本地作品文件不存在，可能已被系统清理。',
  invalid: '作品数据格式无效，原有本地内容未改变。',
  system: '本机保存暂时不可用，当前内容仍保留在页面中。',
};

export class MiniStorageError extends Error {
  constructor(readonly category: StorageErrorCategory, options?: { cause?: unknown; message?: string }) {
    super(options?.message ?? messages[category], { cause: options?.cause });
    this.name = 'MiniStorageError';
  }
}

export function storageError(error: unknown, fallback: StorageErrorCategory = 'system'): MiniStorageError {
  if (error instanceof MiniStorageError) return error;
  const errMsg = typeof error === 'object' && error !== null && 'errMsg' in error ? (error as { errMsg?: unknown }).errMsg : undefined;
  const text = typeof errMsg === 'string' ? errMsg : error instanceof Error ? error.message : String(error);
  if (/quota|space|no space|exceed|maximum file size/i.test(text)) return new MiniStorageError('capacity', { cause: error });
  if (/permission|denied|auth|readonly/i.test(text)) return new MiniStorageError('permission', { cause: error });
  if (/no such file|not found|fail file not exist/i.test(text)) return new MiniStorageError('missing', { cause: error });
  return new MiniStorageError(fallback, { cause: error });
}
