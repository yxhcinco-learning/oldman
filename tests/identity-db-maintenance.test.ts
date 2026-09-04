// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('SQLite 数据库部署维护', () => {
  it('完整性检查、在线备份和失败迁移恢复都保留可核对副本', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'suiyue-identity-maintenance-'));
    directories.push(directory);
    const databasePath = join(directory, 'auth.sqlite');
    const backupPath = join(directory, 'backup.sqlite');
    const quarantinePrefix = join(directory, 'failed-release');
    const script = fileURLToPath(new URL('../deploy/server/sqlite-db.mjs', import.meta.url));

    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE users (id TEXT PRIMARY KEY) STRICT; PRAGMA user_version = 1;');
    database.prepare('INSERT INTO users (id) VALUES (?)').run('non-sensitive-fixture');
    database.close();

    await execute(process.execPath, [script, 'check', databasePath]);
    await execute(process.execPath, [script, 'backup', databasePath, backupPath]);
    const changed = new DatabaseSync(databasePath);
    changed.prepare('INSERT INTO users (id) VALUES (?)').run('post-migration-fixture');
    changed.close();
    await execute(process.execPath, [script, 'restore', backupPath, databasePath, quarantinePrefix]);

    const restored = new DatabaseSync(databasePath, { readOnly: true });
    expect(restored.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
    restored.close();
    const quarantined = new DatabaseSync(`${quarantinePrefix}.sqlite`, { readOnly: true });
    expect(quarantined.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 });
    quarantined.close();
  });

  it('拒绝由旧发布版本读取更高 schema，同时保留兼容入口', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'suiyue-schema-ceiling-'));
    directories.push(directory);
    const databasePath = join(directory, 'topics.sqlite');
    const script = fileURLToPath(new URL('../deploy/server/sqlite-db.mjs', import.meta.url));
    const compatibilityScript = fileURLToPath(new URL('../deploy/server/identity-db.mjs', import.meta.url));
    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE fixtures (id TEXT PRIMARY KEY) STRICT; PRAGMA user_version = 2;');
    database.close();

    await expect(execute(process.execPath, [script, 'check', databasePath, '1'])).rejects.toMatchObject({ code: 2 });
    await expect(execute(process.execPath, [compatibilityScript, 'check', databasePath, '2'])).resolves.toMatchObject({ stdout: expect.stringContaining('schema 2') });
  });
});
