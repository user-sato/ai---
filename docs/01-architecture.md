# 01 現行システム構成

## 全体構成

```text
LINE Group
  -> Cloudflare Worker
       - raw bodyでLINE署名検証
       - GASへ署名済み本文を転送
  -> GAS Web App
       - URL tokenと固定group IDを確認
       - Google Sheetsへ重複排除して保存
       - 5分トリガーでClaude/OpenAI解析
       - Google Docs現況書、Drive Markdownを生成
       - LINEへ返信・Push通知
```

## コンポーネント

| 項目 | 採用 | 役割 |
|---|---|---|
| Webhook入口 | Cloudflare Worker | LINE署名検証、GASの302追跡、最終`OK`確認 |
| アプリ | Google Apps Script | Webhook処理、時間トリガー、AI・Google・LINE連携 |
| 正本 | Googleスプレッドシート | メッセージ、管理事項、週次、メンション依頼の状態管理 |
| AI | Claude APIまたはOpenAI API | 候補抽出、期間整理、統括提案 |
| 出力 | Google Docs / Drive Markdown | 常設現況書、日次・週次レポート |
| 通知 | LINE Messaging API | コマンド返信、整理結果、週次URLの投稿 |
| 記録連携 | GitHub Issues API（任意） | 週次レポートからsozoshaリポジトリへ取り込み候補Issueを作成 |

PostgreSQL、Cloud Run、Cloud Tasks、Cloud Schedulerは現行MVPでは使わない。

## 境界と原則

1. Workerで署名検証後、GASは対象の1グループだけを処理する。
2. Webhookはメッセージ保存までを行い、AI処理は5分トリガーへ分離する。
3. Message IDと`LockService`で再送・同時受信の重複を抑止する。
4. AI出力は根拠付き候補であり、人の承認まで決定・進行方針・タスクを確定しない。
5. Google Sheetsを正本とし、Docs・Markdownは出力として扱う。
6. APIキーはGAS Script Properties、Worker Secretへ保存し、ソースやシートへ書かない。
