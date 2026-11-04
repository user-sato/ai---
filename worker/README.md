# Cloudflare Worker gateway

LINEはGASウェブアプリが返すHTTP 302をWebhook検証で受け付けない。このWorkerはLINEの署名を検証し、GASが`doPost`実行後に返すGoogleの302を受信成功として扱い、LINEへHTTP 200を返す。

```text
LINE -- signed POST --> Cloudflare Worker -- verified POST --> GAS
```

Workerは会話を保存せず、AI APIも呼ばない。GASだけがスプレッドシートへ記録する。

## Cloudflareダッシュボードでの設定

1. Cloudflareへログインし、**Workers & Pages** → **Create application** → **Create Worker** を選ぶ。
2. 名前は`line-ai-secretary-gateway`などにし、`worker/src/index.mjs`の内容で置き換えてデプロイする。
3. Workerの**Settings** → **Variables and Secrets**で、次の2つを**Secret**として追加する。

| Secret名 | 値 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE Developers ConsoleのMessaging APIチャネルにある「チャネルシークレット」 |
| `GAS_WEBHOOK_URL` | GASのウェブアプリURLに`?webhook_token=<WEBHOOK_TOKEN>`を付けた完全なURL |

例:

```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?webhook_token=<WEBHOOK_TOKEN>
```

4. Secretを保存した後、Workerを再デプロイする。
5. Workerの`https://<worker名>.<subdomain>.workers.dev/` URLを、LINE DevelopersのWebhook URLへ設定する。GAS URLはLINE Developersへ直接設定しない。

## Wranglerを使う場合

```sh
cd worker
npx wrangler login
cp wrangler.toml.example wrangler.toml
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put GAS_WEBHOOK_URL
npx wrangler deploy
```

`LINE_CHANNEL_SECRET`とGAS URLに含まれる`WEBHOOK_TOKEN`は、Gitへ追加しない。

## 確認

- Worker URLをブラウザで開くと`LINE AI secretary gateway`が表示される。
- LINE DevelopersのWebhook検証が成功する。
- 署名がない、または不正なリクエストはHTTP 401になる。
- GASが一時的に失敗した場合はHTTP 502を返すため、LINEが再送できる。
