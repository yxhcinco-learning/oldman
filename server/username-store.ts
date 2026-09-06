import type { DatabaseSync } from 'node:sqlite';

export const usernameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase();
export const validUsername = (name: string) => Boolean(name.trim()) && [...name].length <= 32 && name.length <= 64 && !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(name);
export class UsernameError extends Error {
  readonly status = 409;
  readonly code = 'username_taken';
  constructor() { super('这个用户名已被使用，请换一个。'); }
}

function reserve(database: DatabaseSync, userId: string, name: string) {
  const key = usernameKey(name);
  const row = database.prepare('SELECT user_id FROM username_claims WHERE name_key = ?').get(key) as { user_id: string } | undefined;
  if (row && row.user_id !== userId) return false;
  database.prepare('INSERT OR IGNORE INTO username_claims (name_key,user_id,name) VALUES (?,?,?)').run(key, userId, name);
  database.prepare('UPDATE mini_accounts SET nickname = ? WHERE user_id = ?').run(name, userId);
  return true;
}

export function generatedUsername(database: DatabaseSync, userId: string, base = '岁月作者') {
  const prefix = [...base].slice(0, 22).join('');
  for (;;) {
    const row = database.prepare('UPDATE username_sequence SET value = value + 1 RETURNING value').get() as { value: number };
    const name = prefix + String(row.value).padStart(6, '0');
    if (reserve(database, userId, name)) return name;
  }
}

export function changeUsername(database: DatabaseSync, userId: string, input: string) {
  const name = input.normalize('NFKC').trim();
  if (!name) return generatedUsername(database, userId);
  if (!validUsername(name)) throw new Error('invalid_username');
  if (!reserve(database, userId, name)) throw new UsernameError();
  return name;
}

export function migrateUsernames(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE username_claims (name_key TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mini_accounts(user_id), name TEXT NOT NULL) STRICT;
    CREATE TABLE username_sequence (value INTEGER NOT NULL) STRICT;
    INSERT INTO username_sequence VALUES (0);
  `);
  const rows = database.prepare('SELECT user_id,nickname FROM mini_accounts ORDER BY created_at,user_id').all() as { user_id: string; nickname: string }[];
  const deferred: typeof rows = [];
  // Reserve every valid existing name first, including names that resemble generated defaults.
  for (const row of rows) {
    const name = row.nickname.normalize('NFKC').trim();
    if (!validUsername(name) || !reserve(database, row.user_id, name)) deferred.push(row);
  }
  for (const row of deferred) generatedUsername(database, row.user_id, validUsername(row.nickname) ? row.nickname.normalize('NFKC').trim() : undefined);
}
