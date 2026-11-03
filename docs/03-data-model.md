# 03 データモデル

## テーブル定義（論理）
| テーブル | 主キー | 重要フィールド | 制約・用途 |
|---|---|---|---|
| projects | id | name, status, timezone | 複数案件を想定 |
| line_groups | group_id | project_id, enabled, notify_policy | LINEグループ紐付け |
| messages | id | line_message_id, group_id, user_id, body, sent_at, received_at | line_message_idをUNIQUE、重複受信防止 |
| analysis_batches | id | project_id, range_start, range_end, model, status | バッチ再実行・追跡 |
| decisions | id | project_id, title, detail, status, confirmed_at, version | PROPOSED/PENDING/CONFIRMED/SUPERSEDED/REJECTED |
| tasks | id | project_id, title, assignee_user_id?, due_at?, status, version | 未確定値はNULL |
| issues | id | project_id, title, priority, status, version | OPEN/RESOLVED |
| evidence | id | entity_type, entity_id, message_id, quote_excerpt | 各項目の根拠 |
| document_registry | id | project_id, type, period_key?, google_file_id, web_url, revision | Googleファイルの一意参照 |
| drive_folders | id | project_id, year, month?, folder_type, google_folder_id | 月次フォルダ再利用 |
| sync_jobs | id | project_id, target_key, content_hash, status, attempts | 同期の冪等性 |
| report_runs | id | project_id, report_type, period_start, period_end, status | 週次・月次の一意性 |
| notification_outbox | id | project_id, report_run_id?, payload_hash, status, sent_at? | LINE重複通知の抑止 |
| audit_logs | id | actor, action, target_type, target_id, before, after, at | 承認・修正履歴 |

## 重要な一意制約
- `messages.line_message_id` UNIQUE
- `drive_folders(project_id, year, month, folder_type)` UNIQUE（NULLの扱いは実装時に調整）
- `document_registry(project_id, type, period_key)` UNIQUE（常設文書は固定period_key）
- `report_runs(project_id, report_type, period_start, period_end)` UNIQUE
- `sync_jobs(target_key, content_hash)` UNIQUE

## サンプル抽出JSON
```json
{
  "decisions": [{"title":"参加費", "value":"1500円", "status":"PENDING", "evidenceMessageIds":["line-101"]}],
  "tasks": [{"title":"チラシ作成", "assigneeUserId":null, "dueAt":null, "status":"PROPOSED", "evidenceMessageIds":["line-102"]}],
  "issues": [{"title":"受付方法が未確定", "status":"OPEN", "evidenceMessageIds":["line-103"]}]
}
```

## 保存・削除
保存期間は導入前に決定。原文メッセージ、AI抽出物、Docs/Sheetsの生成物を関連付けて削除・再生成できる設計にする。ユーザーID等は表示用氏名とは分離する。
