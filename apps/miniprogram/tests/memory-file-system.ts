import type { LocalFileSystem } from '../miniprogram/storage/file-system';

type Operation = keyof LocalFileSystem;

export class MemoryFileSystem implements LocalFileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  private failures: Array<{ operation: Operation; predicate: (path: string) => boolean; error: Error }> = [];

  failOnce(operation: Operation, error: Error, predicate: (path: string) => boolean = () => true) {
    this.failures.push({ operation, predicate, error });
  }

  set(path: string, value: string) {
    this.files.set(path, value);
  }

  private fail(operation: Operation, path: string) {
    const index = this.failures.findIndex(item => item.operation === operation && item.predicate(path));
    if (index < 0) return;
    const [failure] = this.failures.splice(index, 1);
    throw failure!.error;
  }

  async ensureDirectory(path: string) {
    this.fail('ensureDirectory', path);
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `/${part}`;
      this.directories.add(current);
    }
  }

  async exists(path: string) {
    this.fail('exists', path);
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string) {
    this.fail('readText', path);
    const value = this.files.get(path);
    if (value === undefined) throw new Error('no such file');
    return value;
  }

  async writeText(path: string, value: string) {
    this.fail('writeText', path);
    this.files.set(path, value);
  }

  async list(path: string) {
    this.fail('list', path);
    const prefix = `${path}/`;
    return [...this.files.keys()].filter(candidate => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/'))
      .map(candidate => candidate.slice(prefix.length));
  }

  async rename(from: string, to: string) {
    this.fail('rename', from);
    const value = this.files.get(from);
    if (value === undefined) throw new Error('no such file');
    if (this.files.has(to)) throw new Error('target exists');
    this.files.set(to, value);
    this.files.delete(from);
  }

  async remove(path: string) {
    this.fail('remove', path);
    if (!this.files.delete(path)) throw new Error('no such file');
  }
}
