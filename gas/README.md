# GAS + スプレッドシート版

これが現在のMVPです。PostgreSQL、ローカルサーバー、Cloud Runは使いません。

## 構成

```text
LINE Group
  -> Cloudflare Worker（LINE署名検証）
  -> GAS Web App
       -> Google Sheets（正本）
       -> Claude / OpenAI API（5分ごとの候補抽出・統括）
       -> Google Docs（現況書）/ Drive Markdown（週次・日次統括）
       -> LINE（コマンド返信・週次通知）
```

`Messages`、`Items`、`Reports`、`SummaryRequests`がBotの台帳です。`Tasks`、`Issues`、`Decisions`は閲覧しやすいように更新するBot管理シートです。人が直接編集しても、次回同期で上書きされます。

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
| `ON_DEMAND_SUMMARY_MAX_DAYS` | 任意。メンション要約の最大日数。既定は`31` |
| `ON_DEMAND_SUMMARY_MAX_CHARACTERS` | 任意。1回の要約へ送る最大文字数。既定は`60000` |
| `DAILY_AI_REQUEST_LIMIT` | 任意。メンションによるAI依頼の1日上限。既定は`20` |

4. `setupProject` をApps Scriptエディタから一度実行し、Googleの権限を許可する。スプレッドシート内に必要なシートが作成される。
5. `installTriggers` を一度実行する。5分ごとの解析と、日曜20時頃（JST）の週次処理を登録する。GASの時刻トリガーは厳密な秒単位ではなく、多少前後する。
6. 「デプロイ → 新しいデプロイ → ウェブアプリ」を選ぶ。実行するユーザーは自分、アクセスできるユーザーはLINEから到達できる設定にする。組織のポリシーで公開できない場合、この構成だけではLINE Webhookを受信できない。
7. GASのウェブアプリは`doPost`実行後にHTTP 302でGoogleの一時URLへリダイレクトするため、LINE DevelopersのWebhook URLへ直接設定できない。[Cloudflare Worker gateway](../worker/README.md)をデプロイし、LINE署名を検証してGASへ中継する。WorkerはGASの最終本文が`OK`の場合だけLINEへHTTP 200を返す。
8. Workerの`GAS_WEBHOOK_URL` Secretには、GAS URLを次のように設定する。`WEBHOOK_TOKEN`はURLエンコードする。

```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?webhook_token=<WEBHOOK_TOKEN>
```

9. LINE DevelopersのWebhook URLにはWorker URLを設定して有効にする。`LINE_GROUP_ID`が未設定なら、次節の初回登録を先に完了する。登録後、合意済みのテストグループで通常テキストを1件送る。`Messages`に`NEW`または`RECORDED`で入ること、数分後に必要な発言は`ANALYZED`になり`Items`へ候補が出ることを確認する。登録前の通常発言は保存されない。

### Group IDが分からない初回登録

`LINE_GROUP_ID`をあらかじめ知っている場合は、その値を設定してこの節を飛ばす。分からない場合は、`LINE_GROUP_ID`を空欄にし、代わりに16文字以上の`GROUP_ENROLLMENT_CODE`を設定する。Webhook URLの`WEBHOOK_TOKEN`と登録コードは別のランダム値にする。

Webhookを設定してBotを対象グループへ入れた後、そのグループで次を1回だけ送る。

```text
@Bot 初期化 <GROUP_ENROLLMENT_CODE>
```

Botはその発言のgroup IDを`LINE_GROUP_ID`としてScript Propertiesへ保存し、`LINE_ADMIN_USER_IDS`が空ならその発言者を最初の管理者にする。その後、`GROUP_ENROLLMENT_CODE`を削除する。他グループからの通常発言は保存しない。登録コードを第三者に共有しない。

### 導入前のLINE履歴を取り込む

対象の`.txt`をBot専用Drive親フォルダへアップロードし、URLの`/d/`と次の`/`の間にあるファイルIDを`HISTORICAL_TRANSCRIPT_FILE_ID`へ設定する。Apps Scriptエディタから`importHistoricalTranscript`を一度実行する。

LINEのテキスト書き出し形式（UTF-8、日時・送信者・本文の形式）を読み取り、`Messages`へ`HIST-...`のIDで追加する。同じファイルを再実行しても、同じ発言は重複しない。標準では`RECORDED`として記録するだけで、履歴全文をAIへ送らない。また履歴は週次レポートの対象外にする。候補抽出も必要なら、先に`HISTORICAL_IMPORT_MODE=analyze`を設定するか、取り込み後に`queueHistoricalMessagesForAnalysis`を実行する。履歴本文は命令ではなく記録データとして扱われるため、本文中の依頼やURLをBotが実行することはない。

取り込みを確認したら、`HISTORICAL_TRANSCRIPT_FILE_ID`は削除してよい。元のテキストはDriveに保管され、`Messages`には解析に必要な発言本文も残る。

このMVP更新より前に履歴を取り込んだ場合は、`excludeHistoricalMessagesFromWeeklyReports`を一度実行して、過去履歴を週次対象から外す。

### AI提供元の選択

Claude APIを使う場合は、`AI_PROVIDER`を`anthropic`、`AI_API_KEY`をAnthropic Consoleで発行したキー、`AI_MODEL`を利用可能なClaudeモデル名にする。OpenAIの場合は`AI_PROVIDER`を`openai`にして同じ3プロパティへ設定する。Claudeでは構造化出力（`output_config.format`）でJSONを受け取る。Claude Sonnet 5.5などは強制ツール呼び出し（`tool_choice`の`tool`/`any`）を400で拒否するため使わない。構造化出力に対応したモデルを指定する。従来の`OPENAI_API_KEY`と`OPENAI_MODEL`も互換用に読み取るが、新規設定では使わない。

