export interface RepositoryPaths {
  root: string;
  works: string;
  quarantine: string;
  index: string;
  recovery: string;
}

const SAFE_WORK_ID = /^[A-Za-z0-9_-]{1,128}$/;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function repositoryPaths(userDataPath: string, accountId?: string): RepositoryPaths {
  const userRoot = trimTrailingSlash(userDataPath);
  const isAbsoluteFilePath = userRoot.startsWith('/');
  const isWxUserPath = /^wxfile:\/\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(userRoot);
  const isDevtoolUserPath = /^http:\/\/usr(?:\/[A-Za-z0-9_-]+)*$/.test(userRoot);
  if (!userRoot || userRoot.includes('\\') || userRoot.split('/').includes('..') || (!isAbsoluteFilePath && !isWxUserPath && !isDevtoolUserPath)) {
    throw new Error('用户文件根路径无效');
  }
  if (accountId && !SAFE_WORK_ID.test(accountId)) throw new Error('账号文件路径无效');
  const root = accountId ? `${userRoot}/suiyue-accounts/${accountId}` : `${userRoot}/suiyue-v1`;
  return { root, works: `${root}/works`, quarantine: `${root}/quarantine`, index: `${root}/index.json`, recovery: `${root}/active-recovery.json` };
}

export function workFileName(id: string): string {
  if (!SAFE_WORK_ID.test(id)) throw new Error('作品标识不能用于本地文件路径');
  return `${id}.work.json`;
}

export function workFilePath(paths: RepositoryPaths, id: string): string {
  const candidate = `${paths.works}/${workFileName(id)}`;
  if (!candidate.startsWith(`${paths.works}/`)) throw new Error('作品文件路径越界');
  return candidate;
}

export function workIdFromFileName(fileName: string): string | null {
  const match = /^([A-Za-z0-9_-]{1,128})\.work\.json$/.exec(fileName);
  return match?.[1] ?? null;
}
