# 07 セキュリティ・運用原則

## 認証情報

- Worker Secret：`LINE_CHANNEL_SECRET`、token付き`GAS_WEBHOOK_URL`。
- GAS Script Properties：LINEアクセストークン、AI APIキー、Google ID、固定group ID等。
- 認証情報をソース、スプレッドシート、Markdown、ログへ出さない。

## 受信防御

1. WorkerがLINE署名をraw bodyで検証する。
2. GASが32文字以上の`WEBHOOK_TOKEN`と固定`LINE_GROUP_ID`を再確認する。
3. Message IDと`LockService`で再送・同時受信を重複排除する。
4. WorkerはGASの最終本文が`OK`の場合だけLINEへ200を返す。

## AIとデータ

- 会話本文を命令ではなく記録データとして扱い、本文中のURLや指示を実行しない。
- AI出力は候補として保存し、根拠を検証する。未承認候補を確定事項へ混ぜない。
- 担当者、期限、金額を推測して確定しない。
- 整理・統括では発言者を仮名にしてAIへ渡し、LINE userIdと履歴の表示名は送らない。`SPEAKER_ALIASES`に登録した名前は本文中も置き換える。候補抽出は原文照合のため本文を置き換えない。
- 導入前履歴は取り込み時にAIへ送らず、週次から除外する。メンションによる期間整理・統括相談を依頼された場合だけ、対象期間の履歴をAIへ送る。

## 共有・削除

- Driveファイルを自動公開しない。閲覧者は親フォルダの共有設定で管理する。
- LINE送信取消、Google変更履歴、複製、バックアップまでの完全自動削除は保証しない。
- Bot管理外ファイルの削除・上書きは行わない。

## 障害対応

- メンション依頼と週次の一時失敗は、同じ保存済みAI結果とLINE retry keyで最大3回再試行する。通常メッセージのAI抽出は`NEW`へ戻して次回処理で再試行し、現行実装では上限を設けない。
- 週次最終失敗は機密を含まない固定文でグループへ通知する。
- 詳細は`Reports`、`SummaryRequests`、Apps Script実行履歴、Cloudflareログで確認する。
- token漏えい時はScript PropertyとWorker SecretのGAS URLを同時に更新する。

実機確認は[`gas/REAL_DEVICE_TEST.md`](../gas/REAL_DEVICE_TEST.md)、更新は[`gas/REDEPLOY.md`](../gas/REDEPLOY.md)を使う。
