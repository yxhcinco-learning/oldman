export interface LocalFileSystem {
  ensureDirectory(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, value: string): Promise<void>;
  list(path: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export class WxLocalFileSystem implements LocalFileSystem {
  constructor(private readonly manager: WechatMiniprogram.FileSystemManager = wx.getFileSystemManager()) {}

  async ensureDirectory(path: string) {
    if (await this.exists(path)) return;
    try { this.manager.mkdirSync(path, true); }
    catch (error) {
      if (!/already exist/i.test(String((error as { errMsg?: unknown }).errMsg ?? error))) throw error;
    }
  }

  async exists(path: string) {
    try { this.manager.accessSync(path); return true; }
    catch { return false; }
  }

  async readText(path: string) {
    const value = this.manager.readFileSync(path, 'utf8');
    if (typeof value !== 'string') throw new Error('本地文本文件编码无效');
    return value;
  }

  async writeText(path: string, value: string) {
    this.manager.writeFileSync(path, value, 'utf8');
  }

  async list(path: string) {
    return this.manager.readdirSync(path);
  }

  async rename(from: string, to: string) {
    this.manager.renameSync(from, to);
  }

  async remove(path: string) {
    try { this.manager.unlinkSync(path); }
    catch (error) {
      const message = String((error as { errMsg?: unknown })?.errMsg ?? (error instanceof Error ? error.message : error));
      // Cleanup is idempotent; other errors must still reach the recovery flow.
      if (!/no such file|not found|file (?:not exist|does not exist)|ENOENT/i.test(message)) throw error;
    }
  }
}
