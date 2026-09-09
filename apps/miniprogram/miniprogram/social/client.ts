import type { AccountPlatform, MiniSessionAuthorizer } from '../auth/account-client';
import { AccountRequestError } from '../auth/account-client';
import { publicationBytes } from '../publication/binary';
import { errorMessage } from '../ui/error-message';
import { newId, type PublicArticle, type PublicArticlePage, type Engagement, type CommentPage, type OwnComment,
  type SocialMutation, type ReactionResult, type FollowState, type AuthorProfile, type CollectionPage,
  type RelationshipPage, type FlowerWallet, type FlowerHistoryPage, type SocialSummary, type GiftReceipt, type AudienceInput, type SocialEventInput } from '../domain/core';

const articlePath = (id: string) => '/articles/' + encodeURIComponent(id);
const authorPath = (id: string) => '/authors/' + encodeURIComponent(id);
const paged = (path: string, cursor?: string | null) => path + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
let visitSession = newId(), visitStarted = Date.now();
const visits = new Set<string>();

/** Public requests never carry a token; account requests never fall back to public data. */
export class MiniSocialClient {
  private flights = new Map<string, Promise<unknown>>();
  private claimFlight?: Promise<FlowerWallet>;
  private readArticles = new Set<string>();
  private operations = new Map<string, { operationId: string; input: string }>();
  constructor(private readonly auth: MiniSessionAuthorizer, private readonly platform: AccountPlatform) {}
  async request<T>(path: string, authenticated: boolean, method: 'GET' | 'POST' | 'PUT' = 'GET', data?: unknown, binary = false): Promise<T> {
    const key = `${authenticated}:${path}:${binary}`;
    if (method === 'GET' && this.flights.has(key)) return this.flights.get(key) as Promise<T>;
    const run = async () => {
      const response = authenticated ? await this.auth.authorizedRequest(token => this.platform.request('/api/mini' + path, method, token, data, binary))
        : await this.platform.request('/api/public' + path, method, undefined, data, binary);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const payload = response.data as { code?: string; error?: string } | null;
        throw new AccountRequestError(payload?.code ?? 'social_unavailable', errorMessage(payload?.error,
          response.statusCode === 429 ? '操作较频繁，请稍后重试。' : response.statusCode === 404 ? '内容暂时无法查看。' : '暂时无法连接，请重试。'), response.statusCode);
      }
      return (binary ? publicationBytes(response.data) : response.data) as T;
    };
    const flight = run();
    if (method === 'GET') { this.flights.set(key, flight); void flight.finally(() => { if (this.flights.get(key) === flight) this.flights.delete(key); }).catch(() => undefined); }
    return flight;
  }
  article(id: string, authenticated: boolean) { return this.request<PublicArticle>(articlePath(id), authenticated); }
  image(id: string, authenticated: boolean, variant: 'reading' | 'thumbnail' = 'reading') { return this.request<ArrayBuffer>(articlePath(id) + '/images/' + variant, authenticated, 'GET', undefined, true); }
  comments(id: string, authenticated: boolean, cursor?: string | null) { return this.request<CommentPage>(paged(articlePath(id) + '/comments', cursor), authenticated); }
  engagement(id: string) { return this.request<Engagement>(articlePath(id) + '/engagement', true); }
  reaction(id: string, kind: 'like' | 'collection', input: SocialMutation) { return this.request<ReactionResult>(articlePath(id) + '/' + kind, true, 'PUT', input); }
  author(id: string, authenticated: boolean) { return this.request<AuthorProfile>(authorPath(id), authenticated); }
  articles(id: string, authenticated: boolean, cursor?: string | null) { return this.request<PublicArticlePage>(paged(authorPath(id) + '/articles', cursor), authenticated); }
  follow(id: string, input: SocialMutation) { return this.request<FollowState>(authorPath(id) + '/follow', true, 'PUT', input); }
  collections(cursor?: string | null) { return this.request<CollectionPage>(paged('/me/collections', cursor), true); }
  relationships(kind: 'following' | 'followers' | 'mutuals', cursor?: string | null) { return this.request<RelationshipPage>(paged('/me/' + kind, cursor), true); }
  wallet() { return this.request<FlowerWallet>('/me/flowers', true); }
  summary() { return this.request<SocialSummary>('/me/social', true); }
  history(cursor?: string | null) { return this.request<FlowerHistoryPage>(paged('/me/flowers/history', cursor), true); }
  claim() {
    if (!this.claimFlight) this.claimFlight = (async () => {
      // The server date governs eligibility even when the device clock is wrong.
      const wallet = await this.wallet();
      return wallet.claimedToday ? wallet : this.request<FlowerWallet>('/me/flowers/claim', true, 'POST', {});
    })().finally(() => { this.claimFlight = undefined; });
    return this.claimFlight;
  }
  private operation(key: string, input: unknown) {
    const encoded = JSON.stringify(input), existing = this.operations.get(key);
    if (existing && existing.input !== encoded) throw new Error('上次操作结果尚未确认，请先重试原操作。');
    if (existing) return existing.operationId;
    if (this.operations.size >= 20) throw new Error('尚有未确认操作，请先重试。');
    const operationId = newId(); this.operations.set(key, { operationId, input: encoded }); return operationId;
  }
  async confirmed<T>(key: string, input: unknown, perform: (operationId: string) => Promise<T>): Promise<T> {
    const operationId = this.operation(key, input);
    try { const result = await perform(operationId); if (this.operations.get(key)?.operationId === operationId) this.operations.delete(key); return result; }
    catch (error) { const status = (error as { status?: number }).status; if (status && status >= 400 && status < 500 && status !== 408 && status !== 429 && this.operations.get(key)?.operationId === operationId) this.operations.delete(key); throw error; }
  }
  pendingComment(id: string) { const pending = this.operations.get('comment:' + id); return pending ? (JSON.parse(pending.input) as {text: string}).text : undefined; }
  hasPending(key: string) { return this.operations.has(key); }
  comment(id: string, text: string) { return this.confirmed('comment:' + id, { text }, operationId => this.request<OwnComment>(articlePath(id) + '/comments', true, 'POST', { operationId, text })); }
  gift(id: string) { return this.confirmed('gift:' + id, {}, operationId => this.request<GiftReceipt>(articlePath(id) + '/gifts', true, 'POST', { operationId, gift: 'flower' })); }
  deleteComment(id: string, expectedVersion: number) { return this.confirmed('delete:' + id, { expectedVersion }, operationId => this.request<{ deleted: true }>('/comments/' + encodeURIComponent(id) + '/delete', true, 'POST', { operationId, expectedVersion })); }
  report(id: string, reason: string) { return this.confirmed('report:' + id, { reason }, operationId => this.request<{ reported: true }>('/comments/' + encodeURIComponent(id) + '/reports', true, 'POST', { operationId, reason })); }
  audience(workId: string, input: AudienceInput) { return this.request<{ audience: 'account' | 'guest'; audienceVersion: number }>('/publications/' + encodeURIComponent(workId) + '/audience', true, 'PUT', input); }
  visitArticle(id: string) { const repeated = this.readArticles.has(id); if (this.readArticles.size >= 100) this.readArticles.delete(this.readArticles.values().next().value!); this.readArticles.add(id); return repeated; }
  event(articleId: string, event: SocialEventInput['event'], action: SocialEventInput['action'], authenticated: boolean) {
    const now = Date.now();
    if (now < visitStarted || now - visitStarted >= 25 * 60_000) { visitSession = newId(); visitStarted = now; visits.clear(); }
    const key = event + ':' + articleId + ':' + action;
    if (visits.has(key) || visits.size >= 100) return;
    visits.add(key);
    void this.request('/social/events', authenticated, 'POST', { eventId: newId(), sessionId: visitSession, articleId, event, action }).catch(() => undefined);
  }
}
