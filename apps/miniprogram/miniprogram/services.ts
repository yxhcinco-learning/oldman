import { MiniBackupController, WxBackupFilePlatform } from './backup/file-transfer';
import { WxLocalFileSystem } from './storage/file-system';
import { MiniDraftWriter, MiniWorkRepository } from './storage/repository';
import { ConversationMemory } from './state/conversation-memory';
import { MiniArticleAiController } from './ai/controller';
import { MiniAuthClient, WxMiniAuthAdapter } from './auth/client';
import { MINI_API_ORIGIN } from './network/config';

const files = new WxLocalFileSystem();
const repository = new MiniWorkRepository(files, wx.env.USER_DATA_PATH);
const writer = new MiniDraftWriter(repository);
const backups = new MiniBackupController(repository, files, new WxBackupFilePlatform());
const conversations = new ConversationMemory();
const articleAi = new MiniArticleAiController(repository, writer);
const authAdapter = new WxMiniAuthAdapter(MINI_API_ORIGIN);
const auth = new MiniAuthClient(authAdapter, authAdapter);

export function miniServices() {
  return { files, repository, writer, backups, conversations, articleAi, auth };
}
