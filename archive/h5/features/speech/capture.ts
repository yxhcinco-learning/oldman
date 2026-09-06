export interface AudioCapture { stop(): Promise<void> }
export async function capturePcm(stream: MediaStream, onFrame: (frame: ArrayBuffer) => void, onLevel: (level: number) => void): Promise<AudioCapture> {
  const context = new AudioContext();
  let stopped = false;
  try {
    await context.audioWorklet.addModule('/audio/pcm-worklet.js');
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'pcm-capture');
    const mute = context.createGain(); mute.gain.value = 0;
    let flushed: (() => void) | undefined;
    node.port.onmessage = ({ data }) => {
      if (data.type === 'flushed') { flushed?.(); return; }
      if (data.frame instanceof ArrayBuffer) onFrame(data.frame);
      if (typeof data.level === 'number') onLevel(data.level);
    };
    source.connect(node); node.connect(mute); mute.connect(context.destination);
    await context.resume();
    return { async stop() {
      if (stopped) return;
      stopped = true; stream.getTracks().forEach(track => track.stop());
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, 120); flushed = () => { clearTimeout(timer); resolve(); }; node.port.postMessage('flush'); });
      node.port.onmessage = null; source.disconnect(); node.disconnect(); mute.disconnect(); await context.close();
    } };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); await context.close(); throw error; }
}
