import type { AccountProfile } from '../packages/core/src/cloud-protocol';
import { MiniIdentityStore } from './mini-identity-store';
import { CloudWorkError } from './cloud-work-store';

export class AccountStore {
  constructor(private readonly identity: MiniIdentityStore) {}

  profile(token: string): AccountProfile {
    return this.identity.accountTransaction(token, (database, session) => {
      const row = database.prepare('SELECT nickname, avatar_version, avatar IS NOT NULL AS has_avatar FROM mini_accounts WHERE user_id = ?')
        .get(session.userId) as { nickname: string; avatar_version: number; has_avatar: number };
      return { id: session.userId, nickname: row.nickname, avatarVersion: row.avatar_version, hasAvatar: Boolean(row.has_avatar), expiresAt: new Date(session.expiresAt).toISOString() };
    });
  }

  updateNickname(token: string, nickname: string) {
    const trimmed = nickname.trim();
    if ([...trimmed].length > 32 || trimmed.length > 64 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new CloudWorkError(400, 'invalid_profile', '昵称请使用 32 字以内的文字。');
    this.identity.accountTransaction(token, (database, session) => {
      database.prepare('UPDATE mini_accounts SET nickname = ? WHERE user_id = ?').run(trimmed, session.userId);
    });
    return this.profile(token);
  }

  avatar(token: string) {
    return this.identity.accountTransaction(token, (database, session) => {
      const row = database.prepare('SELECT avatar FROM mini_accounts WHERE user_id = ?').get(session.userId) as { avatar: Uint8Array | null };
      if (!row.avatar) throw new CloudWorkError(404, 'avatar_not_found', '尚未设置头像。');
      return Buffer.from(row.avatar);
    });
  }

  setAvatar(token: string, avatar: Buffer | null) {
    if (avatar && avatar.byteLength > 256 * 1024) throw new CloudWorkError(413, 'avatar_too_large', '头像过大，请换一张图片。');
    this.identity.accountTransaction(token, (database, session) => {
      database.prepare('UPDATE mini_accounts SET avatar = ?, avatar_version = avatar_version + 1 WHERE user_id = ?').run(avatar, session.userId);
    });
    return this.profile(token);
  }
}
