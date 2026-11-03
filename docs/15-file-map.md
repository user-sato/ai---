# 主要ファイル

| パス | 責務 |
|---|---|
| src/app.ts | Fastify、raw署名、内部認証、HTTP入口 |
| src/config.ts | 環境設定、実送信ゲート |
| src/domain.ts | 抽出スキーマ、根拠検証、期間計算、ハッシュ |
| src/services/ingest.ts | inbox、イベント重複排除、取消墓標、退会 |
| src/services/analyze.ts | バッチ解析、候補と根拠保存 |
| src/services/commands.ts | 管理者承認・照会・通知outbox |
| src/services/sync.ts | フォルダ/現況Docs/Sheets、内容ハッシュ |
| src/services/reports.ts | 週次/月次、遅延発言、取消後再生成 |
| src/jobs.ts | DBロック、ジョブ実行、バックオフ、通知再試行 |
| src/adapters/ | OpenAI/Google/LINE/Cloud Tasksとモック |
| prisma/schema.prisma、prisma/migrations/ | DBモデル・適用可能SQL |
| scripts/seed.ts、google-setup.ts | 明示登録・管理者OAuth設定 |
| scripts/dry-run.ts、operations.ts | 合成データ検証・DB運用 |
| infra/Dockerfile、compose.yaml、schedules.json | 配布コンテナ・ローカルDB・JST定期処理 |
| .github/workflows/ci.yml | PostgreSQL付きCI（リモート未実行） |
| tests/ | 署名/構造化出力/API契約/DB統合 |
| docs/10〜14 | 実装判断、設定、デプロイ、運用、検証 |
