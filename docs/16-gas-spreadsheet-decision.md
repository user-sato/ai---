# GAS + スプレッドシートMVPへの切替

## 決定

初期のNode.js + PostgreSQL設計は将来の移行先として保持するが、現在のMVPはGoogle Apps ScriptとGoogleスプレッドシートで運用する。理由は、ローカルサーバー・DB・Cloud Runのセットアップを不要にし、1グループで価値を早く検証するため。

## 正本と処理

`Messages`、`Items`、`Reports`シートを正本とする。`Tasks`、`Issues`、`Decisions`は閲覧用のBot管理シート、Google Docsは現況書・週次レポートの出力先。GASのScript PropertiesにIDと秘密情報を置き、スプレッドシートには書かない。

Webhookは受信後、本文を`Messages`へ追加してすぐ200を返す。OpenAI処理は5分の時間トリガーで行い、候補保存・閲覧シート同期・現況Docs更新を行う。週次は日曜20時頃JSTにトリガーで作る。GASの時刻トリガーは厳密な時刻実行を保証しない。

## 重複・同時実行

- `Message ID`で同じ発言の再送を無視する。
- `LockService`で、重複確認と行追加を1つずつ行う。
- `PROCESSING`が15分以上残ったメッセージは次回処理で`NEW`へ戻す。
- `Reports`に週次キーとLINE retry keyを保存する。同じ週次を二度作らず、通知失敗時は同じretry keyで手動再試行する。

これは小規模運用向けの簡易的な回復方式であり、PostgreSQLの一意制約・トランザクションほど強くはない。

## セキュリティ上の差分

GAS Web Appは`doPost(e)`へHTTPヘッダーを渡さないため、LINEの`x-line-signature`検証はできない。これは元設計からの明確な後退であり、受け入れる前提は次の通り。

1. 許可グループの`LINE_GROUP_ID`を固定し、不一致イベントを無視する。
2. 32文字以上のランダムな`WEBHOOK_TOKEN`をWebhook URLに含め、不一致リクエストを無視する。
3. URLトークン、LINEアクセストークン、OpenAIキー、管理者IDをScript Properties以外へ保存しない。
4. URL漏えい時はトークンをローテーションし、LINE DevelopersのWebhook URLを更新する。

固定グループIDは認証ではなくフィルタである。署名検証、複数グループ、より確実な再試行・監査が必要になれば、Cloud Runなどの小さな受信ゲートウェイか、既存Node/PostgreSQL版へ移行する。
