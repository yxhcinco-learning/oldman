import { emitKeypressEvents } from 'node:readline';
import { createTopicAdminPasswordHash } from '../server/topic-admin-auth.ts';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('请在交互式终端运行此脚本。');
  process.exitCode = 1;
} else {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('请输入话题后台密码（输入不会显示）：');
  let password = '';
  const finish = () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
  };
  process.stdin.on('keypress', (text, key) => {
    if (key.ctrl && key.name === 'c') { finish(); process.exitCode = 130; return; }
    if (key.name === 'return') {
      finish();
      try { process.stdout.write(`${createTopicAdminPasswordHash(password)}\n`); }
      catch (error) { console.error(error instanceof Error ? error.message : '无法生成密码散列'); process.exitCode = 1; }
      return;
    }
    if (key.name === 'backspace') { password = password.slice(0, -1); return; }
    if (!key.ctrl && !key.meta && text) password += text;
  });
}
