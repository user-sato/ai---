# 資料案内

## 現行MVP

現在動かす対象は **Cloudflare Worker + Google Apps Script + Googleスプレッドシート** である。次の資料を正とする。

| 資料 | 内容 |
|---|---|
| [`README.md`](../README.md) | 全体概要 |
| [`gas/README.md`](../gas/README.md) | 設定・構成・環境変数 |
| [`gas/USER_GUIDE.md`](../gas/USER_GUIDE.md) | LINEでの使い方 |
| [`gas/REDEPLOY.md`](../gas/REDEPLOY.md) | GAS更新手順 |
| [`gas/REAL_DEVICE_TEST.md`](../gas/REAL_DEVICE_TEST.md) | 実機確認手順 |
| `docs/01`〜`07` | 現行の仕様・処理フロー。入口は[`01`](01-architecture.md) |
| [`docs/09`](09-decisions-and-assumptions.md) | 確定した設計判断と未決事項 |
| [`docs/16`](16-gas-spreadsheet-decision.md)・[`17`](17-cloudflare-workers-assessment.md) | GAS移行・Worker採用の判断記録 |
| [`docs/18`](18-test-specification.md)・[`19`](19-test-results.md) | テスト仕様・結果 |

## 旧Node/PostgreSQL版

`src/`、`prisma/`、`infra/`と、`docs/08`、`docs/10`〜`14`は将来の移行候補として残す旧設計・旧実装である。現行Botの設定やデプロイには使わない。`docs/15`は現行・旧版のファイル区分を示す。
