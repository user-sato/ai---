/**
 * LINE -> Cloudflare Worker -> GAS gateway.
 *
 * Secrets are configured with `wrangler secret put`; never add them to this file.
 * GAS_WEBHOOK_URL must be the GAS /exec URL including its webhook_token query.
 */
export default {
  async fetch(request, env) {
    if (request.method === 'GET') return new Response('LINE AI secretary gateway', { status: 200 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const signature = request.headers.get('x-line-signature');
    if (!signature || !env.LINE_CHANNEL_SECRET || !env.GAS_WEBHOOK_URL) {
      return new Response('Unauthorized', { status: 401 });
    }

    const rawBody = await request.arrayBuffer();
    if (!(await isValidLineSignature_(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      // GAS executes doPost, then responds with a redirect to a temporary
      // googleusercontent.com output URL. Do not follow it: the temporary URL
      // rejects POST, while the 302 itself proves GAS accepted the event.
      const gasResponse = await fetch(env.GAS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
        body: rawBody,
        redirect: 'manual',
      });
      const location = gasResponse.headers.get('location') || '';
      const gasAccepted =
        gasResponse.ok ||
        ((gasResponse.status === 301 ||
          gasResponse.status === 302 ||
          gasResponse.status === 303 ||
          gasResponse.status === 307 ||
          gasResponse.status === 308) &&
          location.startsWith('https://script.googleusercontent.com/'));
      if (!gasAccepted) return new Response('Upstream unavailable', { status: 502 });
      return new Response('OK', { status: 200 });
    } catch {
      // A 5xx lets LINE retry a transient delivery failure.
      return new Response('Upstream unavailable', { status: 502 });
    }
  },
};

async function isValidLineSignature_(body, suppliedSignature, channelSecret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, body);
  const expected = base64_(new Uint8Array(digest));
  return timingSafeEqual_(expected, suppliedSignature);
}

function base64_(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function timingSafeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
