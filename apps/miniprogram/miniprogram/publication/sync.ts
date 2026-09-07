import type { MiniWorkRepository } from '../storage/repository';

/** A pre-existing sync flight may finish before it has observed the latest local edit. */
export async function syncPublicationWork(workId: string, repository: MiniWorkRepository, sync: () => Promise<void>) {
  await sync();
  const local = await repository.getAggregate(workId);
  if (!local || local.work.deletedAt || local.cloud?.recoveryOf) throw new Error('文章状态已变化，请返回我的文章重新打开。');
  const cloud = local.cloud;
  if (!cloud?.version || cloud.operation || cloud.syncedRevision !== local.work.revision) {
    throw new Error('最新正文尚未同步完成，请重试预览。');
  }
  return cloud.version;
}
