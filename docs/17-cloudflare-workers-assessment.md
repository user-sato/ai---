# Cloudflare Workersの検討結果

検討日: 2026-11-04 JST

更新: 実際のGAS Web Appで、`doPost`実行後に`script.googleusercontent.com`へのHTTP 302が返ることを確認した。LINE DevelopersのWebhook検証はこの302を受け付けなかったため、Workerを受信窓口として使う。WorkerはLINE署名を検証し、GASの最終本文が`OK`のときだけLINEへHTTP 200で返す。実装は[`worker/README.md`](../worker/README.md)。

## 結論

**1グループ・スプレッドシート正本のMVPには、Cloudflare WorkerをLINE Webhookの署名検証専用ゲートウェイとして足す案を推奨する。**

構成は次の通り。DB、ローカルサーバー、Cloud Runは不要のまま。

```text
LINE
  -> Cloudflare Worker
       - x-line-signatureを生の本文で検証
       - GASへ内部トークン付きで転送
  -> GAS
       - 許可されたLINE_GROUP_IDだけを処理
       - Google Sheetsを正本として保存
       - Claude/OpenAI解析、Google Docs、Drive Markdown、週次処理、LINEメンション
```

これなら現在のGAS-only案の一番大きな欠点である「LINE署名を検証できない」を解消できる。一方で、データ保存用DBを導入する必要はない。

## 選択肢の比較

| 構成 | 署名検証 | DB | 設定の手軽さ | 向き |
|---|---:|---:|---:|---|
| GAS + スプシ | できない | 不要 | 最小 | 個人の短期試作 |
| **Worker + GAS + スプシ** | **できる** | **不要** | 少し増える | 1グループの継続MVP |
| Worker + D1/KV + GAS | できる | Cloudflareのデータ保存を追加 | 中 | メッセージ量・状態管理が増えた段階 |
| Worker + D1/KVだけ | できる | 必要 | 高い | GASを外して独自アプリへ進む段階 |
| Node + PostgreSQL | できる | 必要 | 高い | 複数グループや厳密な監査が必要な段階 |

## なぜWorkerを入口だけにするか

Cloudflare Workersは、公開HTTPS URLで受信でき、Workers RuntimeのWeb Crypto APIでHMAC-SHA256を検証できる。LINEは**JSONをparse・整形する前の生の本文**で`x-line-signature`を検証するよう求めているため、最初にリクエストヘッダーと生本文へ触れられるWorkerが適している。

一方、GASはGoogle Sheets、Docs、Drive、時間トリガーとの接続が非常に簡単である。Worker側へGoogle OAuth、Drive API、スケジュール、データ管理をすべて移すと、今回避けたい設定量が戻ってしまう。

## Workerが行う最小処理

1. `x-line-signature`と生のリクエスト本文を受信する。
2. Worker Secretの`LINE_CHANNEL_SECRET`を使い、HMAC-SHA256署名を検証する。不一致なら401を返し、GASへは転送しない。
3. 空の`events`配列はGASへ転送せず200で応答する。
4. `GAS_WEBHOOK_URL`へ、生の本文をそのままPOSTする。URLにはGASの`WEBHOOK_TOKEN`を含める。
5. GASの302を追跡した最終本文が`OK`の場合だけLINEへ2xxを返す。

GAS側でもグループIDを再確認する。GAS URLへ直接POSTされても、推測困難な`WEBHOOK_TOKEN`がなければ無視される。

Worker Secretに置く値は次の2つだけでよい。

- `LINE_CHANNEL_SECRET`
- `GAS_WEBHOOK_URL`

LINE Push、Claude/OpenAI APIキー、Google Drive IDは引き続きGASのScript Propertiesに置く。Workerにコピーしない。

## 費用と制限

署名検証とGASへの1回の転送だけなので、通常の1グループ運用ではWorkerの処理量は小さい見込みである。Workers Freeのリクエスト数、CPU時間、サブリクエスト数、課金条件は変更され得るため、導入時と運用中にCloudflareダッシュボードと公式のLimits・Pricingを確認する。固定の上限値はこの資料へ転記しない。

`workers.dev`の公開URLはカスタムドメインなしで試せる。Cloudflare自身は`workers.dev`を個人・ホビー用途向けとし、業務上重要な本番ではWorkers Routeまたはカスタムドメインを推奨している。まず専用LINEテストグループで試す用途なら`workers.dev`でよい。本運用で可用性やURLの管理を重視する時にカスタムドメインを検討する。

Cloudflare CronはUTCで動く。今回の案では週次・解析のスケジュールはGASのままなので、Cloudflare Cronを設定しない。

## 導入時の注意

- Workerは**署名確認前に本文をJSON化・整形してはならない**。まず生バイト列で検証し、その後にparseする。
- WorkerからGASへは署名検証済みの生本文を転送する。GASはLINE署名を検証する役目を持たない。
- WorkerがGASの応答待ち中に失敗した場合、LINEはWebhookを再送し得る。GAS側のMessage ID重複排除とLockServiceはそのまま必要。
- `WEBHOOK_TOKEN`が漏れた場合はGAS Script PropertyとWorker Secret内のGAS URLを同時に更新する。
- Workerを追加しても、LINE Pushの送信不明状態、GASのクォータ、スプレッドシートを簡易台帳として使う制約は残る。

## 採用判断

**Worker + GAS + スプシ**を採用した。Worker/D1/KVやWorkerだけの構成は、GASの利便性を捨てるほどの課題が出てから検討する。

Workerコード、テスト、設定手順は[`worker/`](../worker/)に置く。実環境のデプロイとSecret設定は運用者が行う。

## 参照した公式資料

- [Cloudflare Workers overview](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [LINE Webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
