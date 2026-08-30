export interface GatewayRuntime {
  host: '127.0.0.1';
  port: number;
  origin: string;
}

export function loadGatewayRuntime(env: Readonly<Record<string, string | undefined>> = process.env): GatewayRuntime {
  const host = env.GATEWAY_HOST?.trim() || '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Gateway host must remain on IPv4 loopback');
  const rawPort = env.GATEWAY_PORT?.trim() || '3002';
  if (!/^\d{1,5}$/.test(rawPort)) throw new Error('Gateway port must be numeric');
  const port = Number(rawPort);
  if (port < 1 || port > 65535) throw new Error('Gateway port is outside the valid range');
  const origin = env.ASR_ALLOWED_ORIGIN?.trim() || 'http://localhost:3001';
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error('Allowed origin must be an absolute URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
    throw new Error('Allowed origin must contain only an HTTP(S) origin');
  }
  return { host, port, origin };
}
