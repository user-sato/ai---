# テスト仕様書

更新日: 2026-11-04 JST

この文書では、ローカルで自動化できる検証と、認証情報を持つ運用者が実施する実機検証を分ける。外部サービスの実行結果を、ローカルテスト成功として扱わない。

## 自動テスト

| ID | 対象 | 条件 | 期待結果 |
|---|---|---|---|
| AT-01 | Worker署名 | 正しい`x-line-signature` | GASへ1回転送し、最終本文`OK`なら200 |
| AT-02 | Worker失敗 | GAS最終本文が`ERROR` | Workerは502を返し、LINEが再送可能 |
| AT-03 | Worker検証 | 署名済み`events: []` | GASを呼ばず200 |
| AT-04 | GAS構文 | `Code.gs` | Node構文検査とPrettierが成功 |
| AT-05 | 既存Node実装 | 旧Node/Prismaの単体テスト | 既存テストが成功。GAS実行結果の根拠にはしない |
| AT-06 | Sheets安全性 | 数式開始文字を含むLINE本文・AI候補 | 危険な先頭文字へアポストロフィを付ける。Sheets上の評価有無はLTで確認 |

## 実機テスト

| ID | 対象 | 操作 | 期待結果 |
|---|---|---|---|
| LT-01 | GAS設定 | `runPreflightCheck`を実行 | `status: OK`。LINE送信・AI呼出なし |
| LT-02 | 履歴 | `importHistoricalTranscript`と移行関数を実行 | 496件が保存され、Report Keyは`HISTORICAL` |
| LT-03 | Worker/LINE | Worker URLをWebhook URLへ設定し検証 | LINE Developersの検証が成功 |
| LT-04 | 固定グループ | 対象グループで初期化、他グループでも発言 | 対象だけ登録・記録される |
| LT-05 | 雑談の節約 | 挨拶だけを送る | `RECORDED`、Claude API呼出なし |
| LT-06 | AI候補 | 決定・依頼・課題を含む発言 | 根拠付き`PENDING`候補。自動確定なし |
| LT-07 | 承認 | `/bot 承認 <ID>` | 決定は`CONFIRMED`、タスク・課題は`OPEN` |
| LT-08 | Webhook再送 | 同じイベントを再送できる条件を作る | Message IDが重複しない |
| LT-09 | 週次 | `createWeeklyReport`を手動実行 | 期間内の発言だけを使い、過去履歴は混ざらない |
| LT-10 | 週次再開 | 処理中断後に15分以上待ち再実行 | 同名Docsを再利用し、処理が永続停止しない |

実行手順は[gas/REAL_DEVICE_TEST.md](../gas/REAL_DEVICE_TEST.md)を使う。
