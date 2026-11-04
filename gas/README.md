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
| `LINE_GROUP_ID` | 許可する1グループのID。最初の登録フローを使う場合は空欄 |
| `GROUP_ENROLLMENT_CODE` | Group IDが不明な初回だけ使う、16文字以上のランダム文字列 |
| `WEBHOOK_TOKEN` | 32文字以上のランダム文字列 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging APIアクセストークン |
| `LINE_ADMIN_USER_IDS` | 承認者のuserId。複数ならカンマ区切り |
| `AI_PROVIDER` | `openai` または `anthropic`（Claude APIの場合はこちら） |
| `AI_API_KEY` | 選んだAI提供元のAPIキー |
| `AI_MODEL` | 選んだAI提供元のモデル名 |
| `AI_ANALYSIS_MODE` | 任意。通常は`signal_only`（雑談だけのバッチはAI送信しない）。すべて解析するなら`all` |
| `DRIVE_ROOT_FOLDER_ID` | Bot専用Drive親フォルダID |
| `HISTORICAL_TRANSCRIPT_FILE_ID` | 任意。導入前のLINE書き出しテキストを一度だけ取り込む場合のDriveファイルID |
| `HISTORICAL_IMPORT_MODE` | 任意。通常は`record_only`（AI送信なし）。履歴も候補抽出するなら`analyze` |

4. `setupProject` をApps Scriptエディタから一度実行し、Googleの権限を許可する。スプレッドシート内に必要なシートが作成される。
5. `installTriggers` を一度実行する。5分ごとの解析と、日曜20時頃（JST）の週次処理を登録する。GASの時刻トリガーは厳密な秒単位ではなく、多少前後する。
6. 「デプロイ → 新しいデプロイ → ウェブアプリ」を選ぶ。実行するユーザーは自分、アクセスできるユーザーはLINEから到達できる設定にする。組織のポリシーで公開できない場合、この構成だけではLINE Webhookを受信できない。
7. LINE DevelopersのWebhook URLを次のように設定する。`WEBHOOK_TOKEN`はURLエンコードする。

```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?webhook_token=<WEBHOOK_TOKEN>
```

8. LINE Webhookを有効にし、合意済みのテストグループでテキストを1件送る。`Messages`に`NEW`で入ること、数分後に`ANALYZED`になり`Items`へ候補が出ることを確認する。

### Group IDが分からない初回登録

`LINE_GROUP_ID`をあらかじめ知っている場合は、その値を設定してこの節を飛ばす。分からない場合は、`LINE_GROUP_ID`を空欄にし、代わりに16文字以上の`GROUP_ENROLLMENT_CODE`を設定する。Webhook URLの`WEBHOOK_TOKEN`と登録コードは別のランダム値にする。

Webhookを設定してBotを対象グループへ入れた後、そのグループで次を1回だけ送る。

```text
/bot 初期化 <GROUP_ENROLLMENT_CODE>
```

Botはその発言のgroup IDを`LINE_GROUP_ID`としてScript Propertiesへ保存し、`LINE_ADMIN_USER_IDS`が空ならその発言者を最初の管理者にする。その後、`GROUP_ENROLLMENT_CODE`を削除する。他グループからの通常発言は保存しない。登録コードを第三者に共有しない。

### 導入前のLINE履歴を取り込む

対象の`.txt`をBot専用Drive親フォルダへアップロードし、URLの`/d/`と次の`/`の間にあるファイルIDを`HISTORICAL_TRANSCRIPT_FILE_ID`へ設定する。Apps Scriptエディタから`importHistoricalTranscript`を一度実行する。

LINEのテキスト書き出し形式（UTF-8、日時・送信者・本文の形式）を読み取り、`Messages`へ`HIST-...`のIDで追加する。同じファイルを再実行しても、同じ発言は重複しない。標準では`RECORDED`として記録するだけで、履歴全文をAIへ送らない。候補抽出も必要なら、先に`HISTORICAL_IMPORT_MODE=analyze`を設定するか、取り込み後に`queueHistoricalMessagesForAnalysis`を実行する。履歴本文は命令ではなく記録データとして扱われるため、本文中の依頼やURLをBotが実行することはない。

取り込みを確認したら、`HISTORICAL_TRANSCRIPT_FILE_ID`は削除してよい。元のテキストはDriveに保管され、`Messages`には解析に必要な発言本文も残る。

### AI提供元の選択

Claude APIを使う場合は、`AI_PROVIDER`を`anthropic`、`AI_API_KEY`をAnthropic Consoleで発行したキー、`AI_MODEL`を利用可能なClaudeモデル名にする。OpenAIの場合は`AI_PROVIDER`を`openai`にして同じ3プロパティへ設定する。従来の`OPENAI_API_KEY`と`OPENAI_MODEL`も互換用に読み取るが、新規設定では使わない。

## AIを使う範囲

| 処理 | 方法 |
|---|---|
| Webhook受信、対象グループ判定、重複排除、スプレッドシート記録 | GASの通常処理 |
| `/bot`コマンド、承認・却下、台帳ビュー同期、週次の対象期間・重複防止 | GASの通常処理 |
| 導入前履歴の保管 | GASの通常処理。標準ではAI送信しない |
| 決定・タスク・課題の意味の抽出と根拠引用の選定 | AI API |

通常は`signal_only`で、決定・依頼・課題・相談などの手掛かりがない発言のまとまりは`RECORDED`として保存し、AI APIを呼ばない。AIを使わなかった発言も週次の会話件数には含める。ルールだけで決定やタスクを確定登録することはない。

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

実際のLINEグループでの接続確認は、[REAL_DEVICE_TEST.md](REAL_DEVICE_TEST.md) の順に行う。
