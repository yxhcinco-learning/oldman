import { MiniBackupController, WxBackupFilePlatform } from './backup/file-transfer';
import { WxLocalFileSystem } from './storage/file-system';
import { MiniDraftWriter, MiniWorkRepository } from './storage/repository';
import { ConversationMemory } from './state/conversation-memory';
import { MiniArticleAiController } from './ai/controller';
import { MiniAccountClient, WxAccountAdapter, type AccountState } from './auth/account-client';
import { MINI_API_ORIGIN } from './network/config';
import { AuthenticatedMiniAiTransport } from './network/ai';
import { MiniCloudTransport } from './network/cloud';
import { MiniCloudSync } from './sync/controller';
import { MiniPublicationClient } from './publication/client';
import { MiniPublicationStorage, WxPublicationFiles } from './publication/storage';
import { MiniSpeechSession, MiniSpeechTicketClient, WxMiniRecorder, WxMiniSpeechPermissions, WxMiniSpeechSocketFactory, WxMiniSpeechTicketPlatform } from './speech/session';
import { MiniAiConsent, WxMiniAiConsentPlatform } from './privacy/ai-consent';

const files = new WxLocalFileSystem();
const adapter = new WxAccountAdapter(MINI_API_ORIGIN);
const account = new MiniAccountClient(adapter, adapter);
const guestRepository = new MiniWorkRepository(files, wx.env.USER_DATA_PATH);
const aiConsent = new MiniAiConsent(new WxMiniAiConsentPlatform());

function createServices(state: AccountState) {
  const owner = state.account?.id;
  const repository = owner ? new MiniWorkRepository(files, wx.env.USER_DATA_PATH, undefined, owner) : guestRepository;
  const writer = new MiniDraftWriter(repository);
  const authorizer = account.bound(state.generation, owner ?? null);
  const backups = new MiniBackupController(repository, files, new WxBackupFilePlatform());
  const conversations = new ConversationMemory((id, value) => writer.setWritingState(id, value));
  const articleAi = new MiniArticleAiController(repository, writer, new AuthenticatedMiniAiTransport(authorizer));
  const speech = new MiniSpeechSession({ permissions: new WxMiniSpeechPermissions(),
    tickets: new MiniSpeechTicketClient(authorizer, new WxMiniSpeechTicketPlatform()), sockets: new WxMiniSpeechSocketFactory(), recorder: new WxMiniRecorder() });
  const sync = new MiniCloudSync(repository, writer, account, new MiniCloudTransport(authorizer, adapter), state.generation, owner ? guestRepository : undefined);
  const publications = new MiniPublicationClient(authorizer, adapter);
  const publicationStorage = new MiniPublicationStorage(new WxPublicationFiles(), repository.paths.root);
  return { files, repository, writer, backups, conversations, articleAi, auth: account, account, speech, aiConsent, sync, publications, publicationStorage, generation: state.generation };
}
let current = createServices(account.snapshot());
let foregroundTimer: ReturnType<typeof setInterval> | undefined;
account.subscribe(state => {
  if (current.generation !== state.generation || current.repository.accountId !== state.account?.id) {
    const previous = current;
    previous.sync.dispose();
    previous.speech.interrupt('账号已变化，已收到的文字保留在原账号。');
    void previous.articleAi.cancelActive().catch(() => undefined);
    current = createServices(state);
    if (state.status === 'authenticated') void current.sync.sync().catch(() => undefined);
  } else if (state.status !== 'authenticated') {
    current.sync.pause(state.error || '请联网并登录后继续编辑云作品。');
    current.speech.interrupt('在线连接已中断，已收到的文字保留在本机。');
    if (['expired', 'replaced'].includes(state.status)) void current.articleAi.cancelActive().catch(() => undefined);
  }
});

export function miniServices() { return current; }
export async function loginMiniAccount() {
  await current.writer.flush();
  if (!current.repository.accountId) {
    const snapshot = await current.repository.load();
    current.writer.recoverPending(snapshot.pendingSessions);
    for (const record of snapshot.pendingSessions) await current.writer.retrySessionSave(record.workId);
    if (snapshot.recovery) {
      current.writer.seed(snapshot.recovery.draft.id, snapshot.recovery.revision);
      if (snapshot.recoveryWritingState) current.writer.setWritingState(snapshot.recovery.draft.id, snapshot.recoveryWritingState);
      await current.writer.write(snapshot.recovery.draft, snapshot.recoverySession ?? undefined);
    }
  }
  await account.login();
  await current.sync.sync();
}
export async function refreshMiniAccount() {
  await account.restore();
  await account.refresh();
  await current.sync.sync();
}
export function resumeMiniServices() {
  void refreshMiniAccount().catch(() => undefined);
  if (!foregroundTimer) foregroundTimer = setInterval(() => { void refreshMiniAccount().catch(() => undefined); }, 30_000);
}
export function pauseMiniServices() {
  if (foregroundTimer) clearInterval(foregroundTimer);
  foregroundTimer = undefined;
  current.speech.interrupt('已切到后台，已收到的文字保留在本机。');
  current.sync.pause('返回后将核对最新云作品。');
}
export function registerMiniNetwork() {
  wx.onNetworkStatusChange(state => {
    if (!state.isConnected) account.setOffline();
    else void refreshMiniAccount().catch(() => undefined);
  });
}
