import { afterEach, expect, it, vi } from 'vitest';
import { reportProductEvent } from '../features/operations/client';

afterEach(() => vi.unstubAllGlobals());

it('sends only the allowlisted event name without retrying', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  reportProductEvent('writing.started.topic');
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith('/api/operations/events', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'writing.started.topic' }), keepalive: true,
  });
});

it('swallows a transport failure and never retries', async () => {
  const request = vi.fn<typeof fetch>(async () => { throw new Error('offline'); });
  vi.stubGlobal('fetch', request);
  expect(() => reportProductEvent('app.opened')).not.toThrow();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
});
