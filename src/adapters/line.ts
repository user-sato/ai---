import type { messagingApi } from '@line/bot-sdk';
import type { Line } from '../ports.js';
export class LineAdapter implements Line {
  constructor(private token: string) {}
  async push(groupId: string, text: string, retryKey: string) {
    const payload: messagingApi.PushMessageRequest = {
      to: groupId,
      messages: [{ type: 'text', text: text.slice(0, 4900) }],
    };
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify(payload),
    });
    // A 409 without this header must not be interpreted as successful delivery.
    if (response.status === 409 && response.headers.get('x-line-accepted-request-id')) {
      await response.body?.cancel();
      return;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('LINE request failed'), { status: response.status });
    }
    await response.body?.cancel();
  }
}
