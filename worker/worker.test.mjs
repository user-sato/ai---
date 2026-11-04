import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './src/index.mjs';

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function signedRequest(body, secret = 'line-channel-secret') {
  const raw = encoder.encode(JSON.stringify(body));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, raw);
  return new Request('https://worker.example/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': Buffer.from(digest).toString('base64'),
    },
    body: raw,
  });
}

const environment = {
  LINE_CHANNEL_SECRET: 'line-channel-secret',
  GAS_WEBHOOK_URL: 'https://script.google.com/macros/s/deployment/exec?webhook_token=secret',
};

describe('LINE gateway', () => {
  it('returns 200 only after GAS returns its final OK body', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('follow');
      return new Response('OK', { status: 200 });
    });
    const response = await worker.fetch(
      await signedRequest({ events: [{ type: 'message' }] }),
      environment,
    );
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns 502 when GAS returns an error body so LINE can retry', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ERROR', { status: 200 }));
    const response = await worker.fetch(
      await signedRequest({ events: [{ type: 'message' }] }),
      environment,
    );
    expect(response.status).toBe(502);
  });

  it('acknowledges an empty verification event without invoking GAS', async () => {
    globalThis.fetch = vi.fn();
    const response = await worker.fetch(await signedRequest({ events: [] }), environment);
    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
