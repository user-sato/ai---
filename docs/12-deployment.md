# Cloud Run / Cloud Tasks / Cloud Scheduler

本書の操作は運用者が承認後に行う。開発作業ではクラウド作成・デプロイ・実LINE通知を行っていない。

## 構成・費用判断

Cloud SQL等のPostgreSQL、Artifact Registry、Cloud Run、Tasks queue、Scheduler、Secret Managerを用意する。Cloud SQLには固定費があり、既存DBや代替DBも比較する。リージョン・バックアップ・予算上限は運用者が決める。無料枠は保証しない。

## IAM

実行用app-sa、ジョブ呼出用job-sa、デプロイ担当を分離する。

- app-sa: 必要なSecretのsecretAccessor、対象Tasks queueのcloudtasks.enqueuer、job-saに対するiam.serviceAccounts.actAs。Cloud SQL使用時はcloudsql.client。
- job-sa: Scheduler/TasksがOIDCトークンに使う本人。Botはemail、email_verified、aud、issuerを検証する。
- Scheduler/Tasksのservice agentには、公式手順で必要なtokenCreator権限を設定する。
- Scheduler作成者にはjob-saのserviceAccountUserと必要な管理権限。
- DATABASE_URL、LINEキー、Google OAuth、OpenAIキーはSecret Managerで注入。Gitやgcloud引数に値を直書きしない。

## ビルド

プロジェクトルートで実行する。

```sh
docker build -f infra/Dockerfile -t "$IMAGE" .
docker build -f infra/Dockerfile --target migration -t "$MIGRATION_IMAGE" .
```

このCodex環境ではネットワーク用CAを一時マウントする。

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f infra/Dockerfile -t "$IMAGE" .
```

依存インストール時のTLS検証は有効のまま。リリースはタグだけでなくdigestで固定する。

## DBマイグレーションと初期登録

使い捨てDBでSQLを検証し、実DBのバックアップ後に`npm run db:migrate`。接続は承認済みのCloud SQL proxy/VPC等から行う。通常のruntime imageにはPrisma CLIを含めない。Cloud Run Jobを使うならmigration targetのイメージへDATABASE_URLをSecretから注入し、承認済みのDB接続設定で実行する。

管理端末で`PROJECT_ID/PROJECT_NAME/LINE_GROUP_ID`を設定し`npm run db:seed`。初期データに資格情報を含めない。ロールバックより前方互換の修正を基本にする。

## Cloud Run

初期構成案: memory1GiB、CPU1、timeout300秒、concurrency4、max-instances2。負荷・DB接続枠に応じて変更する。min-instances0ならコールドスタートがある。これらは費用承認済みの値ではない。

LINE Webhookを受けるためサービス自体にはpublic ingressが必要。**内部APIはアプリでGoogle署名付きOIDCを検証**する。WebhookはLINE署名を検証する。無認証の内部操作を作らない。

- `INTERNAL_AUTH_MODE=oidc`
- `INTERNAL_AUDIENCE=WORKER_URL=<Cloud Run HTTPSサービスURL、末尾/なし>`
- `INTERNAL_SERVICE_ACCOUNT=<job-sa email>`
- `GCP_PROJECT_ID/GCP_LOCATION/TASKS_QUEUE`を設定
- 最初はDRY_RUN=trueでhealthzとWebhookを確認。内部ジョブは409で止まる
- 合意済みの専用環境でのみliveゲートを有効化する

PostgreSQL接続例: Cloud SQL Unix socket利用時はURLのhost queryに`/cloudsql/PROJECT:REGION:INSTANCE`を指定し、Cloud Run側にもCloud SQL instance接続を設定する。パスワードはURLエンコードする。一般DBではプロバイダのTLS要件に従う。

## Cloud Tasks

作成承認後の例:

```sh
gcloud tasks queues create "$QUEUE" --location="$REGION" \
  --max-concurrent-dispatches=2 --max-dispatches-per-second=2 \
  --max-attempts=5 --min-backoff=10s --max-backoff=300s
```

DB Jobが正本。Task作成失敗は次のdispatcherが回収する。重複TaskはDB lockとDONE判定で抑止。TaskはOIDC付きで`/internal/jobs/run`を呼ぶ。Task期限300秒、外部API30〜45秒、DB取引240秒。DBの指数バックオフで10回失敗するとFAILEDになる。

## Cloud Scheduler

`npm run infra:plan`はgcloudコマンドを表示するだけで実行しない。project、REGION、SERVICE_URL、JOB_SAを自分の環境に合わせ、承認後に適用する。

[定義](../infra/schedules.json)の6ジョブはすべてAsia/Tokyo。dispatchは毎分、解析は5分、日次点検は23時、週次は日曜20時、新月フォルダは1日00:10、月次は1日09時。OIDC audienceはサービスURL、emailはjob-sa。

認証済みSchedulerの`X-CloudScheduler-ScheduleTime`を使い、遅延・再試行でも同じcutoffにする。ヘッダーがない手動実行は現在時刻。任意期間をpayloadで指定するAPIは設けない。

## 許可後の接続受入試験

1. 専用グループ・Googleフォルダ・DB、合成発言のみでWebhook再送と候補抽出。
2. 管理者のみ承認でき、Docs/Sheetsに反映されること。
3. 各参加者のGoogleアカウントで閲覧できること。
4. 週次Docs成功後だけ1通通知され、再実行しても増えないこと。
5. Google認可を無効にした専用環境で通知抑止→復旧→再試行を確認。
6. DB復元・監視・コストアラート・停止手順を確認して本番へ移行。

## Cloud Runコマンド例（承認後に手元で実行）

初回はdry-runで起動し、サービスURLを取得してからOIDC audienceを確定する。Secretは事前に運用者が登録する。以下は手順の例であり、この開発作業では実行しない。

```sh
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" \
  --service-account="$APP_SA" --allow-unauthenticated \
  --memory=1Gi --cpu=1 --timeout=300 --concurrency=4 --max-instances=2 \
  --set-secrets=DATABASE_URL=secretary-database-url:latest \
  --set-env-vars="DRY_RUN=true,INTERNAL_AUTH_MODE=oidc,INTERNAL_AUDIENCE=https://setup.invalid,INTERNAL_SERVICE_ACCOUNT=$JOB_SA"
SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars="INTERNAL_AUDIENCE=$SERVICE_URL,WORKER_URL=$SERVICE_URL,GCP_PROJECT_ID=$PROJECT,GCP_LOCATION=$REGION,TASKS_QUEUE=$QUEUE"
```

`https://setup.invalid`は初回bootstrap専用のaudienceで、正規ジョブを実行できない。サービスURLへの更新を忘れない。Cloud SQL接続、全Secretの注入、モデル・root ID・管理者設定は別途必要。合意済みテスト送信の直前にだけ、下記3フラグを同時に変更する。

```sh
gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars="DRY_RUN=false,EXTERNAL_PROCESSING_APPROVED=true,GOOGLE_ACCESS_REVIEWED=true"
```

権限や設定が不足すると起動を拒否する。失敗したrevisionにtrafficを切り替えない。本番用とステージング用でLINEグループ・Google root・DB・Secretsを分離する。
