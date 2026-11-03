# 06 APIと処理フロー

## 内部API（例）
| Method | Path | 用途 |
|---|---|---|
| POST | `/webhook/line` | LINEイベント受信（署名検証必須） |
| POST | `/internal/jobs/analyze` | 未処理メッセージ解析 |
| POST | `/internal/jobs/sync` | Docs/Sheets同期 |
| POST | `/internal/jobs/weekly-report` | 週次Docs作成・LINE通知 |
| POST | `/internal/jobs/monthly-rollover` | 月フォルダ作成 |
| POST | `/internal/jobs/monthly-report` | 月次Docs作成 |
| GET | `/healthz` | ヘルスチェック（機密を返さない） |

`/internal/*` は公開認証なしにしない。Cloud Scheduler/TasksのOIDC認証やサービス間IAMを使用する。

## Webhook受信
```text
LINE event
  -> x-line-signature検証（raw body）
  -> event type / groupId / text確認
  -> messageIdで重複排除
  -> DB保存
  -> Cloud Tasksへ解析依頼
  -> 200 OK
```

## AI解析
```text
未解析メッセージ + 既存の決定/タスク/課題
  -> AIに構造化抽出依頼
  -> JSON schema validation
  -> evidence ID存在確認
  -> 既存データと突合
  -> PENDING候補として保存
  -> sync job登録
```

## 週次レポート
```text
Scheduler
  -> report_runの一意ロック
  -> 対象期間のDBスナップショット
  -> AIによる差分要約（事実照合）
  -> 年/月フォルダをensure
  -> Google Docs作成/更新
  -> 常設Docs/Sheets同期
  -> URL取得・権限確認
  -> LINE Push通知
  -> report_run完了
```

## コマンド例
- `/bot 残課題`：未解決課題の概要とSheetsリンク。
- `/bot 決定事項`：確定済み決定のみ表示。
- `/bot 確認待ち`：承認待ち候補の一覧。
- `/bot 承認 D-123`：権限を持つ人が候補を確定。
- `/bot 却下 D-123`：候補を却下。
- `/bot 今週`：最新週次Docsへのリンク。

## リポジトリ構成（案）
```text
src/
  app.ts
  adapters/line/
  adapters/google-drive/
  adapters/openai/
  domain/decisions/
  domain/tasks/
  domain/issues/
  services/analyze/
  services/reports/
  services/sync/
  jobs/
  db/
prisma/schema.prisma
tests/
docs/
```
