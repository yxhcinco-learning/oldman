import { cloudChangesSchema, cloudMutationResultSchema, cloudWorkSchema, type CloudMutation } from '../domain/core';
import { AccountRequestError, type AccountPlatform, type MiniSessionAuthorizer } from '../auth/account-client';
import { errorMessage } from '../ui/error-message';

export class MiniCloudTransport {
  constructor(private readonly auth: MiniSessionAuthorizer, private readonly platform: AccountPlatform) {}
  private async request(path: string, method: 'GET' | 'POST' = 'GET', data?: unknown) {
    const result = await this.auth.authorizedRequest(token => this.platform.request(path, method, token, data));
    if (result.statusCode < 200 || result.statusCode >= 300) {
      const error = result.data as { code?: unknown; error?: unknown } | null;
      throw new AccountRequestError(typeof error?.code === 'string' ? error.code : 'cloud_unavailable',
        errorMessage(error?.error, '同步暂未完成，请重试。'), result.statusCode);
    }
    return result.data;
  }
  async changes(cursor: number) { return cloudChangesSchema.parse(await this.request(`/api/mini/works?cursor=${cursor}`), { jitless: true }); }
  async get(id: string) { return cloudWorkSchema.parse(await this.request(`/api/mini/works/${encodeURIComponent(id)}`), { jitless: true }); }
  async mutate(operation: CloudMutation) { return cloudMutationResultSchema.parse(await this.request('/api/mini/works/mutations', 'POST', operation), { jitless: true }); }
}