## AIを使う範囲

| 処理 | 方法 |
|---|---|
| Webhook受信、対象グループ判定、重複排除、スプレッドシート記録 | GASの通常処理 |
| メンション操作、承認・却下、台帳ビュー同期、週次の対象期間・重複防止 | GASの通常処理 |
| 導入前履歴の保管 | GASの通常処理。標準ではAI送信しない |
| 決定・進行方針・タスク・課題の意味の抽出と根拠引用の選定 | AI API |
| `整理して`、期間整理、任意の統括相談、週次の整理・統括提案 | AI API。生成結果を保存してからDrive・LINEを処理する |

通常は`signal_only`で、決定・依頼・課題・相談などの手掛かりがない発言は`RECORDED`として保存し、AI APIを呼ばない。AIを使わなかった発言も週次の会話件数には含める。`queueRecordedMessagesForAnalysis`を手動実行すれば、過去の`RECORDED`発言を後から解析できる。ルールだけで決定やタスクを確定登録することはない。

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

GAS Web Appの`doPost(e)`には、LINEが送る`x-line-signature`ヘッダーが渡されません。またGASのURLは`doPost`実行後にHTTP 302を返すため、LINEのWebhook検証には使えません。Workerが受信窓口になることで、LINE署名検証とHTTP 200応答を行う。

代わりに、次を必須とします。

- WorkerでLINE署名を検証する
- 32文字以上の推測困難な`WEBHOOK_TOKEN`をWorkerからGASへ送るURLのクエリに含める
- `LINE_GROUP_ID`が完全一致するイベントだけ処理する
- 未知のグループ、個人トーク、画像、空テキスト、無効トークンは記録も返信もしない
- GAS用キーはScript Properties、Worker用キーはWorker Secretだけに保存する
- `LockService`とMessage ID照合で同時書込み・再送の重複を防ぐ

group IDは秘密ではありません。URLが漏れた場合は`WEBHOOK_TOKEN`を新しいランダム値に変更し、Worker SecretのGAS URLを更新する。

## メンション操作

Botを文頭でメンションして、後ろに次を送る。

- `状態` — 稼働状態を返す
- `使い方` — 使い方を返す
- `まとめ` — 保存済みの決定・確認待ち・未解決を即時に返す（AI APIを呼ばない）
- `整理して` — 直近12時間を整理し、統括コメント付きでLINE投稿・日次Markdown保存
- `3日分整理して` — 指定期間を同様に整理（最大31日）
- `直近3日分まとめて` — 上と同じ期間整理の言い換え
- その他の任意質問 — 直近12時間の会話を背景に統括として回答し、日次Markdown保存
- `決定事項` / `進行方針` / `残課題` / `確認待ち` / `今週`
- `承認 <ID>` / `却下 <ID>` — `LINE_ADMIN_USER_IDS`に登録した人だけ実行可能

要約Markdownのリンク先をグループ参加者も開くには、Bot専用Drive親フォルダを対象メンバーへ共有する。

LINE Messaging APIにはグループのノートへ投稿するAPIがないため、週次タイトル・要約・Drive URLはグループチャットへ投稿する。

通常の発言へは返答せず、5分ごとの処理で候補化する。AIが抽出した決定・進行方針・タスクは人の承認まで確定しない。承認された進行方針は`ACTIVE`として台帳に残り、以後の整理・週次へ既存状態として渡される。担当者・期限・金額をAIが推測して書き込むこともない。

週次は対象Message IDをAI結果とともに`Reports`へ保存し、Markdown作成前に固定する。DriveやLINEの再試行中に新しい発言が届いても、保存済みAI結果へ混ぜて報告済みにしない。締切後に遅れて届いた古い未報告発言は次回週次へ含める。

メンションによるAI依頼はグループ全体で1日20回、指定期間は1〜31日、AIへ渡す会話と管理事項は合計60,000文字までである。導入前に取り込んだ496件を含む`HISTORICAL`行は、通常の期間整理と週次から除外する。

## 再試行と手動復旧

通常メッセージのAI抽出が一時失敗した場合は`NEW`へ戻し、次の5分処理で再試行する。現行実装では通常抽出の試行回数に上限を設けていない。メンション依頼と週次は一時失敗を最大3回再試行し、AI結果を先にスプシへ保存するため、DriveやLINEの再試行でAIを再実行しない。週次・日次Markdown通知は永続retry keyで重複送信を抑止する。

週次生成が恒久エラーまたは3回失敗で停止した場合は、APIレスポンスや秘密を含まない固定文を対象グループへ通知する。詳細は`Reports`シートとApps Scriptの実行履歴で確認する。

GASだけでは、LINE送信直後に実行が止まった場合の完全な到達確認まではできない。LINEのretry keyで二重送信を抑え、不明な状態はグループ投稿を人が確認してから扱う。

実際のLINEグループでの接続確認は、[REAL_DEVICE_TEST.md](REAL_DEVICE_TEST.md) の順に行う。

グループ参加者向けの操作説明は、[USER_GUIDE.md](USER_GUIDE.md) を共有する。

GAS更新時は、[REDEPLOY.md](REDEPLOY.md) の手順で既存デプロイを更新する。
