import { miniServices } from '../services';
import { openLogin } from './navigation';

export function hasAccountAccess() {
  const state = miniServices().account.snapshot();
  return Boolean(state.account && ['authenticated', 'offline'].includes(state.status));
}

/** Product pages load only after restoring an existing account; privacy remains public. */
export function accountPage<TData extends WechatMiniprogram.Page.DataOption, TCustom extends WechatMiniprogram.Page.CustomOption>(
  definition: WechatMiniprogram.Page.Options<TData, TCustom>,
  preserve?: (page: WechatMiniprogram.Page.Instance<TData, TCustom>) => Promise<boolean>,
) {
  type Instance = WechatMiniprogram.Page.Instance<TData & { accountReady: boolean }, TCustom>;
  type State = { query: Record<string, string | undefined>; loaded: boolean; active: boolean; disposed: boolean; pending?: Promise<void>; source?: ReturnType<typeof miniServices> };
  const states = new WeakMap<object, State>();
  const setAccess = (page: Instance, ready: boolean, paused = false) => {
    // accountReady is injected below; generic Page custom fields may also declare data.
    page.setData({ accountReady: ready, ...(paused ? { readOnly: true } : {}) } as unknown as Partial<Instance['data']>);
  };
  const enter = (page: Instance, state: State) => {
    if (state.pending) return state.pending;
    state.pending = (async () => {
      await miniServices().account.restore();
      if (!state.active || state.disposed) return;
      if (!hasAccountAccess()) {
        setAccess(page, false);
        if (state.loaded && preserve && !await preserve(page)) {
          // Keep the failed save's existing recovery controls and in-memory input.
          setAccess(page, true, true);
          return;
        }
        if (!state.active || state.disposed) return;
        const query = Object.entries(state.query).filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`).join('&');
        const workId = ['pages/editor/index', 'pages/interview/index', 'pages/publish/index'].includes(page.route) ? state.query.id : undefined;
        await openLogin({ url: '/' + page.route + (query ? '?' + query : ''), workId, source: state.source ?? miniServices() });
        return;
      }
      if (!state.loaded) {
        state.loaded = true;
        state.source = miniServices();
        await definition.onLoad?.call(page, state.query);
      }
      if (!state.active || state.disposed || !hasAccountAccess()) return;
      setAccess(page, true);
      await definition.onShow?.call(page);
    })().finally(() => { state.pending = undefined; });
    return state.pending;
  };
  Page<TData & { accountReady: boolean }, TCustom>({
    ...definition,
    data: { ...definition.data!, accountReady: false },
    onLoad(query) {
      const state: State = { query, loaded: false, active: true, disposed: false };
      states.set(this, state);
      return enter(this, state);
    },
    onShow() {
      const state = states.get(this);
      if (!state) return;
      state.active = true;
      if (!hasAccountAccess()) setAccess(this, false);
      return enter(this, state);
    },
    onHide() {
      const state = states.get(this);
      if (state) { state.active = false; if (state.loaded) return definition.onHide?.call(this); }
    },
    onUnload() {
      const state = states.get(this);
      if (state) { state.disposed = true; if (state.loaded) return definition.onUnload?.call(this); }
    },
  });
}
