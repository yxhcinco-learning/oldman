#!/usr/bin/env node
import { existsSync, copyFileSync, renameSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const fail = message => { process.stderr.write(`${message}\n`); process.exitCode = 2; };
const absolute = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !/[\u0000-\u001f\u007f]/.test(value);

function verify(file, maximumSchema) {
  if (!absolute(file) || !existsSync(file)) throw new Error('SQLite database is missing or unsafe');
  const database = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    const result = database.prepare('PRAGMA quick_check').get();
    if (result?.quick_check !== 'ok') throw new Error('SQLite database integrity check failed');
    const version = Number(database.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (maximumSchema !== undefined && version > maximumSchema) {
      throw new Error(`SQLite schema ${version} is newer than supported schema ${maximumSchema}`);
    }
    return version;
  } finally {
    database.close();
  }
}

async function main() {
  const [mode, source, destination, quarantinePrefix] = process.argv.slice(2);
  if (mode === 'check-release' && absolute(source) && absolute(destination) && ['auth', 'topics', 'usage'].includes(quarantinePrefix)) {
    const manifest = resolve(destination, 'deploy/schema-ceilings.json');
    // Releases predating the manifest supported schema 1 only.
    const maximum = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8'))[quarantinePrefix] : 1;
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid release schema ceiling');
    const version = verify(source, maximum);
    process.stdout.write(`Release database compatibility verified (schema ${version})\n`);
    return;
  }
  if (mode === 'check' && absolute(source)) {
    const maximumSchema = destination === undefined
      ? undefined
      : (/^\d+$/.test(destination) ? Number(destination) : Number.NaN);
    if (Number.isNaN(maximumSchema)) throw new Error('maximum schema must be a non-negative integer');
    const version = verify(source, maximumSchema);
    process.stdout.write(`SQLite database verified (schema ${version})\n`);
    return;
  }
  if (mode === 'backup' && absolute(source) && absolute(destination) && source !== destination) {
    verify(source);
    if (existsSync(destination)) throw new Error('SQLite backup destination already exists');
    if (!existsSync(dirname(destination))) throw new Error('SQLite backup directory is missing');
    const database = new DatabaseSync(source, { readOnly: true, allowExtension: false });
    try { await backup(database, destination); } finally { database.close(); }
    const version = verify(destination);
    process.stdout.write(`SQLite backup verified (schema ${version})\n`);
    return;
  }
  if (mode === 'restore' && (source === '-' || absolute(source)) && absolute(destination) && absolute(quarantinePrefix)) {
    const sourceVersion = source === '-' ? 0 : verify(source);
    if (existsSync(destination)) {
      const currentVersion = verify(destination);
      if (currentVersion >= 3 || sourceVersion < currentVersion) {
        throw new Error('Refusing to overwrite current account/publication data with a historical database; retain the current database and use a separately reviewed recovery procedure');
      }
    }
    if (existsSync(`${quarantinePrefix}.sqlite`) || existsSync(`${quarantinePrefix}.sqlite-wal`) || existsSync(`${quarantinePrefix}.sqlite-shm`)) {
      throw new Error('SQLite quarantine destination already exists');
    }
    if (!existsSync(dirname(quarantinePrefix))) throw new Error('SQLite quarantine directory is missing');
    for (const suffix of ['', '-wal', '-shm']) {
      const current = `${destination}${suffix}`;
      if (existsSync(current)) renameSync(current, `${quarantinePrefix}.sqlite${suffix}`);
    }
    if (source !== '-') {
      copyFileSync(source, destination);
      const version = verify(destination);
      process.stdout.write(`SQLite database restored (schema ${version})\n`);
    } else {
      process.stdout.write('new SQLite database quarantined; prior state was empty\n');
    }
    return;
  }
  throw new Error('usage: sqlite-db.mjs check <db> [max-schema] | backup <db> <backup> | restore <backup|-> <db> <quarantine-prefix>');
}

main().catch(error => fail(error instanceof Error ? error.message : 'SQLite database maintenance failed'));
