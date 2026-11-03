# GAS + スプレッドシート版

これが現在のMVPです。PostgreSQL、ローカルサーバー、Cloud Runは使いません。

## 構成

```text
LINE Group
  -> GAS Web App
       -> Google Sheets（正本）
       -> OpenAI API（5分ごとの候補抽出）
       -> Google Docs / Drive（現況書・週次）
       -> LINE（コマンド返信・週次通知）
```

`Messages`、`Items`、`Reports`がBotの台帳です。`Tasks`、`Issues`、`Decisions`は閲覧しやすいように更新するBot管理シートです。人が直接編集しても、次回同期で上書きされます。

## 設定手順

1. 新しいGoogleスプレッドシートと、Bot専用のGoogle Drive親フォルダを作る。既存の業務ファイルは指定しない。
2. スプレッドシートで「拡張機能 → Apps Script」を開く。`gas/Code.gs` と `gas/appsscript.json` の内容を入れる。claspを使うなら下記を参照。
3. Apps Scriptの「プロジェクトの設定 → スクリプト プロパティ」に次を設定する。値はソースやシートへ書かない。

| プロパティ | 値 |
|---|---|
| `SPREADSHEET_ID` | URL内のスプレッドシートID |
| `LINE_GROUP_ID` | 許可する1グループのID |
| `WEBHOOK_TOKEN` | 32文字以上のランダム文字列 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging APIアクセストークン |
| `LINE_ADMIN_USER_IDS` | 承認者のuserId。複数ならカンマ区切り |
| `OPENAI_API_KEY` | OpenAI APIキー |
| `OPENAI_MODEL` | Structured Outputs対応モデル名 |
| `DRIVE_ROOT_FOLDER_ID` | Bot専用Drive親フォルダID |

4. `setupProject` をApps Scriptエディタから一度実行し、Googleの権限を許可する。スプレッドシート内に必要なシートが作成される。
5. `installTriggers` を一度実行する。5分ごとの解析と、日曜20時頃（JST）の週次処理を登録する。GASの時刻トリガーは厳密な秒単位ではなく、多少前後する。
6. 「デプロイ → 新しいデプロイ → ウェブアプリ」を選ぶ。実行するユーザーは自分、アクセスできるユーザーはLINEから到達できる設定にする。組織のポリシーで公開できない場合、この構成だけではLINE Webhookを受信できない。
7. LINE DevelopersのWebhook URLを次のように設定する。`WEBHOOK_TOKEN`はURLエンコードする。

```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?webhook_token=<WEBHOOK_TOKEN>
```

8. LINE Webhookを有効にし、合意済みのテストグループでテキストを1件送る。`Messages`に`NEW`で入ること、数分後に`ANALYZED`になり`Items`へ候補が出ることを確認する。

## claspを使う場合

```sh
npm install --global @google/clasp
clasp login
cp gas/.clasp.json.example gas/.clasp.json
# gas/.clasp.json のscriptIdを作成したApps ScriptプロジェクトIDに置き換える
clasp push
```

`.clasp.json`はGitに追加しない。`scriptId`は秘密ではないが、環境ごとに異なるためローカル設定にする。

## セキュリティ上の制約

GAS Web Appの`doPost(e)`には、LINEが送る`x-line-signature`ヘッダーが渡されません。そのため、この構成はLINE署名検証を実装できません。

代わりに、次を必須とします。

- 32文字以上の推測困難な`WEBHOOK_TOKEN`をWebhook URLのクエリに含める
- `LINE_GROUP_ID`が完全一致するイベントだけ処理する
- 未知のグループ、個人トーク、画像、空テキスト、無効トークンは記録も返信もしない
- キーはScript Propertiesだけに保存する
- `LockService`とMessage ID照合で同時書込み・再送の重複を防ぐ

group IDは秘密ではありません。URLが漏れた場合は`WEBHOOK_TOKEN`を新しいランダム値に変更し、LINE DevelopersのWebhook URLも更新する。署名検証が必要になった時点で、Cloud Runなどヘッダーを受け取れる小さな受信窓口を追加してください。

## コマンド

- `/bot 決定事項` — CONFIRMEDの決定だけを返す
- `/bot 残課題` — OPENのタスク・課題を返す
- `/bot 確認待ち` — PENDINGの候補を返す
- `/bot 今週` — 最新の週次Docsリンクを返す
- `/bot 承認 <ID>` / `/bot 却下 <ID>` — `LINE_ADMIN_USER_IDS`に登録した人だけ実行可能

通常の発言へは返答せず、5分ごとの処理で候補化する。AIが抽出した決定・タスクは人の承認まで確定しない。担当者・期限・金額をAIが推測して書き込むこともない。

## 再試行と手動復旧

OpenAIやスプレッドシート保存の一時失敗ではメッセージを`NEW`に戻し、次の5分処理で再試行する。Docs更新の失敗は、保存済み候補を重複解析せず、次の5分処理で再試行する。15分以上`PROCESSING`のままなら自動回収する。週次Docs作成後のLINE通知は、同じretry keyを`Reports`に保持して`retryPendingWeeklyNotifications`で手動再試行できる。

GASだけでは、LINE送信直後に実行が止まった場合の完全な到達確認まではできない。LINEのretry keyで二重送信を抑え、不明な状態はグループ投稿を人が確認してから扱う。
