import type { PublicationStatus, PublicationPreview, PublicationSettingsInput, SubmissionInput, PublicationAction,
  PublicArticlePage, PublicArticle, CoverCrops, PublicationContent, SubmissionSummary } from '../domain/core';
import { AccountRequestError, type AccountPlatform, type MiniSessionAuthorizer } from '../auth/account-client';
import { errorMessage } from '../ui/error-message';
import { publicationBytes } from './binary';

const base = (id: string) => '/api/mini/publications/' + encodeURIComponent(id);
export type OwnSubmission = PublicationContent & SubmissionSummary & { assetId: string };
export class MiniPublicationClient {
  private statusesFlight?: Promise<{ publications: PublicationStatus[] }>;
  constructor(private readonly auth: MiniSessionAuthorizer, private readonly platform: AccountPlatform) {}
  async request<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', data?: unknown, binary = false): Promise<T> {
    const response = await this.auth.authorizedRequest(token => this.platform.request(path, method, token, data, binary));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const articleList = path.split('?')[0] === '/api/mini/articles';
      const fallback = response.statusCode === 429 ? '请求较频繁，请稍后重试。' : articleList ? '文章列表暂时无法读取，请稍后重试。'
        : response.statusCode === 404 ? '这篇文章暂时无法查看。' : '文章服务暂不可用，请重试。';
      let payload = response.data as { code?: unknown; error?: unknown } | null;
      if (response.data instanceof ArrayBuffer) payload = null;
      throw new AccountRequestError(typeof payload?.code === 'string' ? payload.code : response.statusCode === 429 ? 'rate_limited' : 'publication_unavailable',
        articleList && response.statusCode === 404 ? fallback : errorMessage(payload?.error, fallback), response.statusCode);
    }
    if (method !== 'GET') this.statusesFlight = undefined;
    return (binary ? publicationBytes(response.data) : response.data) as T;
  }
  statuses() {
    if (!this.statusesFlight) {
      const flight = this.request<{ publications: PublicationStatus[] }>('/api/mini/publications').finally(() => {
        if (this.statusesFlight === flight) this.statusesFlight = undefined;
      });
      this.statusesFlight = flight;
    }
    return this.statusesFlight;
  }
  status(id: string) { return this.request<PublicationStatus>(base(id)); }
  submission(id: string, submissionId: string) { return this.request<OwnSubmission>(base(id) + '/submissions/' + encodeURIComponent(submissionId)); }
  upload(id: string, assetId: string, bytes: ArrayBuffer) { return this.request<{ assetId: string; width: number; height: number; crops: CoverCrops }>(base(id) + '/images/' + encodeURIComponent(assetId), 'POST', bytes); }
  settings(id: string, input: PublicationSettingsInput) { return this.request<{ settingsVersion: number; assetId: string }>(base(id) + '/settings', 'PUT', input); }
  preview(id: string) { return this.request<PublicationPreview>(base(id) + '/preview'); }
  submit(id: string, input: SubmissionInput) { return this.request<{ articleId: string; submissionId: string; version: number }>(base(id) + '/submissions', 'POST', input); }
  action(id: string, input: PublicationAction) { return this.request<{ version: number }>(base(id) + '/actions', 'POST', input); }
  ownImage(id: string, assetId: string, variant: 'master' | 'thumbnail' | 'reading') {
    return this.request<ArrayBuffer>(base(id) + '/images/' + encodeURIComponent(assetId) + '/' + variant, 'GET', undefined, true);
  }
  list(cursor?: string) { return this.request<PublicArticlePage>('/api/mini/articles' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')); }
  article(id: string) { return this.request<PublicArticle>('/api/mini/articles/' + encodeURIComponent(id)); }
  image(id: string, variant: 'thumbnail' | 'reading') { return this.request<ArrayBuffer>('/api/mini/articles/' + encodeURIComponent(id) + '/images/' + variant, 'GET', undefined, true); }
}
