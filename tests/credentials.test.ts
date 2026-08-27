// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { loadSpeechCredentials } from '../server/credentials';

const project = { TENCENT_ASR_APP_ID: '1234567890', TENCENT_ASR_SECRET_ID: 'project-id', TENCENT_ASR_SECRET_KEY: 'project-key' };
const stored = { secretId: 'windows-id', secretKey: 'windows-key' };

it('defaults to project credentials and never reads the Windows identity', async () => {
  const read = vi.fn(async () => stored);
  const result = await loadSpeechCredentials(project, 'win32', read);
  expect(result).toEqual({ source: 'project', credentials: { appId: '1234567890', secretId: 'project-id', secretKey: 'project-key' } });
  expect(read).not.toHaveBeenCalled();
});

it('reads both Windows keys afresh only when explicitly selected, without mixing a project token', async () => {
  const read = vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce({ secretId: 'rotated-id', secretKey: 'rotated-key' });
  const env = { ...project, ASR_CREDENTIAL_SOURCE: 'windows-user', TENCENT_ASR_TOKEN: 'unrelated-token' };
  const first = await loadSpeechCredentials(env, 'win32', read);
  const second = await loadSpeechCredentials(env, 'win32', read);
  expect(first.credentials).toEqual({ appId: project.TENCENT_ASR_APP_ID, ...stored });
  expect(second.credentials?.secretId).toBe('rotated-id');
  expect(read).toHaveBeenCalledTimes(2);
});

it('supports an optional STS token only with the project credential pair', async () => {
  const result = await loadSpeechCredentials({ ...project, TENCENT_ASR_TOKEN: ' token ' }, 'linux');
  expect(result.credentials?.token).toBe('token');
});

it.each(['', 'abc', '0', '100000000000', '4294967296'])('rejects invalid AppID %s before reading any credentials', async appId => {
  const read = vi.fn(async () => stored);
  const result = await loadSpeechCredentials({ ...project, ASR_CREDENTIAL_SOURCE: 'windows-user', TENCENT_ASR_APP_ID: appId }, 'win32', read);
  expect(result.credentials).toBeUndefined();
  expect(result.problem).toContain('APP_ID');
  expect(read).not.toHaveBeenCalled();
});

it('refuses unknown sources instead of silently falling back', async () => {
  const result = await loadSpeechCredentials({ ...project, ASR_CREDENTIAL_SOURCE: 'automatic' });
  expect(result.credentials).toBeUndefined();
  expect(result.problem).toContain('ASR_CREDENTIAL_SOURCE');
});

it('does not read Windows credentials on other platforms', async () => {
  const read = vi.fn(async () => stored);
  const result = await loadSpeechCredentials({ ...project, ASR_CREDENTIAL_SOURCE: 'windows-user' }, 'linux', read);
  expect(result.credentials).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});

it('does not combine incomplete Windows credentials with the project identity', async () => {
  const result = await loadSpeechCredentials({ ...project, ASR_CREDENTIAL_SOURCE: 'windows-user' }, 'win32', async () => ({ secretId: 'windows-id' }));
  expect(result.credentials).toBeUndefined();
  expect(result.problem).toContain('Windows User');
});

it('does not fall back to Windows when project credentials are incomplete', async () => {
  const read = vi.fn(async () => stored);
  const result = await loadSpeechCredentials({ ...project, TENCENT_ASR_SECRET_KEY: '' }, 'win32', read);
  expect(result.credentials).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});

it('sanitizes reader exceptions that might contain sensitive process output', async () => {
  const result = await loadSpeechCredentials({ ...project, ASR_CREDENTIAL_SOURCE: 'windows-user' }, 'win32', async () => { throw new Error('private-child-output'); });
  expect(result.credentials).toBeUndefined();
  expect(result.problem).toContain('无法读取');
  expect(JSON.stringify(result)).not.toContain('private-child-output');
});
