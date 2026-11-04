# MVP検証記録・残課題

検証日: 2026-11-04 JST。外部サービスはモック。実LINE/Google/OpenAIへの接続・本番デプロイは行っていない。

## 実行結果

| 検証 | 結果 |
|---|---|
| npm run typecheck | 成功（src・tests・scriptsを対象） |
| npm run build | 成功 |
| npm run format:check | 成功 |
| RUN_DB_TESTS=1 npm test | 48件成功、4ファイル。DBはPostgreSQL 16 |
| 空DBへのprisma migrate deploy | 3マイグレーション成功 |
| npm run dry-run | モックDocs2件、通知1件、未承認候補1件、実API呼出0件 |
| npm run infra:plan | JSTの6ジョブを表示のみ。作成操作なし |
| Docker runtimeイメージのビルド | 成功。Node.js 22のslimベースで依存導入・Prisma生成・コンパイル・本番依存へのpruneを実行。最終の通知テンプレート調整前のビルド |
| ビルド済みローカルサーバー | healthz応答確認。実API呼出なし |

## 必須検証との対応

| 要件 | 自動テストで確認した範囲 |
|---|---|
| Webhook署名 | raw bytes一致、改変・不正形式拒否、HTTP401 |
| 重複受信 | 同じeventId再送、異なるeventIdで同じmessageId、DB1件 |
| AI形式検証 | 不正JSON型、余分な確定状態/推測担当、範囲外confidence、根拠欠落拒否 |
| 根拠照合 | バッチ内ID、原文引用の完全一致。失敗時は未解析状態を維持 |
| 候補と確定 | 提案はPENDING、管理者承認だけCONFIRMED。照会も確定のみ |
| タスク重複 | 正規化タイトルで1項目、追加根拠を結合、担当未確認はNULL |
| 月替わり | 11月/12月各フォルダを再利用。11月の未完了タスクも常設Sheetsに残る |
| 月跨ぎ週 | 11/30〜12/6の配信週は2026-11に格納 |
| 集計期間 | JST初回月曜、連続cutoff、終端排他、境界後・遅延到着の次回回収 |
| 定期処理冪等性 | 同じ週の一意性、並行worker、先行未完成レポートの優先 |
| Google障害 | 通知なし、DB backoff、復旧後1通知。作成後失敗でも再発見 |
| Google通信契約 | 管理キー/親検索、同名流用なし、重複管理キー停止、revision指定、Sheets RAW |
| LINE重複 | 永続UUIDで不明送信を再試行、受付済み409の判定、23時間後停止 |
| 取消・削除 | unsend先着の墓標、根拠/派生データ削除、既存Docs再生成、再通知なし |
| 認証 | 内部APIの未認証拒否、local token、dry-runの内部処理停止 |
| 機密ログ | SDKエラー/会話/キーがHTTPエラー本文・記録ログに露出しない |
| 静かな運用 | 会話なしのAI呼出なし、空週の通知なし、月次の通知なし、退会後収集停止 |

## 実サービスで未検証

- LINEチャネル設定、実署名イベント、Pushの受付/通数/到達、実APIのretry key保持
- OpenAIモデルの実対応・品質・レート制限・費用。引用一致だけで意味的な正しさまで保証はできず、人間承認が必要
- OAuth同意・refresh tokenの継続利用、drive.fileの許可範囲、各参加者のDocs/Sheets閲覧権限
- 実Google APIの遅延・割当制限・Docs revision競合・検索反映時間
- Cloud Run/Tasks/SchedulerのIAM・OIDC実トークン、DBネットワーク、タイムアウト、負荷・復元試験
- GitHub Actionsのリモート実行（設定ファイルのみ作成）

## 未実装・制約

1. 担当者/期限の自動抽出と入力UI。AI推測を避けNULL保持。人間の明示編集機能は今後追加。
2. 高度なAI差分要約。再推論による事実混入と追加費用を避け、DB状態・期間内根拠・新規件数を表示。完全な過去時点の状態復元もMVP外。
3. 原文/生成物/バックアップの期限削除。保存期間が未確定のため有効化しない。取消と管理者依頼の消去ジョブは実装。
4. 管理者への独自外部障害通知・自動費用集計・期限アラート。Cloud MonitoringとDB集計、費用ポータルを利用する。
5. 過去TXT移行、添付、多グループの運用UI、共有ドライブ/サービスアカウント認証、Google逆同期。元設計の将来対象。
6. Google/DB間の分散取引、外部APIの完全なexactly-once保証。管理キー検索・DB一意性・LINE retry keyで抑止し、不明状態は手動確認する。

## 公式資料の確認

実装時に以下の公式ページへHTTPアクセスして確認し、SDK型定義と照合した。接続試験や料金保証を意味しない。運用開始時にモデル・価格・ポリシーを再確認する。

- [LINE Messaging API](https://developers.line.biz/en/reference/messaging-api/)
- [LINE retry keyと再試行](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Drive appProperties](https://developers.google.com/workspace/drive/api/guides/properties)
- [Drive files.create](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create)
- [Docs batchUpdate](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate)
- [Sheets values.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate)
- [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Cloud Tasks HTTP/OIDC](https://cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Cloud Schedulerのcron/timezone](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules)

## 本番までのチェック

運用者が参加者合意・保存期間・費用上限・Google閲覧者・LINE承認者を確定する。外部資格情報とGCP構成を設定し、合成会話の専用グループ/フォルダでdocs/12の受入試験を行う。本番切替・実送信・有料リソース作成は別途明示承認が必要。

## コンテナ起動確認の制限

runtimeイメージのビルドは成功した（ローカル一時イメージsha256:3435e0c89371727fad3c32a810037b732f59b29a14b148b85ece704dce764683）。この環境は容量約8GB・Docker vfs方式で、起動用rootfsの複製時にディスク不足となったため、コンテナ起動/コンテナ内DB接続は未検証。成果物はDockerfileとソースであり、一時イメージは容量回復のため削除した。migration targetイメージも未ビルド。十分な容量のある環境で両targetをビルドし、起動・DB接続を確認すること。

ディスク逼迫時にテストDBコンテナが停止したが、作業用イメージとキャッシュの整理後に再起動した。実データのDBは使っていない。
