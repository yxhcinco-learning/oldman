import { miniServices } from '../../services';
import { errorMessage } from '../../ui/error-message';
Component({
  properties: { value: String },
  data: { input: '', busy: false, valid: true, error: '' },
  lifetimes: { attached() { this.setData({ input: this.properties.value }); } },
  methods: {
    inputName(event: WechatMiniprogram.Input) { this.setData({ input: event.detail.value, valid: true, error: '' }); },
    reviewName(event: WechatMiniprogram.CustomEvent<{ pass: boolean }>) { this.setData({ valid: event.detail.pass, error: event.detail.pass ? '' : '请换一个用户名。' }); },
    async save() {
      if (this.data.busy || !this.data.valid) return;
      const services = miniServices();
      this.setData({ busy: true, error: '' });
      try {
        await services.account.updateNickname(this.data.input);
        if (services !== miniServices()) return;
        this.triggerEvent('saved', { nickname: services.account.snapshot().account?.nickname ?? '' });
      } catch (error) { if (services === miniServices()) this.setData({ error: errorMessage(error, '用户名未保存，请重试。') }); }
      finally { this.setData({ busy: false }); }
    },
  },
});
