# 受入テスト

GAS固有のサービスはローカル実行環境から接続できないため、`Code.gs`の構文検査に加え、以下を専用LINEグループ・専用スプレッドシート・専用Driveフォルダで確認する。実グループで試す前に、参加者へ説明して合意を得る。

## 事前確認

- Script Propertiesに設定値がそろっている。`WEBHOOK_TOKEN`は32文字以上で、`LINE_GROUP_ID`は試験グループだけを指す。Group ID不明なら`GROUP_ENROLLMENT_CODE`を16文字以上で設定し、初期化後に削除されることを確認する。
- `setupProject`実行後、`Messages`、`Items`、`Reports`、`Tasks`、`Issues`、`Decisions`、`SummaryRequests`シートがある。
- `installTriggers`後に5分解析・日曜週次のトリガーが各1本だけある。

## 受信と重複

1. 試験グループで通常発言を1件送る。`Messages`に1行、`NEW`として記録される。
2. LINE DevelopersのWebhook再送または同じイベントの再送で、同じMessage IDの行が増えない。
3. 別グループで発言し、どのシートも変化しない。
4. Webhook URLの`webhook_token`を変えたリクエストでは、どのシートも変化しない。
5. 短時間に複数の発言を送っても、Message IDの重複がない。Apps Scriptの実行履歴に`LOCK_UNAVAILABLE`が続く場合は負荷・クォータを見直す。
6. 初回登録モードでは、対象グループでBotを文頭メンションし`初期化 <GROUP_ENROLLMENT_CODE>`を送る。`LINE_GROUP_ID`が保存され、登録コードが削除され、送信者が最初の管理者になる。二度目や別グループの通常発言で対象が置き換わらない。
7. 導入前履歴のテキストをDriveへ置き、`HISTORICAL_TRANSCRIPT_FILE_ID`を設定して`importHistoricalTranscript`を実行する。`Messages`に`HIST-`で始まるIDの発言が追加され、再実行しても件数が増えない。本文中の命令文による外部操作は起きない。
8. `AI_ANALYSIS_MODE=signal_only`で挨拶だけの発言を送る。5分後に`RECORDED`になり、AI API呼出がない。決定・依頼・課題を含む発言では`ANALYZED`と候補作成へ進む。
9. 導入済みの履歴がある場合は`excludeHistoricalMessagesFromWeeklyReports`を実行する。履歴行のReport Keyが`HISTORICAL`となり、週次対象に入らない。
10. Botをメンションして`まとめ`で確定・確認待ち・未解決の件数と主な項目が返る。Claude APIの実行履歴が増えない。

## AI候補と承認

1. 「参加費1500円にしようかな」と送る。次の5分処理後に決定候補が`PENDING`で、根拠のMessage IDと引用を持つ。
2. 担当者が明示されないタスクで、担当者を推測していないことを確認する。
3. 非管理者からBotをメンションして`承認 <ID>`を送る。候補が変化しない。
4. 管理者から同じ操作をする。決定だけが`CONFIRMED`になる。Botへ`決定事項`と送ると確定済みだけを返す。
5. 進行方針の候補を承認すると`ACTIVE`になり、Botへ`進行方針`と送ると有効な方針だけを返す。

## レポートと失敗回復

1. `createWeeklyReport`をApps Scriptエディタから手動実行する。週次Markdownが年/月/週次レポートフォルダに作られ、成功後に1回のPush APIリクエストで3個のテキストメッセージが送られる。
2. 同じ週にもう一度実行し、Markdownと通知が増えない。
3. 一時的にAI APIキーを無効にして`processPendingMessages`を実行する。対象が`NEW`へ戻り、キー復旧後の次回処理で候補化される。Drive更新だけを失敗させた場合は、候補を再解析せず次の5分処理で現況Docsが更新される。
4. LINEトークンを一時的に無効にして週次を実行する。`Reports`が`READY_TO_SEND`になり、復旧後の5分処理または`retryPendingWeeklyNotifications`で同じretry keyを使って再送できる。
5. AIまたはDriveを一時的に失敗させる。`Reports`が`FAILED`になり、復旧後の5分処理で最大3回まで再開する。AI結果保存後の失敗ではAI API呼出が増えない。

## 制約の確認

GASはLINE署名を検証できないため、Webhook入口のCloudflare Workerが生の本文で署名を検証する。GASは固定グループIDとURL tokenも再確認する。token漏えい時はScript PropertyとWorker SecretのGAS URLを同時に更新する。
