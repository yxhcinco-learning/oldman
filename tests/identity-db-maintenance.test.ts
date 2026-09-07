// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
  it('发表数据库禁止由旧库、同 schema 历史备份或空状态覆盖新增内容', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'suiyue-publication-restore-'));
    directories.push(directory);
    const script = fileURLToPath(new URL('../deploy/server/sqlite-db.mjs', import.meta.url));
    const current = join(directory, 'auth.sqlite');
    const db = new DatabaseSync(current);
    db.exec("CREATE TABLE fixture (body TEXT); INSERT INTO fixture VALUES ('新增内容'); PRAGMA user_version=3;"); db.close();
    for (const version of [2, 3]) {
      const old = join(directory, `backup-${version}.sqlite`), backup = new DatabaseSync(old);
      backup.exec(`PRAGMA user_version=${version}`); backup.close();
      await expect(execute(process.execPath, [script, 'restore', old, current, join(directory, 'quarantine-' + version)])).rejects.toMatchObject({ code: 2 });
    }
    await expect(execute(process.execPath, [script, 'restore', '-', current, join(directory, 'quarantine-empty')])).rejects.toMatchObject({ code: 2 });
    const retained = new DatabaseSync(current, { readOnly: true });
    expect(retained.prepare('SELECT body FROM fixture').get()?.body).toBe('新增内容'); retained.close();
  });
  it('三库完整性检查、在线备份和失败迁移恢复都保留可核对副本', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'suiyue-identity-maintenance-'));
    directories.push(directory);
    const script = fileURLToPath(new URL('../deploy/server/sqlite-db.mjs', import.meta.url));

    for (const name of ['auth', 'topics', 'usage']) {
      const databasePath = join(directory, `${name}.sqlite`);
      const backupPath = join(directory, `${name}-backup.sqlite`);
      const quarantinePrefix = join(directory, `failed-${name}`);
      const database = new DatabaseSync(databasePath);
      database.exec('CREATE TABLE fixtures (id TEXT PRIMARY KEY) STRICT; PRAGMA user_version = 1;');
      database.prepare('INSERT INTO fixtures (id) VALUES (?)').run(`${name}-non-sensitive-fixture`);
      database.close();

      await execute(process.execPath, [script, 'check', databasePath]);
      await execute(process.execPath, [script, 'backup', databasePath, backupPath]);
      const changed = new DatabaseSync(databasePath);
      changed.prepare('INSERT INTO fixtures (id) VALUES (?)').run(`${name}-post-migration-fixture`);
      changed.close();
      await execute(process.execPath, [script, 'restore', backupPath, databasePath, quarantinePrefix]);

      const restored = new DatabaseSync(databasePath, { readOnly: true });
      expect(restored.prepare('SELECT COUNT(*) AS count FROM fixtures').get(), name).toEqual({ count: 1 });
      restored.close();
      const quarantined = new DatabaseSync(`${quarantinePrefix}.sqlite`, { readOnly: true });
      expect(quarantined.prepare('SELECT COUNT(*) AS count FROM fixtures').get(), name).toEqual({ count: 2 });
      quarantined.close();
    }
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
    await expect(execute(process.execPath, [script, 'check-release', databasePath, directory, 'auth'])).rejects.toMatchObject({ code: 2 });
    await mkdir(join(directory, 'deploy'));
    await writeFile(join(directory, 'deploy/schema-ceilings.json'), JSON.stringify({ auth: 2, topics: 1, usage: 1 }));
    await expect(execute(process.execPath, [script, 'check-release', databasePath, directory, 'auth'])).resolves.toMatchObject({ stdout: expect.stringContaining('compatibility verified') });
    await expect(execute(process.execPath, [script, 'check-release', databasePath, directory, 'topics'])).rejects.toMatchObject({ code: 2 });
  });
});
