import { newId, type CloudMutation, type CloudWorkEntry } from '../domain/core';
import { AccountRequestError, type MiniAccountClient } from '../auth/account-client';
import type { MiniCloudTransport } from '../network/cloud';
import type { MiniDraftWriter, MiniWorkRepository } from '../storage/repository';
import type { WorkAggregate } from '../storage/schema';

export interface SyncState { status: 'local' | 'syncing' | 'ready' | 'paused' | 'error'; error: string }
export class MiniCloudSync {
  private active = true;
  private failed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<void>;
  private readyIds = new Set<string>();
  private state: SyncState = { status: 'local', error: '' };
  private listeners = new Set<(state: SyncState) => void>();
  private unsubscribe: () => void;
  private preparations = new Set<() => Promise<void>>();
  beforeSync(prepare: () => Promise<void>) { this.preparations.add(prepare); return () => { this.preparations.delete(prepare); }; }
  constructor(readonly repository: MiniWorkRepository, private readonly writer: MiniDraftWriter, private readonly account: MiniAccountClient,
    private readonly transport: MiniCloudTransport, private readonly generation: number, private readonly guest?: MiniWorkRepository) {
    this.unsubscribe = repository.subscribe(() => this.schedule());
  }
  snapshot() { return { ...this.state }; }
  subscribe(listener: (state: SyncState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(state: SyncState) { this.state = state; this.listeners.forEach(listener => listener(this.snapshot())); }
  private assertActive() {
    if (!this.active || this.generation !== this.account.snapshot().generation || this.repository.accountId !== this.account.snapshot().account?.id) {
      throw new AccountRequestError('account_changed', '账号已变化，请重新打开作品。', 401);
    }
    if (['expired', 'replaced', 'guest', 'connecting'].includes(this.account.snapshot().status)) throw new AccountRequestError('login_required', '请点击微信登录以继续。', 401);
  }
  dispose() { this.active = false; this.unsubscribe(); if (this.timer) clearTimeout(this.timer); this.pause('账号已变化，请重新打开作品。'); }
  pause(message = '云作品暂停编辑，请联网后重试。') {
    this.readyIds.clear(); this.failed = true;
    this.publish(this.repository.accountId ? { status: 'paused', error: message } : { status: 'local', error: '' });
  }
  canEdit(id: string, cloudVersion: number) { return !cloudVersion || this.active && this.readyIds.has(id) && this.account.snapshot().status === 'authenticated'; }
  private schedule() {
    if (!this.active || !this.repository.accountId || this.failed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.sync().catch(() => undefined); }, 1000);
  }

  sync(): Promise<void> {
    if (!this.repository.accountId) return Promise.resolve();
    if (this.flight) return this.flight;
    this.failed = false;
    this.flight = this.run().catch(error => {
      if (this.active) { this.failed = true; if (!(error instanceof AccountRequestError && error.status === 413)) this.readyIds.clear(); this.publish({ status: 'error', error: error instanceof Error ? error.message : '云保存失败，内容仍保留在本机。' }); }
      throw error;
    }).finally(() => { this.flight = undefined; });
    return this.flight;
  }

  private async sendPending(aggregate: WorkAggregate) {
    const operation = aggregate.cloud?.operation;
    if (!operation) return;
    this.assertActive();
    try {
      const result = await this.transport.mutate(operation);
      this.assertActive();
      await this.repository.acknowledge(aggregate.work.id, result);
      if (!result.entry.purged) this.readyIds.add(aggregate.work.id);
    } catch (error) {
      if (!(error instanceof AccountRequestError) || error.status !== 409 || error.code === 'operation_mismatch') throw error;
      const remote = await this.transport.get(aggregate.work.id);
      this.assertActive();
      await this.repository.installRemote(remote);
      if (!remote.purged) this.readyIds.add(remote.id);
    }
  }

  private async directory() {
    const entries = new Map<string, CloudWorkEntry>();
    let cursor = 0;
    while (true) {
      this.assertActive();
      const page = await this.transport.changes(cursor);
      for (const entry of page.entries) entries.set(entry.id, entry);
      if (!page.hasMore) return entries;
      if (page.cursor <= cursor) throw new Error('云作品目录无法继续读取，请重试。');
      cursor = page.cursor;
    }
  }

  private async migrateGuest(entries: Map<string, CloudWorkEntry>) {
    if (!this.guest) return;
    const snapshot = await this.guest.load();
    if (snapshot.recovery || snapshot.pendingSessions.length) throw new Error('本机有待恢复的输入，请先保存或导出，再登录同步。');
    for (const source of await this.guest.allAggregates(true)) {
      this.assertActive();
      const claim = source.cloud?.claim;
      if (claim?.complete || claim && claim.accountId !== this.repository.accountId) continue;
      const targetId = claim?.targetId ?? (entries.has(source.work.id) ? newId() : source.work.id);
      const claimed = await this.guest.claim(source.work.id, this.repository.accountId!, targetId);
      this.assertActive();
      await this.repository.addClaimed(claimed, targetId);
      await this.guest.claim(source.work.id, this.repository.accountId!, targetId, true);
    }
  }

  private async run() {
    this.assertActive();
    this.publish({ status: 'syncing', error: '' });
    await this.account.refresh();
    this.assertActive();
    for (const prepare of this.preparations) await prepare();
    await this.writer.flush();
    // Replay frozen operations before pulling to reconcile an ACK lost after commit.
    for (const local of await this.repository.allAggregates()) await this.sendPending(local);
    const entries = await this.directory();
    await this.migrateGuest(entries);
    const locals = new Map((await this.repository.allAggregates()).map(item => [item.work.id, item]));
    for (const entry of entries.values()) {
      this.assertActive();
      const local = locals.get(entry.id);
      if (!local || entry.version > (local.cloud?.version ?? 0)) {
        const remote = await this.transport.get(entry.id);
        this.assertActive();
        await this.repository.installRemote(remote);
      }
      if (!entry.purged) this.readyIds.add(entry.id);
    }
    for (const local of await this.repository.allAggregates()) {
      this.assertActive();
      if (local.cloud?.recoveryOf) continue;
      const operation = await this.repository.queueMutation(local.work.id);
      if (operation) await this.sendPending((await this.repository.getAggregate(local.work.id))!);
    }
    this.assertActive();
    this.publish({ status: 'ready', error: '' });
  }

  async open(id: string) {
    try { await this.sync(); }
    catch (error) { if (!(error instanceof AccountRequestError && error.status === 413)) throw error; }
    const local = await this.repository.getAggregate(id);
    if (!local?.cloud?.version || local.cloud.recoveryOf) return;
    const remote = await this.transport.get(id);
    this.assertActive();
    await this.repository.installRemote(remote);
    if (remote.purged || remote.deletedAt) throw new Error('这篇作品已移入回收站或删除。');
    this.readyIds.add(id);
  }

  async lifecycle(id: string, kind: 'trash' | 'restore' | 'purge', expectedRevision: number) {
    await this.writer.flush();
    const initial = await this.repository.getAggregate(id);
    if (!initial || initial.work.revision !== expectedRevision) throw new Error('作品已变化，请刷新后重试。');
    if (!initial.cloud?.version && !initial.cloud?.operation) {
      if (kind === 'purge') return this.repository.permanentlyDelete(id, expectedRevision);
      return this.repository.setDeleted(id, kind === 'trash', expectedRevision);
    }
    await this.openForLifecycle(id);
    const latest = await this.repository.getAggregate(id);
    if (!latest || latest.work.revision !== expectedRevision) throw new Error('云作品已更新，请刷新后重新确认。');
    await this.repository.queueMutation(id, kind as CloudMutation['kind']);
    await this.sendPending((await this.repository.getAggregate(id))!);
    this.publish(this.state);
  }
  private async openForLifecycle(id: string) {
    this.assertActive();
    await this.account.refresh();
    const pending = await this.repository.getAggregate(id);
    if (pending?.cloud?.operation) await this.sendPending(pending);
    const remote = await this.transport.get(id);
    this.assertActive();
    await this.repository.installRemote(remote);
  }
}
