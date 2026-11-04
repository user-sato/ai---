# GAS + スプレッドシートMVPへの切替

## 決定

初期のNode.js + PostgreSQL設計は将来の移行先として保持するが、現在のMVPはGoogle Apps ScriptとGoogleスプレッドシートで運用する。理由は、ローカルサーバー・DB・Cloud Runのセットアップを不要にし、1グループで価値を早く検証するため。

## 正本と処理

`Messages`、`Items`、`Reports`、`SummaryRequests`シートを正本とする。`Tasks`、`Issues`、`Decisions`は閲覧用のBot管理シート、Google Docsは現況書、Drive上のMarkdownは週次・日次統括レポートの出力先。GASのScript PropertiesにIDと秘密情報を置き、スプレッドシートには書かない。

WebhookはWorkerで署名検証後にGASへ転送し、GASは本文を`Messages`へ追加する。WorkerはGASのリダイレクト先の最終本文が`OK`の場合だけLINEへ200を返す。Claude/OpenAI処理は5分の時間トリガーで行い、候補保存・閲覧シート同期・現況Docs更新を行う。週次は日曜20時頃JSTにトリガーで作る。GASの時刻トリガーは厳密な時刻実行を保証しない。

## 重複・同時実行

- `Message ID`で同じ発言の再送を無視する。
- `LockService`で、重複確認と行追加を1つずつ行う。
- `PROCESSING`が15分以上残ったメッセージは次回処理で`NEW`へ戻す。
- `Reports`に週次キー、AI生成結果、LINE retry keyを保存する。同じ週次を二度作らず、失敗時は5分処理で最大3回再試行する。
- `SummaryRequests`にメンション依頼、AI生成結果、Drive URL、LINE retry keyを保存する。後段の再試行ではAIを再実行しない。

これは小規模運用向けの簡易的な回復方式であり、PostgreSQLの一意制約・トランザクションほど強くはない。

## セキュリティ上の差分

GAS Web Appは`doPost(e)`へHTTPヘッダーを渡さないため、LINEの`x-line-signature`検証はCloudflare Workerが担当する。GAS側も次を確認する。

1. 許可グループの`LINE_GROUP_ID`を固定し、不一致イベントを無視する。
2. 32文字以上のランダムな`WEBHOOK_TOKEN`をWebhook URLに含め、不一致リクエストを無視する。
3. URLトークン、LINEアクセストークン、AI APIキー、管理者IDをScript Properties以外へ保存しない。
4. URL漏えい時はトークンをローテーションし、Worker Secretの`GAS_WEBHOOK_URL`を更新する。LINE DevelopersのWebhook URLはWorker URLのまま変更しない。

固定グループIDは認証ではなくフィルタである。署名検証はWorkerで行い、複数グループやさらに厳密な再試行・監査が必要になれば、既存Node/PostgreSQL版へ移行する。

Cloudflare Workersを署名検証専用ゲートウェイに使う案を採用した。判断と最小構成は[docs/17-cloudflare-workers-assessment.md](17-cloudflare-workers-assessment.md)に記録した。
