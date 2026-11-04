/**
 * LINE → Cloudflare Worker → GAS の中継ゲートウェイ。
 *
 * 秘密情報は`wrangler secret put`で設定し、このファイルへ書かない。
 * GAS_WEBHOOK_URLは、webhook_tokenクエリを含むGASの/exec URLにする。
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
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    // LINEのWebhook検証はeventsが空のため、GASを呼び出す必要がない。
    if (Array.isArray(payload.events) && payload.events.length === 0) return new Response('OK');

    try {
      // GASはdoPost実行後に一時的な出力URLへリダイレクトする。通常どおり302を追うと
      // POSTがGETに変わり、doPostの出力本文が返る。
      const gasResponse = await fetch(env.GAS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
        body: rawBody,
        redirect: 'follow',
      });
      if (!gasResponse.ok || (await gasResponse.text()).trim() !== 'OK') {
        return new Response('Upstream unavailable', { status: 502 });
      }
      return new Response('OK', { status: 200 });
    } catch {
      // 5xxを返すと、LINEが一時的な配信失敗を再送できる。
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
