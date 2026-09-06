export type StorageErrorCategory = 'conflict' | 'capacity' | 'permission' | 'corrupt' | 'missing' | 'invalid' | 'system';

const messages: Record<StorageErrorCategory, string> = {
  conflict: '作品已有更新。请先导出当前内容，再重新打开作品。',
  capacity: '设备空间不足，暂时无法保存。请腾出空间后重试。',
  permission: '微信暂时无法保存到本机，请重试。',
  corrupt: '部分作品无法读取，已保留原文件。',
  missing: '本地作品文件不存在，可能已被系统清理。',
  invalid: '作品数据格式无效，原有本地内容未改变。',
  system: '暂时无法保存，请重试或导出当前内容。',
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
