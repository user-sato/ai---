# 開発環境・外部サービス設定

## 開発とDB

READMEの手順でNode.js 22以上、PostgreSQL 16を用意。依存はpackage-lock.jsonで固定する。`npm ci`、`npm run db:generate`、`npm run db:migrate`を実行する。

DB定義はprisma/schema.prismaとSQL migrations。`prisma db push`を本番で使わない。アプリ実行ユーザーのDML権限と、DDLを持つマイグレーションユーザーを分離する。バックアップ・復元試験を行う。接続数はCloud Run最大インスタンス数×Prismaプール数がDBの上限を超えないよう設定する（接続URLの`connection_limit`等）。

## LINE Developers

1. 運用者がLINE公式アカウントを作り、Messaging APIを有効化する。
2. チャネルシークレット、長期アクセストークンをSecret Managerへ保管する。
3. グループトークへの参加を許可。二重応答を防ぐため、公式アカウントの応答メッセージ・挨拶は運用に応じて無効化する。
4. HTTPS Webhook URLを `<SERVICE_URL>/webhook/line` に設定。Webhook利用と再送を有効化する。
5. 合意済みの専用テストグループへ招待。groupIdと管理者userIdは管理者向けの開発ツール等で安全に取得する。本アプリは未知のグループを自動登録せず、識別子を平文ログへ出さない。
6. `LINE_GROUP_ID`、`LINE_ADMIN_USER_IDS`、`PROJECT_ID`を設定し`npm run db:seed`。グループ再割当はseedでは拒否する。
7. LINEコンソールのWebhook検証（空events）と再送を確認し、許可後に合成発言・コマンドで接続試験する。

Bot加入前の過去履歴は取得しない。個人トーク・room・画像等は収集しない。コマンド応答にもPush送信通数を使う。

## Google OAuth / Drive / Docs / Sheets

個人Driveでは管理者OAuthを使う。共有ドライブ・サービスアカウントはMVP外。

1. GCPでDrive API、Docs API、Sheets APIを有効化。OAuth同意画面、管理者テストユーザー、WebアプリのOAuthクライアントを設定する。
2. リダイレクトURIを登録（例: 自分のPCの `http://localhost:3000/oauth2callback`）。同じ値を`GOOGLE_REDIRECT_URI`、クライアントID・シークレットを手元の非公開`.env`へ設定する。
3. `npx tsx scripts/google-setup.ts auth-url`でURLを生成。ブラウザで管理者が明示的に認可する。スコープは`https://www.googleapis.com/auth/drive.file`のみ。Docs/Sheetsもこのスコープを受け付ける。
4. リダイレクトURLのcodeとstateを `GOOGLE_AUTH_CODE` / `GOOGLE_AUTH_STATE` に、シェル履歴へ残さず入力する。例: `read -rs GOOGLE_AUTH_CODE; export GOOGLE_AUTH_CODE`。簡易スクリプトはHTTPコールバックサーバーを起動しないため、接続エラーでもブラウザのアドレスから取得する。管理者がHTTPSコールバックを用意してもよい。
5. `npx tsx scripts/google-setup.ts exchange`。state照合後に`.secrets/google-oauth.json`へ600権限で保存する。既存ファイルを上書きしない。refresh_tokenを安全に`GOOGLE_REFRESH_TOKEN`用Secret Managerへ移す。access_tokenは実行設定に不要。
6. **新規フォルダ作成を許可した場合のみ** `npx tsx scripts/google-setup.ts create-root --approve-create`。IDは`.secrets/google-root.json`へ保存。既存設定があれば拒否する。ネットワーク切断直後は作成済みの可能性があるため、再実行前にDriveを確認する。
7. `GOOGLE_DRIVE_ROOT_ID`を設定。drive.fileでは任意の既存フォルダIDを入力してもアクセスできるとは限らない。同じOAuthアプリで作ったrootを基本とし、既存フォルダを使う場合はGoogle Picker等での明示許可を別途用意する。
8. rootの共有先は管理者が手動設定。Botはanyone権限や公開リンクを作らない。各参加者のGoogleアカウントで生成Docs/Sheetsを開けるか確認後、`GOOGLE_ACCESS_REVIEWED=true`とする。

OAuthアプリがExternal/Testingの場合、refresh tokenが短期間（通常7日、設定・スコープによる）で失効し得る。本稼働前に公開ステータス、検証要否、組織ポリシーを確認する。失効時は再認可。資格情報ファイルをGit/ログへ出さない。

## OpenAI

1. 運用者がプロジェクト・APIキーを発行。最新のモデル・料金表からStructured Outputs対応モデルを選び、`OPENAI_API_KEY`と`OPENAI_MODEL`に設定する。
2. 利用制限、予算アラート、レート制限を設定する。予算アラートが強制停止とは限らないため、DRY_RUN切替・Scheduler停止等の手順も用意する。
3. 参加者の外部処理合意とデータ取り扱いを確認。最初は合成会話だけで試験する。
4. 会話内の命令を無視し、候補・根拠だけを返すことを確認する。

解析は5分単位、50件/約25,000文字を初期上限とする。モデル単価・トークン量で費用は変わり、固定の月額は保証しない。レポート本文はAIを再呼出せずDBから生成する。

## 実接続ゲート

DRY_RUN=falseには資格情報に加え、`EXTERNAL_PROCESSING_APPROVED=true`、`GOOGLE_ACCESS_REVIEWED=true`、OIDC設定、GCP_PROJECT_ID、WORKER_URLが必要。不足時は起動を拒否する。local認証はループバック専用でliveモードには使えない。
