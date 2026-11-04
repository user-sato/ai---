# Codex 作業開始ガイド

## 現在の実装

現行MVPは、Cloudflare Worker、Google Apps Script（GAS）、Google Sheetsを中心に構成する。

- Cloudflare Worker: LINE Webhookの署名検証、GASへの転送、最終応答の確認
- GAS: 許可グループの限定、メッセージ保存、重複排除、AI整理、レポート生成、LINE返信
- Google Sheets: メッセージ・整理項目・レポート・依頼履歴の正本
- Google Drive: 日次・週次MarkdownとGoogle Docs形式の現況書を保存
- Claude APIまたはOpenAI API: 会話の整理と統括コメントの生成

Node.js、PostgreSQL、Cloud Runを使う旧設計は、将来移行を検討するための参考資料として残している。現行MVPの保守では使用しない。

## 最初に読む資料

1. `AGENTS.md`
2. `README.md`
3. `docs/README.md`
4. `gas/README.md`
5. `worker/README.md`

機能仕様の確認には `docs/01-architecture.md` から `docs/07-security-operations.md`、決定事項には `docs/09-decisions-and-assumptions.md`、テストには `docs/18-test-specification.md` と `docs/19-test-results.md` を参照する。

## 作業ルール

- 現行実装を変更するときは、GASとWorkerの責務境界を維持する。
- Sheetsを正本、Drive上のMarkdownとGoogle Docs現況書を出力として扱う。
- 旧Node版の `src/`、`prisma/`、`infra/` は、移行作業を明示的に依頼された場合だけ変更する。
- コード変更に合わせて、README、運用手順、テスト仕様、テスト結果を更新する。
- 本番デプロイ、実際のLINE送信、既存Driveファイルの削除・上書き、有料リソースの作成は、利用者の明示的な承認なしに行わない。

## 検証

```bash
npm test
```

外部認証情報がない検証はモックで行い、実サービスで未確認の動作は未確認と明記する。
