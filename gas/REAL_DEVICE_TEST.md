# 実機テスト手順

この手順は、実際のLINEグループへ接続する前提の手動テストです。Botはテスト専用グループで試す。

## 1. 事前設定（LINE・AIへの送信なし）

1. 最新の`Code.gs`をApps Scriptへ全置換して保存する。
2. Script Propertiesに、既に設定した3つのGoogle ID、`WEBHOOK_TOKEN`、`GROUP_ENROLLMENT_CODE`に加え、以下を設定する。

   ```text
   AI_PROVIDER=anthropic
   AI_API_KEY=<Claude APIキー>
   AI_MODEL=<Anthropic Consoleで利用できるモデル名>
   AI_ANALYSIS_MODE=signal_only
   HISTORICAL_IMPORT_MODE=record_only
   LINE_CHANNEL_ACCESS_TOKEN=<LINE Messaging APIのチャネルアクセストークン>
   ```

3. Apps Scriptエディタで`runPreflightCheck`を実行する。実行ログまたは戻り値が`status: OK`で、Driveフォルダ名と`WAITING_FOR_ENROLLMENT`が確認できれば合格。この関数はLINE送信・AI API呼出をしない。
4. `setupProject`を実行し、`Messages`、`Items`、`Reports`、`Tasks`、`Issues`、`Decisions`、`SummaryRequests`シートができることを確認する。
5. `importHistoricalTranscript`を実行する。標準設定では履歴は`RECORDED`になり、Claude APIを呼ばない。

## 2. LINE接続

1. `installTriggers`を一度実行する。
2. ウェブアプリとして新しいデプロイを作成する。実行ユーザーは自分、アクセスはLINEから到達できる設定にする。
3. [Cloudflare Worker gateway](../worker/README.md)をデプロイし、`LINE_CHANNEL_SECRET`と次のGAS URLをWorker Secretに設定する。

   ```text
   https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?webhook_token=<WEBHOOK_TOKEN>
   ```

4. LINE DevelopersのWebhook URLにはGAS URLではなくWorker URLを設定し、検証成功後にWebhookを有効にする。
5. Botをテストグループへ招待し、次を一度だけ送る。

   ```text
   @Bot
   初期化 <GROUP_ENROLLMENT_CODE>
   ```

   「このグループをAI書記Botの対象として登録しました。」と返信され、`LINE_GROUP_ID`が自動保存されれば合格。
6. 次を送る。

   ```text
   @Bot
   状態
   ```

   BotがAI提供元・モード・記録済み発言数を返信すれば、Webhook、固定グループ判定、LINE返信が合格。

## 3. AIを使わない確認

テストグループで「了解です」「ありがとう」のような雑談を送る。5分後に`Messages`へ`RECORDED`で記録され、AI APIを呼ばないことを、Apps Scriptの実行履歴とAI提供元の利用状況で確認する。

## 4. AI候補抽出の確認

別途、次のような発言を送る。

```text
次回の打合せまでに、候補物件を確認して共有します。予算の上限は次回までに検討が必要です。
```

5分待つか、Apps Scriptから`processPendingMessages`を一度実行する。`Messages`が`ANALYZED`になり、`Items`へ候補が`PENDING`で入ることを確認する。候補はまだ確定事項ではない。

## 5. 承認・重複・週次

1. `Items`の候補IDに対してBotをメンションし`承認 <ID>`を送る。決定なら`CONFIRMED`、進行方針なら`ACTIVE`、タスク・課題なら`OPEN`になることを確認する。
2. 同じメッセージをLINE側で再送できる状況があれば、`Messages`のMessage IDが重複しないことを確認する。
3. テスト時は`createWeeklyReport`をApps Scriptから手動実行する。対象期間、Markdown URL、LINE通知が1回だけ記録されることを確認する。これは実際にテストグループへ週次通知を送る。

## 6. 整理・統括機能

1. Botを文頭でメンションし、次の行に`使い方`と送る。操作一覧に`整理して`、期間整理、`進行方針`が表示される。
2. 同様に`整理して`と送る。受付返信後、次の5分処理で直近12時間の整理・統括コメント・Drive URLがグループへ投稿され、`日次レポート`フォルダにMarkdownがある。
3. `3日分整理して`を送り、導入前の496件が結果へ含まれないことを確認する。
4. `今の状況から、次に優先することを考えて`のような任意文を送り、既存の決定・進行方針・残課題を踏まえた回答とMarkdownが作られることを確認する。
5. `32日分整理して`を送り、AI APIを呼ばず1〜31日の制限が返ることを確認する。
