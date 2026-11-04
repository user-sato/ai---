# GASの更新デプロイ手順

`Code.gs`や`appsscript.json`を変更した時は、既存のウェブアプリを新しいバージョンへ更新する。**新しいデプロイを作らなければ、GASのURLは変わらない。**そのためCloudflare Workerの`GAS_WEBHOOK_URL`も変更不要である。

## 更新手順

1. Apps Scriptエディタで、最新の`Code.gs`を全置換して保存する。`appsscript.json`に変更がある場合だけ、そちらも置換する。
2. 関数選択から`setupProject`を実行する。`SummaryRequests`シート、`Reports`の追加列、週次自動処理の開始マーカーが作成される。既存データは削除しない。
3. 必要な手動移行関数がある場合だけ実行する。今回の履歴移行済み環境では`excludeHistoricalMessagesFromWeeklyReports`を一度実行済みであれば不要。
4. **デプロイ** → **デプロイを管理** を開く。
5. 現在のウェブアプリの編集アイコンを押す。
6. 「バージョン」を**新しいバージョン**へ変更し、**デプロイ**を押す。
7. 表示されたURLが従来の`/exec` URLと同じであることを確認する。
8. `runPreflightCheck`を実行し、`status: OK`を確認する。この関数はLINE送信・AI API呼出をしない。
9. スプレッドシートの`Messages`で、導入前の496行の`Report Key`がすべて`HISTORICAL`であることを確認する。空欄があれば`excludeHistoricalMessagesFromWeeklyReports`を一度実行し、再確認する。

## Workerも更新する場合

`worker/src/index.mjs`を変更した時だけ、Cloudflare Workerの編集画面でコードを置換して**Deploy**する。GASコードだけの更新では不要。

## URLが変わった場合

「新しいデプロイ」を作成して別の`/exec` URLになった場合だけ、Cloudflare Workerの`GAS_WEBHOOK_URL` Secretを新URLへ更新し、Workerを再デプロイする。LINE DevelopersのWebhook URLはWorker URLのままでよい。
