import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const origin = 'http://localhost:3001';
const bytesPerSecond = 16000 * 2;
const maxBytes = bytesPerSecond * 30;

export function validatePcm(audio) {
  if (!Buffer.isBuffer(audio) || !audio.length || audio.length % 2 || audio.length > maxBytes) {
    throw new Error('测试音频必须为非空的 16kHz 单声道 PCM16，且不超过 30 秒');
  }
}

async function readPcm(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || !info.size || info.size % 2 || info.size > maxBytes) throw new Error('Invalid audio');
    const audio = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < audio.length) {
      const { bytesRead } = await file.read(audio, offset, audio.length - offset, offset);
      if (!bytesRead) throw new Error('Incomplete audio');
      offset += bytesRead;
    }
    return audio;
  } finally { await file.close(); }
}

const normalize = text => text.replace(/[\s\p{P}\p{S}]/gu, '');

export function recognizePcm(audio, connect, expected = '') {
  validatePcm(audio);
  return new Promise((resolve, reject) => {
    const socket = connect();
    let settled = false, started = false, ended = false, offset = 0, text = '', finalSeen = false, updates = 0;
    let sender;
    const deadline = setTimeout(() => finish(new Error('真实识别超时，请检查网络与网关')), audio.length / bytesPerSecond * 1000 + 20000);
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(deadline); clearTimeout(sender);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      if (error) reject(error);
      else resolve({ mode: 'live', passed: true, audioSeconds: Number((audio.length / bytesPerSecond).toFixed(2)), transcriptCharacters: text.length,
        transcriptUpdates: updates, finalSeen, ...(expected ? { expectedMatched: true } : {}) });
    };
    const pump = () => {
      if (settled) return;
      if (socket.readyState !== WebSocket.OPEN) { finish(new Error('测试连接中断')); return; }
      if (offset === audio.length) { ended = true; socket.send(JSON.stringify({ type: 'end' })); return; }
      if (socket.bufferedAmount > 256 * 1024) { finish(new Error('测试网络过慢，停止发送')); return; }
      // 40ms frames match the browser AudioWorklet; never send faster than real time.
      const frame = audio.subarray(offset, Math.min(offset + 1280, audio.length));
      offset += frame.length; socket.send(frame);
      sender = setTimeout(pump, frame.length / bytesPerSecond * 1000);
    };
    socket.on('message', raw => {
      if (settled) return;
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === 'ready' && !started) { started = true; pump(); }
        else if (event.type === 'transcript' && typeof event.text === 'string') {
          text = event.text; updates++; finalSeen ||= Boolean(event.final);
        } else if (event.type === 'done') {
          if (!ended || !text.trim()) { finish(new Error('识别提前结束或未返回文字，不能标记联调成功')); return; }
          if (expected && !normalize(text).includes(normalize(expected))) { finish(new Error('识别结果与非敏感测试句不匹配，请人工复核')); return; }
          finish();
        } else if (event.type === 'error' || event.type === 'limit') finish(new Error('网关拒绝或中止识别，请检查权限、实时服务额度与网络'));
      } catch { finish(new Error('收到无法解析的识别响应')); }
    });
    socket.on('error', () => finish(new Error('无法建立本地识别连接')));
    socket.on('close', () => { if (!settled) finish(new Error('识别未正常收尾')); });
  });
}

export async function runSpeechCheck({
  args = process.argv.slice(2), env = /** @type {Record<string, string | undefined>} */ (process.env), readAudio = readPcm,
  fetchStatus = async () => {
    const response = await fetch(`${origin}/api/speech/status`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Status unavailable');
    return response.json();
  },
  connect = () => new WebSocket(`${origin.replace('http:', 'ws:')}/api/speech`, { origin, handshakeTimeout: 8000, maxPayload: 1024 * 1024 }),
} = {}) {
  if (args.length && (args[0] !== '--pcm' || !args[1] || ![2, 4].includes(args.length) || (args.length === 4 && (args[2] !== '--expect' || !args[3]?.trim())))) {
    throw new Error('用法：npm run test:speech:live [-- --pcm 本地测试.pcm [--expect 非敏感测试句]]');
  }
  if (args.length && env.ALLOW_PAID_SPEECH_TEST !== '1') throw new Error('音频联调未开启，请先在本机设置 ALLOW_PAID_SPEECH_TEST=1');
  let audio;
  if (args.length) {
    try { audio = await readAudio(args[1]); validatePcm(audio); }
    catch { throw new Error('测试音频读取失败：仅支持不超过 30 秒的 16kHz 单声道 PCM16 文件'); }
  }
  let status;
  try { status = await fetchStatus(); }
  catch { throw new Error('本地语音网关不可用，请先运行 npm run dev'); }
  if (!status?.configured) throw new Error('本地网关尚未配置，请查看 docs/SPEECH-SETUP.md');
  if (!audio) return { mode: 'preflight', configured: true, audioSent: false, recognitionVerified: false };
  return recognizePcm(audio, connect, args[3] || '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.info(JSON.stringify(await runSpeechCheck())); }
  catch (error) { console.error(error instanceof Error ? error.message : '语音联调失败'); process.exitCode = 1; }
}
