const PCM_BYTES_PER_MS = 32;
const FRAME_BYTES = 1280;
export const MAX_PENDING_PCM_BYTES = 256 * 1024;

/** A bounded 16 kHz PCM16 FIFO. Delayed timers never trigger catch-up bursts. */
export class PcmDelivery {
  private chunks: Buffer[] = [];
  private offset = 0;
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ended = false;
  private stopped = false;

  constructor(private readonly callbacks: {
    send: (frame: Buffer) => void;
    end: () => void;
    error: () => void;
  }) {}

  enqueue(data: Buffer) {
    if (this.ended || this.stopped || this.bytes + data.length > MAX_PENDING_PCM_BYTES) return false;
    if (!data.length) return true;
    this.chunks.push(data);
    this.bytes += data.length;
    if (!this.timer) this.pump();
    return true;
  }

  finish() {
    if (this.ended || this.stopped) return;
    this.ended = true;
    if (!this.timer) this.pump();
  }

  cancel() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.chunks = [];
    this.offset = 0;
    this.bytes = 0;
  }

  private pump() {
    if (this.stopped) return;
    this.timer = undefined;
    if (!this.bytes) {
      if (this.ended) {
        this.stopped = true;
        try { this.callbacks.end(); } catch { this.callbacks.error(); }
      }
      return;
    }
    const frame = Buffer.allocUnsafe(Math.min(FRAME_BYTES, this.bytes));
    let written = 0;
    while (written < frame.length) {
      const chunk = this.chunks[0]!;
      const length = Math.min(chunk.length - this.offset, frame.length - written);
      chunk.copy(frame, written, this.offset, this.offset + length);
      written += length;
      this.offset += length;
      if (this.offset === chunk.length) { this.chunks.shift(); this.offset = 0; }
    }
    this.bytes -= frame.length;
    try { this.callbacks.send(frame); }
    catch { this.cancel(); this.callbacks.error(); return; }
    if (!this.stopped) this.timer = setTimeout(() => this.pump(), Math.ceil(frame.length / PCM_BYTES_PER_MS));
  }
}
