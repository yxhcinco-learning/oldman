export class HoldGesture {
  private timer?: ReturnType<typeof setTimeout>;
  private down = false;
  private started = false;
  constructor(private start: () => void, private stop: () => void, private abort: () => void, private short: () => void) {}
  press() { if (this.down) return; this.down = true; this.started = false; this.timer = setTimeout(() => { this.started = true; this.start(); }, 180); }
  release() { if (!this.down) return; this.down = false; clearTimeout(this.timer); if (this.started) this.stop(); else this.short(); }
  cancel() { this.down = false; clearTimeout(this.timer); this.abort(); }
}
