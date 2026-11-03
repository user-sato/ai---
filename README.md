# LINE AI書記Bot

LINEグループの会話から、根拠付きの決定候補・タスク候補・未解決課題を整理するTypeScript MVPです。PostgreSQLを正本とし、Google Docs/Sheetsへ一方向に同期します。**初期状態は外部送信を無効にしたdry-runです。**

## 機能

- LINE署名検証、受信・重複排除、DB inboxと非同期ジョブの原子的保存
- OpenAI構造化抽出、スキーマ・原文引用検証、人間による承認と監査履歴
- OAuthによるDriveの案件/年/月フォルダ、現況Docs、タスク・課題Sheets
- 日曜20時JSTの週次速報、暦月の月次Docs、同期成功後のLINE通知
- DBロック、指数バックオフ、永続retry key、送信取消の墓標と生成物再生成
- Cloud Runコンテナ、Cloud Tasksアダプタ、Scheduler定義、モックとDB統合テスト

## ローカル起動

Node.js 22以上、npm、Docker Composeを用意します。

```sh
npm ci
npm run db:generate
docker compose -f infra/compose.yaml up -d
cp .env.example .env
```

`.env`に設定します。値をGitに追加しないでください。

```dotenv
DATABASE_URL=postgresql://secretary:local-development-only@127.0.0.1:5432/secretary
DRY_RUN=true
INTERNAL_AUTH_MODE=local
INTERNAL_LOCAL_TOKEN=<自分で生成した32文字以上のランダム値>
LINE_CHANNEL_SECRET=<ローカル署名テスト用の値>
LINE_GROUP_ID=synthetic-group
```

```sh
npm run db:migrate
npm run db:seed
npm run dev
# 別ターミナル
curl http://127.0.0.1:8080/healthz
npm run dry-run
```

`dry-run`はlocalhostのDBで一時プロジェクトと合成会話を使い、モックAI→保存→モックGoogle文書→モックLINE通知を実行して一時データを消去します。実API呼び出しはありません。受信APIはdry-runでも署名検証・DB保存しますが、HTTPの内部ジョブ実行は409で停止し、モック成功を運用データに記録しません。

## 環境変数

`.env.example`は設定名のみ。空欄は未設定として扱います。

| 名前 | 用途・既定値 |
|---|---|
| DATABASE_URL | PostgreSQL接続、必須。本番はTLS/Cloud SQL接続を使用 |
| PORT | 8080 |
| DRY_RUN | true。falseで実APIを使用 |
| EXTERNAL_PROCESSING_APPROVED | false。参加者合意・外部処理承認後のみtrue |
| GOOGLE_ACCESS_REVIEWED | false。共有先の人間による確認後のみtrue |
| LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN | Webhook署名 / Push認証 |
| LINE_GROUP_ID / PROJECT_ID / PROJECT_NAME | seed対象 / main / LINEプロジェクト |
| LINE_ADMIN_USER_IDS | 管理者userIdをカンマ区切り。未設定なら承認不可 |
| OPENAI_API_KEY / OPENAI_MODEL | APIキー / 運用者が選ぶStructured Outputs対応モデル |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN | 管理者OAuth |
| GOOGLE_DRIVE_ROOT_ID | 同じOAuthアプリが作成・許可された非公開の親フォルダ |
| INTERNAL_AUTH_MODE | oidc（既定）/ local（ループバック専用） |
| INTERNAL_LOCAL_TOKEN | local時に32文字以上 |
| INTERNAL_AUDIENCE | OIDCのaud。実接続時WORKER_URLと一致 |
| INTERNAL_SERVICE_ACCOUNT | Scheduler/Tasksの呼出元SAのemail |
| GCP_PROJECT_ID / GCP_LOCATION / TASKS_QUEUE | Tasks project / asia-northeast1 / line-secretary |
| WORKER_URL | Cloud Run HTTPSサービスURL、末尾スラッシュなし |
| MAX_ANALYSIS_MESSAGES | 上限50、1〜100。原文合計約25,000文字まで |

OAuth設定スクリプトのみ `GOOGLE_REDIRECT_URI`、`GOOGLE_AUTH_CODE`、`GOOGLE_AUTH_STATE` を使います。

## テスト

```sh
npm run typecheck
npm run build
npm test
# localhostの使い捨てPostgreSQLにマイグレーションを適用した上で
DATABASE_URL=<test-db-url> npm run test:integration
# 全テスト
DATABASE_URL=<test-db-url> RUN_DB_TESTS=1 npm test
```

通常の`npm test`はDBなしのテストを実行し、DB統合テストをskipします。統合テストはlocalhost限定で専用プロジェクトを作成・消去します。実サービス接続試験とは区別してください。

## LINEコマンド

| コマンド | 動作 |
|---|---|
| `/bot 決定事項` | CONFIRMEDのみ |
| `/bot 残課題` | OPENのタスク・課題 |
| `/bot 確認待ち` | PENDING候補と内部ID |
| `/bot 今週` | 最新の完成済み週次Docs |
| `/bot 承認 <ID>` / `/bot 却下 <ID>` | 管理者のみ。決定はCONFIRMED、承認タスクはOPEN |
| `/bot 完了 <ID>` / `/bot 解決 <ID>` | 管理者のみ。タスクDONE / 課題RESOLVED |

照会はグループへのPushです（送信通数に計上）。通常発言には返信しません。矛盾・変更候補はPENDINGのまま保持し、自動適用しません。

## 定期処理

[Scheduler定義](infra/schedules.json)はAsia/Tokyoです。Dispatcherは1分、解析は5分単位。会話ゼロならAIを呼びません。

週次は日曜20時の速報版。初回の表示期間は月曜00時〜日曜20時、以後は前回cutoff〜今回cutoff、終端排他。締切後の発言と遅延到着を次回へ含め、実期間と遅延件数を明記します。格納月は配信週の月曜の月。月次は暦月集計、翌月1日09時にDriveへ保存しLINE通知しません。

## 設定・デプロイ・運用

- [開発・LINE・Google・OpenAI設定](docs/11-setup.md)
- [Cloud Run / Tasks / Scheduler](docs/12-deployment.md)
- [監視・障害復旧・削除](docs/13-operations.md)
- [実装判断と設計との差分](docs/10-implementation-decisions.md)
- [検証結果と残課題](docs/14-validation.md)
- [主要ファイル一覧](docs/15-file-map.md)
- 元設計: docs/01〜09、[AGENTS.md](AGENTS.md)、[CODEX_START_HERE.md](CODEX_START_HERE.md)

## 本番前の残作業・制限

実LINE/Google/OpenAI接続とGCPデプロイは未実施です。参加者合意、保存期間、承認者、閲覧者、費用上限・監視閾値を運用者が確定し、専用グループと専用Googleフォルダで接続確認してください。

対象は1グループ・テキストのみ。過去履歴TXT移行、添付、Google逆同期は対象外。担当者/期限は推測を避けNULLを維持します。全文修正・担当者/期限入力UI、高度なAI差分要約、自動期限通知、費用集計API、管理者専用の外部障害通知は未実装です。レポートはDBの状態・新規項目・根拠を決定論的に表示します。取消後の過去LINE投稿やバックアップの消去は自動保証しません。
