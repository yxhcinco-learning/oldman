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
  private readonly manager = wx.getFileSystemManager();

  ensureDirectory(path: string) {
    return new Promise<void>((resolve, reject) => this.manager.mkdir({ dirPath: path, recursive: true, success: () => resolve(), fail: error => {
      if (/already exists/i.test(error.errMsg)) resolve();
      else reject(error);
    } }));
  }

  exists(path: string) {
    return new Promise<boolean>(resolve => this.manager.access({ path, success: () => resolve(true), fail: () => resolve(false) }));
  }

  readText(path: string) {
    return new Promise<string>((resolve, reject) => this.manager.readFile({ filePath: path, encoding: 'utf8',
      success: result => resolve(typeof result.data === 'string' ? result.data : ''), fail: reject }));
  }

  writeText(path: string, value: string) {
    return new Promise<void>((resolve, reject) => this.manager.writeFile({ filePath: path, data: value, encoding: 'utf8', success: () => resolve(), fail: reject }));
  }

  list(path: string) {
    return new Promise<string[]>((resolve, reject) => this.manager.readdir({ dirPath: path, success: result => resolve(result.files), fail: reject }));
  }

  rename(from: string, to: string) {
    return new Promise<void>((resolve, reject) => this.manager.rename({ oldPath: from, newPath: to, success: () => resolve(), fail: reject }));
  }

  remove(path: string) {
    return new Promise<void>((resolve, reject) => this.manager.unlink({ filePath: path, success: () => resolve(), fail: reject }));
  }
}
