# 03 現行データモデル

Googleスプレッドシートを正本とする。列の最終定義は[`gas/Code.gs`](../gas/Code.gs)の`HEADERS`で管理する。

## 正本シート

| シート | 主キー | 用途 |
|---|---|---|
| `Messages` | LINE Message ID | 本文、送信日時、解析状態、試行回数、週次キー |
| `Items` | `I-...` | 決定、進行方針、タスク、課題、変更候補と根拠 |
| `Reports` | `weekly:YYYY-MM-DD` | 週次状態、期間、Markdown URL、AI結果、LINE retry key、対象Message ID |
| `SummaryRequests` | 依頼元Message ID | 期間整理・統括相談、AI結果、日次URL、通知状態 |

## 閲覧用シート

`Tasks`、`Issues`、`Decisions`は`Items`から再生成するBot管理ビューである。人が直接編集しても次回同期で上書きされる。進行方針は`Items`を正本とし、LINEの`進行方針`で照会する。

## Itemの状態

| 種別 | 承認前 | 承認後 |
|---|---|---|
| `DECISION` | `PENDING` | `CONFIRMED` |
| `PLAN` | `PENDING` | `ACTIVE` |
| `TASK` / `ISSUE` | `PENDING` | `OPEN` |
| `CHANGE` | `PENDING` | 自動承認せず個別確認 |

`REJECTED`は却下済み候補である。すべての候補に根拠Message IDと原文の完全一致引用を保持する。

## 冪等性

- `Messages`はMessage IDで重複排除する。
- `SummaryRequests`は依頼元Message IDで重複排除する。
- `Reports`は週次キーを一意な論理キーとして扱う。
- AI結果、Drive URL、LINE retry keyを送信前に保存し、後段再試行でAIを再実行しない。
