# LINE AI書記Bot

現在のMVPは、**Google Apps Script（GAS）+ Googleスプレッドシート**です。ローカルサーバー、PostgreSQL、Cloud Runを用意せず、1つのLINEグループの会話を整理します。

```text
LINEグループ → GAS Web App → Google Sheets（正本）
                               ├ OpenAIで候補抽出
                               ├ Google Docs / Driveへ議事録
                               └ LINEへ週次レポート
```

## できること

- 設定した1つの`LINE_GROUP_ID`以外からのイベントを無視
- Message IDでの重複受信防止、GASの`LockService`での同時書込み防止
- 会話から決定候補、タスク候補、未解決課題を抽出。元発言の引用を必須化
- AI候補を`PENDING`として保存し、管理者だけが`/bot 承認 <ID>`で確定
- Google Sheetsを正本にし、タスク・課題・決定の閲覧シートを自動更新
- Driveの月別フォルダと現況Docs、日曜20時頃JSTの週次Docs
- 週次Docs生成成功後にLINEへリンクを通知

## はじめ方

[GAS版の設定・デプロイ手順](gas/README.md) と[受入テスト](gas/TESTING.md)に従ってください。Googleアカウント、LINE Messaging API、OpenAI APIキーは必要です。GASやGoogle Sheets自体は小規模利用なら無料枠で始められますが、OpenAI APIとLINEの送信通数には利用条件・費用があります。

本番相当のグループへ入れる前に、参加者へ外部保存・AI解析・Google Drive保存を説明し、合意を得てください。

## 大事な制約

GAS Web AppではLINEの`x-line-signature`ヘッダーを取得できないため、LINE署名検証はできません。このMVPでは、長いランダムなWebhook URLトークンと固定グループIDで受信範囲を狭めます。これは署名検証と同等ではありません。詳細とトークン漏えい時の対応は[こちら](gas/README.md#セキュリティ上の制約)です。

画像・音声・添付、過去履歴の自動取得、Google側編集の逆同期、複数グループは対象外です。送信取消後のLINE投稿・Google変更履歴・バックアップまでの完全削除も自動では保証しません。

## 以前のNode/PostgreSQL版

`src/`、`prisma/`、`infra/`以下には、先に作ったNode/PostgreSQL版が残っています。このGAS MVPでは使いません。将来、LINE署名検証や複数グループ、より確実なジョブ管理が必要になった時の移行元として保持しています。

設計上の判断と未決事項は[docs/09-decisions-and-assumptions.md](docs/09-decisions-and-assumptions.md)を参照してください。
