# Codexへの最初の依頼

このリポジトリの `AGENTS.md`、`README.md`、`docs/01-architecture.md` 〜 `docs/09-decisions-and-assumptions.md` を読んで、LINE AI書記BotをMVPまで実装してください。

## 実装対象
1. Cloudflare WorkerでのLINE Webhook署名検証、GAS受信、Sheets保存・重複排除
2. 非同期のAI構造化抽出（決定候補・タスク候補・未解決課題）と根拠紐付け
3. Botへの文頭メンションでの照会、期間整理、統括相談、管理者による承認・却下
4. Google Driveのプロジェクト/年/月フォルダ自動作成、常設DocsとSheetsの同期
5. 週次Markdownの生成、LINEへの要約とURL投稿
6. GAS時間トリガーとCloudflare Workerのデプロイ・セットアップ手順
7. 自動テスト、dry-run、エラー時再試行、重複送信抑止、監査ログ

## 進め方
- M1〜M5を段階的に実装。まず設計とタスクを短く提示してからコードを作る。
- テスト実行結果と未実装・未検証事項を最後に報告する。
- LINE・Google・OpenAIの実際の資格情報が必要な場面では、値を要求せず設定手順をREADMEに記載する。
- 本番への送信・デプロイは明示的な許可があるまで行わない。
- 未決事項は `docs/09-decisions-and-assumptions.md` の暫定値を採用する。
