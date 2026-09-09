import { errorMessage } from '../../ui/error-message';
import { accountPage } from '../../auth/page';
import { miniServices, refreshMiniAccount } from '../../services';
import { openLogin, clearLoginReturn } from '../../auth/navigation';
import { navigationMetrics } from '../../ui/navigation';
import { selectTab, setTabBarHidden } from '../../ui/tab-bar';
import type { SocialSummary, FlowerWallet, AccountProfile } from '../../domain/core';
import type { AccountStatus } from '../../auth/account-client';

accountPage({
  alive: true, visible: true, refreshSequence: 0, socialSequence: 0,
  accountUnsubscribe: undefined as (() => void) | undefined,
  syncUnsubscribe: undefined as (() => void) | undefined,
  observed: undefined as ReturnType<typeof miniServices> | undefined,
  data: { socialSummary: null as SocialSummary | null, flowerWallet: null as FlowerWallet | null, socialError: '', ...navigationMetrics(), articleTotal: 0, publishedCount: 0, libraryReady: false, publicationKnown: false, profileReturn: 'home', settingsOpen: false, libraryManaging: false, menuOpen: false, editingProfile: false, logoutOpen: false, cloudError: '', canReconnect: false, needsLogin: true,
    nicknameInput: '', nicknameValid: true, busy: '', notice: '', error: '', nameKeyboardHeight: 0, compactProfile: false,
    account: null as AccountProfile | null, status: 'guest' as AccountStatus, avatarPath: '', syncText: '本机草稿', accountText: '尚未登录',
    exportLabel: '导出本机文字副本' },

  onLoad() { this.accountUnsubscribe = miniServices().account.subscribe(state => { if (!['authenticated', 'offline'].includes(state.status) || this.observed !== miniServices()) { this.socialSequence++; this.setData({ socialSummary: null, flowerWallet: null }); } if (this.visible) void this.refreshState(); }); },
  onShow() { this.visible = true; selectTab(this, 2); if (this.data.menuOpen || this.data.editingProfile || this.data.settingsOpen || this.data.logoutOpen) setTabBarHidden(this, true); void this.refreshState(); void this.refreshSocial(); },
  onHide() { this.visible = false; this.refreshSequence++; this.socialSequence++; setTabBarHidden(this, false); },
  onUnload() { this.alive = false; this.refreshSequence++; this.accountUnsubscribe?.(); this.syncUnsubscribe?.(); },
  nameKeyboard(event: WechatMiniprogram.CustomEvent<{ height: number }>) {
    const height = event.detail.height;
    this.setData({ nameKeyboardHeight: height, compactProfile: height > 0 && wx.getWindowInfo().windowHeight - height - this.data.navigationHeight < 460 });
  },
  async refreshState() {
    if (!this.alive || !this.visible) return;
    const services = miniServices(), sequence = ++this.refreshSequence;
    if (this.observed !== services) {
      this.setData({ socialSummary: null, flowerWallet: null, socialError: '', settingsOpen: false, libraryManaging: false, articleTotal: 0, publishedCount: 0, libraryReady: false, publicationKnown: false, profileReturn: 'home', avatarPath: '', editingProfile: false, nicknameInput: '', nameKeyboardHeight: 0, compactProfile: false, busy: '', error: '', notice: '', menuOpen: false, logoutOpen: false });
      setTabBarHidden(this, false);
      this.syncUnsubscribe?.();
      this.observed = services;
      this.syncUnsubscribe = services.sync.subscribe(() => { if (this.visible) void this.refreshState(); });
    }
    const state = services.account.snapshot(), sync = services.sync.snapshot();
    let readError = '';
    const works = await services.repository.allAggregates().catch(error => {
      readError = errorMessage(error, '本机作品暂时无法读取。'); return [];
    });
    if (services !== miniServices() || !this.alive || !this.visible || sequence !== this.refreshSequence) return;
    const unsent = works.filter(item => !item.cloud?.recoveryOf && (!item.cloud?.version || item.cloud.operation || item.work.revision !== item.cloud.syncedRevision)).length;
    const accountText = { guest: '登录后保存您的作品', connecting: '正在登录', authenticated: '编辑头像与用户名', offline: '当前离线', expired: '登录已过期', replaced: '已在其他设备登录' }[state.status];
    const needsLogin = ['guest', 'expired', 'replaced', 'connecting'].includes(state.status);
    const cloudIssue = state.error || (sync.status === 'error' ? sync.error : '');
    this.setData({ account: state.account, status: state.status, accountText,
      needsLogin, canReconnect: Boolean(state.account && !needsLogin && sync.status !== 'syncing' && (readError || sync.status === 'error' || state.status === 'offline')),
      syncText: readError ? '作品暂时无法读取' : needsLogin && state.account ? '请重新登录' : sync.status === 'syncing' ? '正在同步…'
        : !works.length ? '还没有作品' : unsent ? `${unsent} 篇待同步` : works.every(item => item.cloud?.recoveryOf) ? '恢复稿保存在本机' : '作品已保存到云端',
      exportLabel: state.status === 'authenticated' ? '导出文字副本' : '导出本机文字副本',
      cloudError: readError || (state.account && cloudIssue ? errorMessage(cloudIssue, '保存暂未完成，请重试。') : '') });
    if (!state.account?.hasAvatar) { this.setData({ avatarPath: '' }); return; }
    const path = services.repository.paths.root + '/avatar-' + state.account.avatarVersion + '.jpg';
    try {
      await services.repository.load();
      const exists = await services.files.exists(path);
      if (services !== miniServices() || !this.alive || !this.visible || sequence !== this.refreshSequence) return;
      if (!exists && state.status === 'authenticated') {
        const data = await services.account.request('/api/mini/account/avatar', 'GET', undefined, true);
        if (!(data instanceof ArrayBuffer) || data.byteLength > 256 * 1024) return;
        wx.getFileSystemManager().writeFileSync(path, data);
      }
      if (await services.files.exists(path) && services === miniServices() && this.alive && this.visible && sequence === this.refreshSequence) this.setData({ avatarPath: path });
    } catch { /* Profile remains usable with the default avatar. */ }
  },
  async refreshSocial() {
    const source = miniServices(), sequence = ++this.socialSequence;
    this.setData({ socialSummary: null, flowerWallet: null, socialError: '' });
    const valid = () => this.alive && this.visible && source === miniServices() && sequence === this.socialSequence;
    await Promise.all([source.social.summary().then(socialSummary => { if (valid()) this.setData({ socialSummary }); }), source.social.wallet().then(flowerWallet => { if (valid()) this.setData({ flowerWallet }); })].map(p => p.catch(error => { if (valid()) this.setData({ socialError: errorMessage(error, '阅读与关注暂时无法读取。') }); })));
  },
  openSocial(event: WechatMiniprogram.TouchEvent) {
    const page = event.currentTarget.dataset.page, tab = event.currentTarget.dataset.tab;
    if (!['collections', 'flowers', 'relationships'].includes(page)) return;
    const query = page === 'relationships' && ['following', 'followers', 'mutuals'].includes(tab) ? '?tab=' + tab : '';
    void wx.navigateTo({ url: '/pages/' + page + '/index' + query });
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
    catch (error) { this.setData({ error: errorMessage(error, '连接未成功。') }); }
    finally { this.setData({ busy: '' }); await this.refreshState(); }
  },
  logout() { this.setData({ logoutOpen: true, error: '' }); setTabBarHidden(this, true); },
  closeLogout() { if (this.data.busy) return; this.setData({ logoutOpen: false }); setTabBarHidden(this, this.data.settingsOpen); },
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
    } catch (error) { this.setData({ error: errorMessage(error, '暂时未能退出，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  openProfile() { this.setData({ profileReturn: this.data.settingsOpen ? 'settings' : 'home', settingsOpen: false, editingProfile: true, nicknameInput: this.data.account?.nickname ?? '', nicknameValid: true, error: '' }); setTabBarHidden(this, true); },
  closeProfile() { const settingsOpen = this.data.profileReturn === 'settings'; this.setData({ editingProfile: false, nameKeyboardHeight: 0, compactProfile: false, settingsOpen }); setTabBarHidden(this, settingsOpen); },
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
    } catch (error) { if (services === miniServices()) this.setData({ error: errorMessage(error, '头像未保存，请重试。') }); }
    finally { if (services === miniServices()) { this.setData({ busy: '' }); await this.refreshState(); } }
  },
  openMenu() { setTabBarHidden(this, true); this.setData({ settingsOpen: false, menuOpen: true, notice: '', error: '' }); },
  closeMenu() { if (this.data.busy) return; this.setData({ menuOpen: false, settingsOpen: true }); setTabBarHidden(this, true); },
  openPrivacy() { void wx.navigateTo({ url: '/pages/privacy/index' }); },
  async nameSaved() { this.closeProfile(); await this.refreshState(); },
  manageWorks() { this.closeSettings(); void wx.navigateTo({ url: '/pages/works/index' }); },
  openSettings() { this.setData({ settingsOpen: true }); setTabBarHidden(this, true); },
  closeSettings() { this.setData({ settingsOpen: false }); setTabBarHidden(this, false); },
  articleSummary(event: WechatMiniprogram.CustomEvent<{ total: number; published: number; statusKnown: boolean }>) { this.setData({ articleTotal: event.detail.total, publishedCount: event.detail.published, libraryReady: true, publicationKnown: event.detail.statusKnown }); },
  libraryManage(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) { this.setData({ libraryManaging: event.detail.value }); },
  writeArticle() { void wx.navigateTo({ url: '/pages/editor/index' }); },
  async onPullDownRefresh() { try { await this.selectComponent('.author-articles')?.refresh(); await this.refreshState(); } finally { void wx.stopPullDownRefresh(); } },
  openRecycle() { this.closeSettings(); setTabBarHidden(this, false); void wx.navigateTo({ url: '/pages/works/index?recycle=1' }); },
  async exportBackup() {
    const services = miniServices();
    this.setData({ busy: '正在准备备份…', error: '', notice: '' });
    try {
      if (services.account.snapshot().status === 'authenticated') await services.sync.sync();
      if (services !== miniServices()) throw new Error('账号已变化，请重新导出。');
      await services.backups.exportAll();
      if (services === miniServices()) this.setData({ notice: '文字副本已准备好，请在微信中保存文件。' });
    } catch (error) { if (services === miniServices()) this.setData({ error: errorMessage(error, '文字副本导出失败。') }); }
    finally { if (services === miniServices()) this.setData({ busy: '' }); }
  },
  async importBackup() {
    const services = miniServices();
    this.setData({ busy: '正在校验备份…', error: '', notice: '' });
    try {
      const count = await services.backups.chooseAndImport();
      if (services === miniServices()) this.setData({ notice: count ? '已恢复 ' + count + ' 篇作品副本。' : '' });
    } catch (error) { if (services === miniServices()) this.setData({ error: errorMessage(error, '备份导入失败，原作品未改变。') }); }
    finally { if (services === miniServices()) this.setData({ busy: '' }); }
  },
  noop() {},
});
