import { MiniBackupController, WxBackupFilePlatform } from './backup/file-transfer';
import { WxLocalFileSystem } from './storage/file-system';
import { MiniDraftWriter, MiniWorkRepository } from './storage/repository';

const files = new WxLocalFileSystem();
const repository = new MiniWorkRepository(files, wx.env.USER_DATA_PATH);
const writer = new MiniDraftWriter(repository);
const backups = new MiniBackupController(repository, files, new WxBackupFilePlatform());

export function miniServices() {
  return { files, repository, writer, backups };
}
