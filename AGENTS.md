# Codex 実装指示（最優先）

このリポジトリはLINEグループのAI書記Bot。`README.md` と `docs/` が製品要件。MVP実装は `src/`、検証は `tests/` にあり、実装判断・接続前の残課題は `docs/10` 以降を参照する。

## 必須原則
- AIは書記・管理役。会話から決定候補、タスク候補、未決事項を抽出するが、勝手に意思決定・担当者確定をしない。
- PostgreSQLを正本とし、Google Docs/Sheetsは読み取り用の生成物。GoogleからDBへの逆同期はMVP外。
- Google Driveはプロジェクト別→年→月。常設の現況書とタスク一覧はプロジェクト直下。
- LINE Webhookは署名検証（raw body）、重複排除、速やかな2xx、非同期処理を必須とする。
- AIの抽出結果はスキーマ検証と根拠メッセージ照合を行う。未承認の候補を確定事項として報告しない。
- 定期実行は無人。週次レポートのDocs保存が成功してからLINEへURL通知する。
- 認証情報・個人情報をコミット、平文ログ、公開URLに流さない。初期状態では外部送信・課金処理を実行しない。
- 実サービスの設定値が未提供ならモック・テスト・セットアップ手順まで実装し、実環境接続はブロック事項として明記する。

## 実装の進め方
1. `docs/08-implementation-plan.md` のM1→M5を順番に進め、各段階でテストを追加する。
2. TypeScript/Node.js、Fastify、Prisma/PostgreSQL、LINE SDK、OpenAI API、Google API、Cloud Run/Tasks/Schedulerを基本とする。技術的に変更が必要なら理由をADRに記録する。
3. 環境変数は `.env.example` に名前だけ列挙。実キーは作成・推測しない。
4. リポジトリに `src/`, `prisma/`, `tests/`, `infra/`, `scripts/` を適宜作成。READMEにローカル起動・テスト・デプロイ手順を追加。
5. 未決事項は `docs/09-decisions-and-assumptions.md` の暫定値を採用し、ユーザーの判断が必要なものは明示する。
6. APIやSDKの最新仕様を実装時に公式資料で確認する。利用できない場合は確認待ちとして記録する。
7. まずは本番への自動投稿なしで、ローカルテスト・dry-runで一連の処理を検証する。

## 受入条件
`docs/08-implementation-plan.md` のテストケースを最低限網羅し、READMEに未実装項目、実行手順、手動で必要な認証設定を記載すること。
