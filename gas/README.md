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
| `PROJECT_CONTEXT` | 任意。プロジェクトの目的・メンバーの役割・現在の段階などを数行で。整理・統括の質を上げるためAIへ渡す（最大2000文字） |
| `SPEAKER_ALIASES` | 任意。発言者の名前表。`userId=本名`、`表示名=本名`をカンマ区切りで書く（例: `Uxxxx=近藤,佐藤 士徳=佐藤`）。userIdは`Messages`シートの「User ID」列で確認する。発言者は完全一致を優先し、部分一致は1件だけ該当する場合に限る。本文・依頼文・背景・管理事項のタイトルと詳細でも表の名前へ揃える。表にない取り込み履歴は書き出しの表示名、表にないuserIdは`未登録の参加者A`… |
| `SOZOSHA_GITHUB_REPO` | 任意。週次の取り込み候補Issueを作るリポジトリ（例: `developerKondo/sozosha`）。トークンと両方そろうまでIssueは作らない |
| `SOZOSHA_GITHUB_TOKEN` | 任意。上のリポジトリのIssue作成だけを許したGitHubトークン（fine-grained、想定はIssues: Read and write。必要権限は公式資料で確認待ち）。発行元は未決 |
| `SOZOSHA_MEMBER_TAGS` | 任意。Issueの行に付けてよい担当タグ。既定は`近藤,内藤,佐藤` |
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

LINEのテキスト書き出し形式（UTF-8、日時・送信者・本文の形式）を読み取り、`Messages`へ`HIST-...`のIDで追加する。同じファイルを再実行しても、同じ発言は重複しない。標準では`RECORDED`として記録するだけで、履歴全文をAIへ送らない。履歴は週次レポートの対象外だが、メンションによる期間整理・統括相談の対象には含める。Bot導入後に受信した発言と時間帯が重なる部分は、受信した発言を正として履歴側を使わない。候補抽出も必要なら、先に`HISTORICAL_IMPORT_MODE=analyze`を設定するか、取り込み後に`queueHistoricalMessagesForAnalysis`を実行する。履歴本文は命令ではなく記録データとして扱われるため、本文中の依頼やURLをBotが実行することはない。

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
- `整理して` — 直近12時間を「方針まとめ」資料（`# タイトル`、対象期間などの前書き、`## 1. 全体方針`〜`## 7. 結論`、`| 優先 | タスク | 状況 |`の表）にして日次Markdownへ保存し、LINEには対象範囲の行と700文字以内の要約（合わせて約800文字）、資料リンクだけを投稿する。見出しは番号と主要語で判定し、全角記号・空白・太字・`###`・括弧書きの違いを許容して正規の表記へ揃える。構成の不足や要約の超過は最大3回まで再生成する
- `3日分整理して` — 指定期間を同様に整理（最大31日）
- `直近3日分まとめて` — 上と同じ期間整理の言い換え。全角数字、「7日分の整理」「1週間分まとめて」「〜してください」などの言い方も期間整理として扱う。「11月4日」のような日付は期間とみなさない
- 「N日分」「N日間」「直近N日」「N週間」を含む任意の質問は、その期間を背景に統括回答する
- 整理・統括の返信の先頭に、実際の対象期間と発言件数（うち導入前の履歴の件数）を表示する
- その他の任意質問 — 直近12時間の会話を背景に統括として回答し、日次Markdown保存
- `決定事項` / `進行方針` / `残課題` / `確認待ち` / `今週`
- `承認 <ID>` / `却下 <ID>` — `LINE_ADMIN_USER_IDS`に登録した人だけ実行可能

要約Markdownのリンク先をグループ参加者も開くには、Bot専用Drive親フォルダを対象メンバーへ共有する。

LINE Messaging APIにはグループのノートへ投稿するAPIがないため、週次タイトル・要約・Drive URLはグループチャットへ投稿する。

通常の発言へは返答せず、5分ごとの処理で候補化する。AIが抽出した決定・進行方針・タスクは人の承認まで確定しない。承認された進行方針は`ACTIVE`として台帳に残り、以後の整理・週次へ既存状態として渡される。担当者・期限・金額をAIが推測して書き込むこともない。

週次は対象Message IDをAI結果とともに`Reports`へ保存し、Markdown作成前に固定する。DriveやLINEの再試行中に新しい発言が届いても、保存済みAI結果へ混ぜて報告済みにしない。締切後に遅れて届いた古い未報告発言は次回週次へ含める。

整理・統括では、発言者を名前表（`SPEAKER_ALIASES`）の本名、表にない取り込み履歴は表示名、表にないuserIdは`未登録の参加者A`…として、日時を日本時間にしてAIへ渡す。LINEのuserIdそのものは送らない。5分ごとの候補抽出は根拠引用を原文と完全一致で照合するため、本文の置き換えをしない。

メンションによるAI依頼はグループ全体で1日20回、指定期間は1〜31日、AIへ渡す会話と管理事項は合計60,000文字までである。導入前に取り込んだ496件を含む`HISTORICAL`行は、週次から除外し、メンションによる期間整理・統括相談には含める。最初のLINE受信以降の時間帯では、履歴行を使わず受信した発言だけを使う。

## sozoshaリポジトリへの週次Issue

`SOZOSHA_GITHUB_REPO`と`SOZOSHA_GITHUB_TOKEN`を設定すると、日曜の週次レポートをLINEへ送った後の5分処理で、週次の「方針まとめ」をsozoshaの書き方（行ごとの`#未決`・`#ToDo`・`#予定`、担当タグ）に直した取り込み候補Issueを1件作る。メンションによる`整理して`・期間整理・統括相談ではIssueを作らない。

- 行はすべて`#未決`付き。担当タグは会話で本人が明言した場合だけ。`#予定`は日付必須。書き方に合わない行は捨てる。
- LINEの原文は入れず、整理した行と根拠の発言IDだけを入れる。
- 状態は`Reports`の「Sozosha Issue Status」に記録する（空=未作成、`CREATING`、`CREATED`、`RETRY:n`、`FAILED`）。AI・検証・GitHubの4xxは最大3回再試行する。
- GitHubへの通信が例外になった場合と5xxの場合は、作成済みか分からないため`CREATING`のまま止め、自動で作り直さない。管理者がsozoshaのIssueを確認し、作成済みならURLを「Sozosha Issue」へ、未作成なら状態を空にして再試行させる。

## 再試行と手動復旧

通常メッセージのAI抽出が一時失敗した場合は`NEW`へ戻し、次の5分処理で再試行する。現行実装では通常抽出の試行回数に上限を設けていない。メンション依頼と週次は一時失敗を最大3回再試行し、AI結果を先にスプシへ保存するため、DriveやLINEの再試行でAIを再実行しない。週次・日次Markdown通知は永続retry keyで重複送信を抑止する。

週次生成が恒久エラーまたは3回失敗で停止した場合は、APIレスポンスや秘密を含まない固定文を対象グループへ通知する。詳細は`Reports`シートとApps Scriptの実行履歴で確認する。

GASだけでは、LINE送信直後に実行が止まった場合の完全な到達確認まではできない。LINEのretry keyで二重送信を抑え、不明な状態はグループ投稿を人が確認してから扱う。

実際のLINEグループでの接続確認は、[REAL_DEVICE_TEST.md](REAL_DEVICE_TEST.md) の順に行う。

グループ参加者向けの操作説明は、[USER_GUIDE.md](USER_GUIDE.md) を共有する。

GAS更新時は、[REDEPLOY.md](REDEPLOY.md) の手順で既存デプロイを更新する。
