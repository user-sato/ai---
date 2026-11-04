# テスト結果

更新日: 2026-11-04 JST

## 実施済み

| ID | 結果 | 根拠 |
|---|---|---|
| AT-01 | 成功 | `worker/worker.test.mjs`で、正しい署名とGAS最終本文`OK`に対し200を確認 |
| AT-02 | 成功 | 同テストでGAS本文`ERROR`に対し502を確認 |
| AT-03 | 成功 | 同テストで空イベント時にGAS fetchが呼ばれないことを確認 |
| AT-04 | 成功 | `node --check --input-type=commonjs < gas/Code.gs`、`node --check worker/src/index.mjs`、Prettierが成功 |
| AT-05 | 成功 | `npm test`: 28件成功、25件スキップ（旧Node版のDB統合テストを含む） |
| AT-06 | 成功 | `gas-safety.test.ts`で`=`, `+`, `-`, `@`から始まる値のエスケープと、閲覧用シートへの再転記時のエスケープを確認。実際のGoogle Sheets上で数式評価されないことはLTで確認待ち |
| LT-03 | 成功 | 2026-11-04 JST、LINE DevelopersでCloudflare Worker URLのWebhook検証に成功（利用者実施） |

以前に公開済みGAS URLへ行った読み取り検証では、`/exec`が302を返し、通常のリダイレクト追跡後には本文`OK`となることを確認した。この確認は旧デプロイ済みコードに対するものであり、最新コードの実機確認ではない。

## 未実施

LT-03を除くLT-01からLT-10は、LINE・Cloudflare・Claude・Google Apps Scriptの利用者認証が必要なため、この環境からは未実施である。実機テスト時は結果をこの表へ追記し、失敗時は実行ログから秘密情報を除いて記録する。
