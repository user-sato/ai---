# 運用・障害対応

## 監視

`/healthz`はプロセスの生存確認のみで、DB/APIの疎通成功を意味しない。Cloud MonitoringでCloud Run 5xx、Tasks滞留、Scheduler失敗、DB接続/容量を監視する。加えて以下のDB集計を監視する。

```sh
npm run ops -- status <PROJECT_ID>
```

JobのPENDING滞留・FAILED、NotificationのREVIEW_REQUIRED、Document.syncedAt、Report.statusを確認する。監視アラートは管理者向けに運用者が設定する。本MVPは管理者のメール/LINEへ独自の障害通知を自動送信しない。Cloud Billing、OpenAI利用額、LINE通数も別途監視する。

ログはイベント名と安全なエラー分類・HTTP状態のみ。原文、トークン、認証ヘッダー、SDKエラー本文、SQLを出さない。詳細調査ではDBへの管理者アクセスを使い、会話全文や接続URLを公開チケットへ貼らない。

## ジョブ再試行

外部API失敗時は取引をロールバックし、Job.attemptsと安全なlastErrorを更新。30秒から最大1時間の指数バックオフ、10回失敗でFAILED。Cloud TasksのHTTP再試行とは独立している。DispatcherがDBのPENDINGを回収するのでキュー投入失敗でもデータは残る。

原因を修正後、**通知以外**のFAILEDジョブを再投入する。

```sh
npm run ops -- retry <PROJECT_ID> <JOB_ID>
```

監査履歴を残す。Google認可切れなら管理者が再認可しSecretを更新。429なら割当/流量を確認。Googleファイルが削除・移動された場合、自動で別ファイルへ切り替えず管理者が登録ID・管理キー・共有先を確認して復旧する。Bot管理ファイル以外をレジストリへ手入力して更新しない。

同じ案件のworkerはadvisory transaction lockで直列化する。Cloud Run終了でlockは解放され、未コミットの処理は再試行できる。古い未完成週次があると後続の週次を延期し、順序逆転を防ぐ。

## LINE送信の不明状態

通知outboxはGoogle同期が成功したDB取引の中で作る。別ジョブで送信する前にUUID retry keyと初回試行時刻を永続化する。同じ通知は必ず同じkeyで再試行。409は`x-line-accepted-request-id`がある場合のみ受付済みとして扱う。これはユーザーの実閲覧・端末到達の保証ではない。

LINEのretry key有効期間24時間を超えないよう、初回試行から23時間でREVIEW_REQUIREDにして自動再送を止める。送信の成否不明な通知のkeyを新しくして再実行しない。運用者がLINE側とグループの投稿状況を確認し、既送信ならSENT、不要ならCANCELLEDとする。再送が必要なら明示承認のもと別通知として作成し、理由を監査記録する。opsのretryはnotifyを拒否する。

## Googleの冪等性と整合性

案件・フォルダ・文書に管理用appPropertiesを付け、DBとDrive検索の双方で再利用する。同名の既存ファイルを使わない。Bot自身のファイルのみ更新し、公開権限を作成しない。

DBとGoogle/LINEを跨ぐ分散トランザクションはない。Google作成直後の切断・検索反映遅延では、完全なexactly-onceを保証できない。管理キー重複を検知したら自動更新を止め、管理者が確認する。既存ファイルの削除は本Botに実装していない。Sheetsはclear→writeの間、一時的に空表示になる可能性があり、次回再試行で全行を復元する。Docsはrevision付きbatchUpdateで置換する。

## 送信取消・削除要求

LINE unsendを受けたら原文を空にし、墓標を保持する。取り消しが原文より先に届いた場合も再登録を防ぐ。privacyジョブは該当原文を根拠にした項目を保守的に削除し、過去レポートsnapshotを消し、Bot管理Docs/Sheetsを再生成する。保留中の通知も取り消す。別の根拠がある項目も削除対象になるため、必要なら原文を確認して再起票する。

管理者への削除依頼も同じ経路へ登録できる。

```sh
npm run ops -- withdraw <PROJECT_ID> <MESSAGE_ID>
```

派生出力の再生成は非同期なので即時完全消去ではない。取消と同時進行中の外部呼出、Docs変更履歴、既送信LINE、OAuthトークン所有者が複製したファイル、DBバックアップまでは自動消去できない。参加者への説明、Google変更履歴を含む削除確認、バックアップ保持期間満了、必要な追加措置を運用者が担当する。

Bot退会時はProject.enabled=falseとして新規収集・通知を停止する。再開するなら参加者合意・権限・保存方針を再確認したうえで管理者がDBを変更する。退会後は同期ジョブが止まるため、生成物の消去は管理者が別途扱う。

## 緊急停止・費用・保存期間

Scheduler停止、Tasks queue pause、DRY_RUN=trueへ切替で新規外部処理を止める。進行中の外部呼出は完了する可能性がある。漏えい時はキー失効・再発行、Google共有解除、監査記録、影響調査を行う。

保存期間は未確定のため、自動期限削除を有効にしない。運用開始前に原文・候補・監査・生成物・バックアップの各期間を決める。費用上限も未確定。予算アラートは強制上限とは限らず、停止担当・連絡先・閾値を決める。参加者への収集/外部AI解析/Google保存の説明と合意は本番前提である。
