# 01 システム概要

## 全体構成
```text
LINE Group -> LINE Messaging API -> Webhook (Cloud Run)
                                    -> PostgreSQL (message inbox)
                                    -> Cloud Tasks -> AI extraction (OpenAI API)
                                                   -> decisions/tasks/issues DB
                                                   -> Google Drive sync jobs
Cloud Scheduler -> daily reconciliation / weekly report / monthly rollover
Google Drive API + Docs API + Sheets API <- sync worker
LINE Push API <- report notification worker
```

## コンポーネント
| 項目 | 候補 | 役割 |
|---|---|---|
| 言語 | TypeScript / Node.js | 全体実装 |
| Web | Fastify | Webhook / 管理エンドポイント |
| LINE | Messaging API / @line/bot-sdk | 受信・返信・Push |
| AI | OpenAI API（構造化出力） | 抽出、差分要約、回答 |
| DB | PostgreSQL（Cloud SQL候補） | 唯一の業務データ正本 |
| ORM | Prisma | スキーマ・マイグレーション |
| ジョブ | Cloud Tasks | 非同期処理・リトライ |
| 定期 | Cloud Scheduler | 日次・週次・月次 |
| 文書 | Drive/Docs/Sheets API | 人間向け表示 |

## 境界と原則
1. Webhookでは署名検証・重複排除・永続化を行い速やかに2xx。AI呼び出しは非同期。
2. 新着WebhookはBot加入後のイベントのみ。過去LINE履歴の自動遡及取得は想定しない。
3. 会話がない場合はAI解析をスキップする。
4. AIの出力は候補。根拠と確信度を保存し、確定・担当者割当は人間の確認を原則とする。
5. LINEは通知・簡易操作、Driveは閲覧、DBは正本。Google側編集の逆同期はMVP対象外。
6. 1グループ・1プロジェクトから開始。将来は複数グループ対応可能なID設計にする。
