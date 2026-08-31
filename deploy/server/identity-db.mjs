#!/usr/bin/env node
import { existsSync, copyFileSync, renameSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const fail = message => { process.stderr.write(`${message}\n`); process.exitCode = 2; };
const absolute = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !/[\u0000-\u001f\u007f]/.test(value);

function verify(file) {
  if (!absolute(file) || !existsSync(file)) throw new Error('identity database is missing or unsafe');
  const database = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    const result = database.prepare('PRAGMA quick_check').get();
    if (result?.quick_check !== 'ok') throw new Error('identity database integrity check failed');
    return Number(database.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  } finally {
    database.close();
  }
}

async function main() {
  const [mode, source, destination, quarantinePrefix] = process.argv.slice(2);
  if (mode === 'check' && absolute(source)) {
    const version = verify(source);
    process.stdout.write(`identity database verified (schema ${version})\n`);
    return;
  }
  if (mode === 'backup' && absolute(source) && absolute(destination) && source !== destination) {
    verify(source);
    if (existsSync(destination)) throw new Error('identity backup destination already exists');
    if (!existsSync(dirname(destination))) throw new Error('identity backup directory is missing');
    const database = new DatabaseSync(source, { readOnly: true, allowExtension: false });
    try { await backup(database, destination); } finally { database.close(); }
    const version = verify(destination);
    process.stdout.write(`identity backup verified (schema ${version})\n`);
    return;
  }
  if (mode === 'restore' && (source === '-' || absolute(source)) && absolute(destination) && absolute(quarantinePrefix)) {
    if (source !== '-') verify(source);
    if (existsSync(`${quarantinePrefix}.sqlite`) || existsSync(`${quarantinePrefix}.sqlite-wal`) || existsSync(`${quarantinePrefix}.sqlite-shm`)) {
      throw new Error('identity quarantine destination already exists');
    }
    if (!existsSync(dirname(quarantinePrefix))) throw new Error('identity quarantine directory is missing');
    for (const suffix of ['', '-wal', '-shm']) {
      const current = `${destination}${suffix}`;
      if (existsSync(current)) renameSync(current, `${quarantinePrefix}.sqlite${suffix}`);
    }
    if (source !== '-') {
      copyFileSync(source, destination);
      const version = verify(destination);
      process.stdout.write(`identity database restored (schema ${version})\n`);
    } else {
      process.stdout.write('new identity database quarantined; prior state was empty\n');
    }
    return;
  }
  throw new Error('usage: identity-db.mjs check <db> | backup <db> <backup> | restore <backup|-> <db> <quarantine-prefix>');
}

main().catch(error => fail(error instanceof Error ? error.message : 'identity database maintenance failed'));
