# Cloudflare Workersの検討結果

検討日: 2026-11-04 JST

## 結論

**1グループ・スプレッドシート正本のMVPには、Cloudflare WorkerをLINE Webhookの署名検証専用ゲートウェイとして足す案を推奨する。**

構成は次の通り。DB、ローカルサーバー、Cloud Runは不要のまま。

```text
LINE
  -> Cloudflare Worker
       - x-line-signatureを生の本文で検証
       - 許可されたLINE_GROUP_IDだけを通す
       - GASへ内部トークン付きで転送
  -> GAS
       - Google Sheetsを正本として保存
       - OpenAI解析、Google Docs、週次処理、LINEコマンド
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
3. JSONをparseし、`source.type === "group"`かつ`source.groupId === LINE_GROUP_ID`のイベントだけを残す。それ以外は200で無視する。
4. `GAS_URL`へ、Worker Secretの`GAS_GATEWAY_TOKEN`を本文に追加してPOSTする。
5. GASが成功した場合だけLINEへ2xxを返す。

GAS側では、現在のURLクエリの`WEBHOOK_TOKEN`を、Workerだけが付ける本文中の`gatewayToken`チェックへ置き換える。GASでもグループIDを再確認する。これにより、GAS URLへ直接POSTされてもgateway tokenを持たなければ無視される。

Worker Secretに置く値は次の3つだけでよい。

- `LINE_CHANNEL_SECRET`
- `LINE_GROUP_ID`（秘密ではないがWorker設定値として置ける）
- `GAS_URL` と `GAS_GATEWAY_TOKEN`

LINE Push、OpenAI APIキー、Google Drive IDは引き続きGASのScript Propertiesに置く。Workerにコピーしない。

## 費用と制限

Cloudflareの公式ドキュメント上、Workers Freeには1日100,000リクエスト、1リクエストあたり10ms CPU、1リクエストあたり50サブリクエストなどの制限がある。署名検証とGASへの1回の転送だけなら、通常の1グループ運用では十分小さい見込みである。ただし、プラン・上限・課金条件は変更され得るので、導入時にCloudflareダッシュボードと公式価格表を再確認する。

`workers.dev`の公開URLはカスタムドメインなしで試せる。Cloudflare自身は`workers.dev`を個人・ホビー用途向けとし、業務上重要な本番ではWorkers Routeまたはカスタムドメインを推奨している。まず専用LINEテストグループで試す用途なら`workers.dev`でよい。本運用で可用性やURLの管理を重視する時にカスタムドメインを検討する。

Cloudflare CronはUTCで動く。今回の案では週次・解析のスケジュールはGASのままなので、Cloudflare Cronを設定しない。

## 導入時の注意

- Workerは**署名確認前に本文をJSON化・整形してはならない**。まず生バイト列で検証し、その後にparseする。
- WorkerからGASへ転送する本文は、署名検証後に新しくJSON化してよい。GASはLINE署名を検証する役目を持たない。
- WorkerがGASの応答待ち中に失敗した場合、LINEはWebhookを再送し得る。GAS側のMessage ID重複排除とLockServiceはそのまま必要。
- Workerの`GAS_GATEWAY_TOKEN`が漏れた場合はCloudflare SecretとGAS Script Propertyを同時に更新する。GAS URLを秘密情報として扱わず、tokenを認証材料として扱う。
- Workerを追加しても、LINE Pushの送信不明状態、GASのクォータ、スプレッドシートを簡易台帳として使う制約は残る。

## 採用判断

現時点では、GAS-only版を最短試作として残しつつ、継続利用するなら**Worker + GAS + スプシ**へ移すのが最もバランスがよい。Worker/D1/KVやWorkerだけの構成は、GASの利便性を捨てるほどの課題が出てから検討する。

この文書は検討結果であり、Cloudflareアカウント作成、Workerデプロイ、Secret設定、Webhook URL変更はまだ実行していない。

## 参照した公式資料

- [Cloudflare Workers overview](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [LINE Webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
