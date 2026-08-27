// No audio is sent by this command. Actual recognition requires an explicit user gesture.
if (process.env.ALLOW_PAID_SPEECH_TEST !== '1') {
  console.error('真实联调默认关闭。确认测试额度后设置 ALLOW_PAID_SPEECH_TEST=1，再在页面主动录制。');
  process.exit(1);
}
try {
  const response = await fetch('http://127.0.0.1:3002/api/speech/status');
  const status = await response.json();
  if (!status.configured) throw new Error('not configured');
  console.info('网关配置检查通过，但尚未完成真实识别验收。请在 localhost:3001 长按说一句话并核对结果。');
} catch { console.error('本地网关未启动或未配置。参见 docs/SPEECH-SETUP.md。'); process.exit(1); }
