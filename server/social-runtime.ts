import type { SocialOptions } from './social-store';

/** Invalid feature configuration fails closed; it must never accidentally open a write path. */
export function loadSocialRuntime(env: Readonly<Record<string, string | undefined>> = process.env): SocialOptions {
  const flag = (name: string) => env[name] === undefined || env[name] === '' ? true : env[name] === 'true';
  return { writesEnabled: flag('SOCIAL_WRITES_ENABLED'), guestOpeningEnabled: flag('SOCIAL_GUEST_OPENING_ENABLED'), commentsEnabled: flag('SOCIAL_COMMENTS_ENABLED') };
}
