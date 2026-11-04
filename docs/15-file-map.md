# 15 主要ファイル

## 現行MVP

| パス | 責務 |
|---|---|
| `worker/src/index.mjs` | LINE署名検証、GAS転送、HTTP 200/502制御 |
| `worker/worker.test.mjs` | Worker署名・転送契約テスト |
| `gas/Code.gs` | Webhook、Sheets正本、AI、Drive、LINE、定期処理 |
| `gas/appsscript.json` | GAS権限・JST・V8設定 |
| `gas/README.md` | 導入・Script Properties・構成 |
| `gas/USER_GUIDE.md` | グループ参加者向け操作説明 |
| `gas/REDEPLOY.md` | GAS更新デプロイ |
| `gas/REAL_DEVICE_TEST.md` | 実サービス受入手順 |
| `tests/gas-safety.test.ts` | GASの純粋処理・状態経路のVMテスト |
| `docs/18-test-specification.md` | テスト仕様 |
| `docs/19-test-results.md` | 最新テスト結果 |

## 旧Node/PostgreSQL版

`src/`、`prisma/`、`infra/`、`scripts/`とNode向けテストは将来移行用の旧実装である。現行GAS MVPのデプロイには使わない。対応する旧資料は`docs/08`、`docs/10`〜`14`である。
