# 06 現行処理フロー

## Webhook受信

```text
LINE signed POST
  -> Workerがraw bodyで署名検証
  -> 署名済み本文をGASへ転送
  -> GASがURL token・group ID・text eventを確認
  -> Message IDをLockService内で重複確認
  -> Messagesへ保存
  -> WorkerがGAS最終本文OKを確認してLINEへ200
```

個人トーク、固定外グループ、画像・音声・ファイルは保存しない。

## 5分処理

1. `NEW`または明示的に再解析指定されたメッセージを最大20件取得する。
2. 雑談だけならAIを呼ばず`RECORDED`にする。
3. 対象発言をClaude/OpenAIへ送り、決定・進行方針・タスク・課題候補を抽出する。
4. スキーマ、根拠Message ID、完全一致引用を検証する。
5. 候補を`PENDING`で保存し、閲覧用シートと現況書を更新する。
6. 期間整理・統括相談、通知再試行、週次の失敗・欠測回復を処理する。

## メンション依頼

- `整理して`：直近12時間。
- `3日分整理して` / `直近3日分まとめて`：指定した1〜31日。
- 任意文：直近12時間と継続中の管理事項を背景に統括回答。

AI結果を`SummaryRequests`へ保存してから日次Markdownを作り、LINEへ要約とURLをPushする。Drive・LINE失敗時は保存済みAI結果を再利用する。

## 週次

日曜20時JSTを締切に、未報告発言と継続中の管理事項を整理する。対象Message IDとAI結果を`Reports`へ保存してから週次Markdownを作り、LINEへ要約とURLをPushする。GAS強制終了、日曜トリガー欠測、Drive・LINE一時失敗は5分処理が回復する。

## 即時コマンド

`状態`、`使い方`、`まとめ`、`決定事項`、`進行方針`、`残課題`、`確認待ち`、`今週`、管理者用の`承認 <ID>`・`却下 <ID>`はBotを文頭でメンションして使う。
