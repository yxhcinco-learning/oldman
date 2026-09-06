/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Integrate input samples into 16kHz bins; output little-endian PCM16 in 40ms frames.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.ratio = sampleRate / 16000; this.remaining = this.ratio; this.sum = 0;
    this.samples = []; this.energy = 0; this.count = 0; this.stopped = false;
    this.port.onmessage = ({ data }) => { if (data === 'flush') { this.emit(); this.stopped = true; this.port.postMessage({ type: 'flushed' }); } };
  }
  emit() {
    if (!this.samples.length) return;
    const frame = new ArrayBuffer(this.samples.length * 2); const view = new DataView(frame);
    this.samples.forEach((sample, index) => view.setInt16(index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
    this.port.postMessage({ frame, level: Math.min(1, Math.sqrt(this.energy / Math.max(1, this.count)) * 5) }, [frame]);
    this.samples = []; this.energy = 0; this.count = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.energy += sample * sample; this.count++;
      let weight = 1;
      while (weight > 0.000001) {
        const used = Math.min(weight, this.remaining); this.sum += sample * used; this.remaining -= used; weight -= used;
        if (this.remaining < 0.000001) { this.samples.push(this.sum / this.ratio); this.sum = 0; this.remaining = this.ratio; if (this.samples.length >= 640) this.emit(); }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
