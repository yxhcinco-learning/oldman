import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Credentials } from './tencent';

type CredentialSource = 'project' | 'windows-user';
type WindowsCredentials = { secretId?: unknown; secretKey?: unknown };
type ReadWindowsCredentials = () => Promise<WindowsCredentials>;
export interface CredentialConfiguration {
  credentials?: Credentials;
  source: CredentialSource;
  problem?: string;
}

const execute = promisify(execFile);
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** The child process is hidden and its output stays in memory. Never log it. */
async function readWindowsUserCredentials(): Promise<WindowsCredentials> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$asrValues = @{ secretId = [Environment]::GetEnvironmentVariable('TENCENTCLOUD_SECRET_ID', 'User'); secretKey = [Environment]::GetEnvironmentVariable('TENCENTCLOUD_SECRET_KEY', 'User') }",
    '$asrValues | ConvertTo-Json -Compress',
  ].join('; ');
  const { stdout } = await execute(
    join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true },
  );
  const value: unknown = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credential configuration');
  return value as WindowsCredentials;
}

/** Explicit source selection prevents accidentally using a deployment identity. */
export async function loadSpeechCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
  readWindows: ReadWindowsCredentials = readWindowsUserCredentials,
): Promise<CredentialConfiguration> {
  const selected = clean(env.ASR_CREDENTIAL_SOURCE) || 'project';
  if (selected !== 'project' && selected !== 'windows-user') {
    return { source: 'project', problem: 'ASR_CREDENTIAL_SOURCE 只能为 project 或 windows-user' };
  }
  const source = selected;
  const appId = clean(env.TENCENT_ASR_APP_ID);
  if (!/^[1-9]\d{0,9}$/.test(appId) || Number(appId) > 0xffffffff) {
    return { source, problem: '请配置有效的数字 TENCENT_ASR_APP_ID（不是账号 UIN）' };
  }
  let secretId = '', secretKey = '', token: string | undefined;
  if (source === 'windows-user') {
    if (platform !== 'win32') return { source, problem: 'windows-user 凭据来源只适用于 Windows，请改用 project 并配置服务端环境变量' };
    try {
      const stored = await readWindows();
      secretId = clean(stored.secretId);
      secretKey = clean(stored.secretKey);
    } catch {
      // Native process exceptions may contain stdout. Never rethrow or log them.
      return { source, problem: '无法读取 Windows 本机凭据，请检查用户环境配置后重启语音网关' };
    }
    if (!secretId || !secretKey) {
      return { source, problem: 'Windows User 中缺少 TENCENTCLOUD_SECRET_ID 或 TENCENTCLOUD_SECRET_KEY' };
    }
  } else {
    secretId = clean(env.TENCENT_ASR_SECRET_ID);
    secretKey = clean(env.TENCENT_ASR_SECRET_KEY);
    token = clean(env.TENCENT_ASR_TOKEN) || undefined;
    if (!secretId || !secretKey) return { source, problem: '请配置完整的 TENCENT_ASR_SECRET_ID 和 TENCENT_ASR_SECRET_KEY' };
  }
  return { source, credentials: { appId, secretId, secretKey, ...(token ? { token } : {}) } };
}
