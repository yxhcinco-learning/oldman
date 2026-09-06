import { miniServices, refreshMiniAccount } from '../../services';
import { openLogin, clearLoginReturn } from '../../auth/navigation';
import { navigationMetrics } from '../../ui/navigation';
import { selectTab, setTabBarHidden } from '../../ui/tab-bar';
import type { AccountProfile } from '../../domain/core';
import type { AccountStatus } from '../../auth/account-client';

Page({
  accountUnsubscribe: undefined as (() => void) | undefined,
  syncUnsubscribe: undefined as (() => void) | undefined,
  observed: undefined as ReturnType<typeof miniServices> | undefined,
  data: { ...navigationMetrics(), menuOpen: false, editingProfile: false, logoutOpen: false, cloudError: '', canReconnect: false, needsLogin: true,
    nicknameInput: '', nicknameValid: true, busy: '', notice: '', error: '',
    account: null as AccountProfile | null, status: 'guest' as AccountStatus, avatarPath: '', syncText: '本机草稿', accountText: '尚未登录',
    exportLabel: '导出本机备份' },

  onLoad() { this.accountUnsubscribe = miniServices().account.subscribe(() => { void this.refreshState(); }); },
  onShow() { selectTab(this, 2); if (this.data.menuOpen || this.data.editingProfile) setTabBarHidden(this, true); void this.refreshState(); },
  onHide() { setTabBarHidden(this, false); },
  onUnload() { this.accountUnsubscribe?.(); this.syncUnsubscribe?.(); },
  async refreshState() {
    const services = miniServices();
    if (this.observed !== services) {
      this.setData({ avatarPath: '', editingProfile: false, nicknameInput: '', error: '', notice: '', menuOpen: false, logoutOpen: false });
      setTabBarHidden(this, false);
      this.syncUnsubscribe?.();
      this.observed = services;
      this.syncUnsubscribe = services.sync.subscribe(() => { void this.refreshState(); });
    }
    const state = services.account.snapshot(), sync = services.sync.snapshot();
    let readError = '';
    const works = await services.repository.allAggregates().catch(error => {
      readError = error instanceof Error ? error.message : '本机作品暂时无法读取。'; return [];
    });
    if (services !== miniServices()) return;
    const unsent = works.filter(item => !item.cloud?.recoveryOf && (!item.cloud?.version || item.cloud.operation || item.work.revision !== item.cloud.syncedRevision)).length;
    const accountText = { guest: '登录后保存您的作品', connecting: '正在登录', authenticated: '编辑头像与昵称', offline: '当前离线', expired: '登录已过期', replaced: '已在其他设备登录' }[state.status];
    const needsLogin = ['guest', 'expired', 'replaced', 'connecting'].includes(state.status);
    this.setData({ account: state.account, status: state.status, accountText,
      needsLogin, canReconnect: Boolean(state.account && !needsLogin && (sync.status === 'error' || sync.status === 'paused' || state.status === 'offline' || unsent)),
      syncText: readError ? '本机作品读取失败' : needsLogin && state.account ? '需重新登录' : sync.status === 'syncing' ? '正在同步' : sync.status === 'ready' ? unsent ? `${unsent} 篇作品未上传` : '作品已同步' : state.account ? '未上传' : '作品保存在本机',
      exportLabel: state.status === 'authenticated' ? '导出全部备份' : '导出本机备份',
      cloudError: readError || (state.account ? state.error || sync.error : '') });
    if (!state.account?.hasAvatar) { this.setData({ avatarPath: '' }); return; }
    const path = services.repository.paths.root + '/avatar-' + state.account.avatarVersion + '.jpg';
    try {
      await services.repository.load();
      if (!await services.files.exists(path) && state.status === 'authenticated') {
        const data = await services.account.request('/api/mini/account/avatar', 'GET', undefined, true);
        if (!(data instanceof ArrayBuffer) || data.byteLength > 256 * 1024) return;
        wx.getFileSystemManager().writeFileSync(path, data);
      }
      if (services === miniServices() && await services.files.exists(path)) this.setData({ avatarPath: path });
    } catch { /* Profile remains usable with the default avatar. */ }
  },
  async login() {
    if (this.data.busy) return;
    try { await openLogin({ url: '/pages/profile/index' }); }
    catch { this.setData({ error: '登录页暂时无法打开，请重试。' }); }
  },
  openAccount() { if (this.data.needsLogin) void this.login(); else this.openProfile(); },
  async reconnect() {
    this.setData({ busy: '正在核对云作品…', error: '', notice: '' });
    try { await refreshMiniAccount(); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '连接未成功。' }); }
    finally { this.setData({ busy: '' }); await this.refreshState(); }
  },
  logout() { this.setData({ logoutOpen: true, error: '' }); setTabBarHidden(this, true); },
  closeLogout() { if (this.data.busy) return; this.setData({ logoutOpen: false }); setTabBarHidden(this, false); },
  async confirmLogout() {
    if (this.data.busy) return;
    const services = miniServices();
    this.setData({ busy: '正在退出', error: '' });
    try {
      await services.writer.flush();
      if (services !== miniServices()) return;
      await services.account.logout();
      clearLoginReturn();
      if (services.account.snapshot().error) throw new Error(services.account.snapshot().error);
      await wx.reLaunch({ url: '/pages/login/index' });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '暂时未能退出，请重试。' }); }
    finally { this.setData({ busy: '' }); }
  },
  openProfile() { this.setData({ editingProfile: true, nicknameInput: this.data.account?.nickname ?? '', nicknameValid: true, error: '' }); setTabBarHidden(this, true); },
  closeProfile() { this.setData({ editingProfile: false }); setTabBarHidden(this, false); },
  onNickname(event: WechatMiniprogram.Input) { this.setData({ nicknameInput: event.detail.value, nicknameValid: true }); },
  onNicknameReview(event: WechatMiniprogram.CustomEvent<{ pass: boolean }>) {
    this.setData({ nicknameValid: event.detail.pass, ...(event.detail.pass ? {} : { error: '请换一个昵称后再保存。' }) });
  },
  async saveNickname() {
    if (!this.data.nicknameValid || this.data.busy) return;
    const services = miniServices();
    this.setData({ busy: '正在保存昵称…', error: '' });
    try { await services.account.updateNickname(this.data.nicknameInput); if (services === miniServices()) this.closeProfile(); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '昵称未保存。' }); }
    finally { this.setData({ busy: '' }); await this.refreshState(); }
  },
  async chooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    if (!event.detail.avatarUrl || this.data.busy) return;
    const services = miniServices();
    this.setData({ busy: '正在保存头像…', error: '' });
    try {
      const manager = wx.getFileSystemManager();
      const stat = manager.statSync(event.detail.avatarUrl) as WechatMiniprogram.Stats;
      if (stat.size > 2 * 1024 * 1024) throw new Error('头像超过 2MB，请选择较小的图片。');
      const data = manager.readFileSync(event.detail.avatarUrl);
      if (!(data instanceof ArrayBuffer)) throw new Error('无法读取头像，请重新选择。');
      await services.account.updateAvatar(data);
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '头像未保存，请重试。' }); }
    finally { this.setData({ busy: '' }); await this.refreshState(); }
  },
  openMenu() { setTabBarHidden(this, true); this.setData({ menuOpen: true, notice: '', error: '' }); },
  closeMenu() { this.setData({ menuOpen: false }); setTabBarHidden(this, false); },
  openPrivacy() { void wx.navigateTo({ url: '/pages/privacy/index' }); },
  manageWorks() { setTabBarHidden(this, false); void wx.reLaunch({ url: '/pages/works/index?manage=1' }); },
  openRecycle() { setTabBarHidden(this, false); void wx.reLaunch({ url: '/pages/works/index?recycle=1' }); },
  async exportBackup() {
    const services = miniServices();
    this.setData({ busy: '正在准备备份…', error: '', notice: '' });
    try {
      if (services.account.snapshot().status === 'authenticated') await services.sync.sync();
      if (services !== miniServices()) throw new Error('账号已变化，请重新导出。');
      await services.backups.exportAll();
      this.setData({ notice: '已打开微信文件分享，请保存每份 JSON 备份。' });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '备份导出失败。' }); }
    finally { this.setData({ busy: '' }); }
  },
  async importBackup() {
    const services = miniServices();
    this.setData({ busy: '正在校验备份…', error: '', notice: '' });
    try {
      const count = await services.backups.chooseAndImport();
      if (services === miniServices()) this.setData({ notice: count ? '已恢复 ' + count + ' 篇作品副本。' : '' });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '备份导入失败，原作品未改变。' }); }
    finally { this.setData({ busy: '' }); }
  },
  noop() {},
});
