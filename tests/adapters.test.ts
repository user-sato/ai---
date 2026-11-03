import { describe, it, expect, vi, afterEach } from 'vitest';
import { LineAdapter } from '../src/adapters/line.js';
afterEach(() => vi.unstubAllGlobals());
describe('LINE HTTP contract', () => {
  it('sends persisted UUID retry key and bounds request time without exposing credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await new LineAdapter('synthetic-token').push('synthetic-group', 'text', 'uuid');
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(options.headers['X-Line-Retry-Key']).toBe('uuid');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      to: 'synthetic-group',
      messages: [{ type: 'text', text: 'text' }],
    });
  });
  it('recognizes accepted duplicate only when LINE supplies accepted-request-id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 409,
          headers: { 'x-line-accepted-request-id': 'accepted' },
        }),
      ),
    );
    await expect(
      new LineAdapter('synthetic').push('group', 'text', 'uuid'),
    ).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('sensitive error', { status: 409 })),
    );
    await expect(new LineAdapter('synthetic').push('group', 'text', 'uuid')).rejects.toMatchObject({
      status: 409,
      message: 'LINE request failed',
    });
  });
  it('returns safe error status on rate limiting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('secret-content', { status: 429 })),
    );
    await expect(new LineAdapter('synthetic').push('group', 'text', 'uuid')).rejects.toMatchObject({
      status: 429,
      message: 'LINE request failed',
    });
  });
});
