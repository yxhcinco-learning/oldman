import { describe, expect, it, vi } from 'vitest';
import { WxLocalFileSystem } from '../miniprogram/storage/file-system';

function manager(overrides: Partial<WechatMiniprogram.FileSystemManager> = {}) {
  return {
    accessSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '正文'),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => ['index.json']),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    ...overrides,
  } as unknown as WechatMiniprogram.FileSystemManager;
}

describe('WxLocalFileSystem', () => {
  it('uses synchronous file APIs so DevTools operations do not hang', async () => {
    const wxFiles = manager();
    const files = new WxLocalFileSystem(wxFiles);

    await expect(files.exists('http://usr/suiyue-v1')).resolves.toBe(true);
    await expect(files.readText('http://usr/suiyue-v1/index.json')).resolves.toBe('正文');
    await files.writeText('http://usr/suiyue-v1/index.json.tmp', '{}');
    await expect(files.list('http://usr/suiyue-v1')).resolves.toEqual(['index.json']);
    await files.rename('from', 'to');
    await files.remove('to');

    expect(wxFiles.writeFileSync).toHaveBeenCalledWith('http://usr/suiyue-v1/index.json.tmp', '{}', 'utf8');
    expect(wxFiles.renameSync).toHaveBeenCalledWith('from', 'to');
    expect(wxFiles.unlinkSync).toHaveBeenCalledWith('to');
  });

  it('creates a missing directory recursively', async () => {
    const wxFiles = manager({ accessSync: vi.fn(() => { throw new Error('not found'); }) });
    const files = new WxLocalFileSystem(wxFiles);

    await files.ensureDirectory('wxfile://usr/suiyue-v1/works');

    expect(wxFiles.mkdirSync).toHaveBeenCalledWith('wxfile://usr/suiyue-v1/works', true);
  });

  it('rejects non-text file results', async () => {
    const wxFiles = manager({ readFileSync: vi.fn(() => new ArrayBuffer(2)) });

    await expect(new WxLocalFileSystem(wxFiles).readText('/data/index.json')).rejects.toThrow('编码无效');
  });
});
