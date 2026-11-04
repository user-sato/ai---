# LINE AI書記Bot

現在のMVPは、**Google Apps Script（GAS）+ Googleスプレッドシート**です。ローカルサーバー、PostgreSQL、Cloud Runを用意せず、1つのLINEグループの会話を整理します。

```text
LINEグループ → Cloudflare Worker → GAS Web App → Google Sheets（正本）
                                                   ├ Claude/OpenAIで候補抽出・統括
                                                   ├ Google Docs / Driveへ議事録
                                                   └ LINEへ週次レポート
```

## できること

- 設定した1つの`LINE_GROUP_ID`以外からのイベントを無視
- Message IDでの重複受信防止、GASの`LockService`での同時書込み防止
- 会話から決定候補、進行方針、タスク候補、未解決課題を抽出。元発言の引用を必須化
- AI候補を`PENDING`として保存し、管理者だけがBotをメンションして`承認 <ID>`で確定
- Google Sheetsを正本にし、タスク・課題・決定の閲覧シートを自動更新
- 決定・進行方針・残課題を継続管理し、任意の統括相談へ回答
- `整理して`と`N日分整理して`で、統括提案付きMarkdownとLINE要約を作成
- Driveの月別フォルダと現況Docs、日曜20時頃JSTの週次Markdown
- 週次Markdown生成成功後にLINEへ要約とリンクを通知

## はじめ方

[GAS版の設定・デプロイ手順](gas/README.md) と[受入テスト](gas/TESTING.md)に従ってください。Googleアカウント、LINE Messaging API、Cloudflare Workers、ClaudeまたはOpenAIのAPIキーが必要です。各サービスの無料枠・送信通数・API利用には条件や費用があります。

本番相当のグループへ入れる前に、参加者へ外部保存・AI解析・Google Drive保存を説明し、合意を得てください。

Cloudflare WorkerをWebhook入口だけに置き、DBなしのままLINE署名を検証します。[採用判断](docs/17-cloudflare-workers-assessment.md)と[Worker設定](worker/README.md)を参照してください。

## 大事な制約

GAS Web AppではLINEの`x-line-signature`ヘッダーを取得できないため、Cloudflare Workerが生のWebhook本文で署名を検証します。GASでも長いランダムなWebhook URLトークンと固定グループIDを確認します。詳細とトークン漏えい時の対応は[こちら](gas/README.md#セキュリティ上の制約)です。

画像・音声・添付、過去履歴の自動取得、Google側編集の逆同期、複数グループは対象外です。送信取消後のLINE投稿・Google変更履歴・バックアップまでの完全削除も自動では保証しません。

## 以前のNode/PostgreSQL版

`src/`、`prisma/`、`infra/`以下には、先に作ったNode/PostgreSQL版が残っています。このGAS MVPでは使いません。将来、LINE署名検証や複数グループ、より確実なジョブ管理が必要になった時の移行元として保持しています。

設計上の判断と未決事項は[docs/09-decisions-and-assumptions.md](docs/09-decisions-and-assumptions.md)を参照してください。
