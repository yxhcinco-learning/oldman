// @vitest-environment node
import { expect, it } from 'vitest';
import { loadGatewayRuntime } from '../server/runtime';

it('keeps the default development gateway on the expected loopback origin', () => {
  expect(loadGatewayRuntime({})).toEqual({ host: '127.0.0.1', port: 3002, origin: 'http://localhost:3001' });
});

it('accepts the fixed HTTPS production origin and an isolated loopback port', () => {
  expect(loadGatewayRuntime({ GATEWAY_HOST: '127.0.0.1', GATEWAY_PORT: '3012', ASR_ALLOWED_ORIGIN: 'https://suiyue.maicong.chat' }))
    .toEqual({ host: '127.0.0.1', port: 3012, origin: 'https://suiyue.maicong.chat' });
});

it.each([
  { GATEWAY_HOST: '0.0.0.0' },
  { GATEWAY_PORT: '0' },
  { GATEWAY_PORT: '70000' },
  { ASR_ALLOWED_ORIGIN: 'https://suiyue.maicong.chat/path' },
  { ASR_ALLOWED_ORIGIN: 'wss://suiyue.maicong.chat' },
])('rejects unsafe runtime configuration %#', configuration => {
  expect(() => loadGatewayRuntime(configuration)).toThrow();
});
