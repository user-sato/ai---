# Codex 実装指示（最優先）

このリポジトリはLINEグループのAI書記Bot。現在のMVPはCloudflare Worker + `gas/`のGoogle Apps Script + Googleスプレッドシート版で、`README.md`と`gas/README.md`が実行・設定手順である。`src/`、`prisma/`、`infra/`は将来のNode/PostgreSQL移行用に保持する旧実装であり、GAS MVPの実行対象ではない。資料の区分は`docs/README.md`を参照する。

## 必須原則
- AIは書記・管理役。会話から決定候補、タスク候補、未決事項を抽出するが、勝手に意思決定・担当者確定をしない。
- GAS MVPではGoogleスプレッドシートを正本とし、Google Docsの現況書とDrive上の週次・日次Markdownは読み取り用の生成物。Googleから正本への逆同期は対象外。
- Google DriveはBot専用親フォルダ→年→月。常設の現況書は親フォルダ直下、タスク一覧は正本スプレッドシート内の閲覧用タブに置く。
- GAS Web AppはLINE署名ヘッダーを取得できないため、Cloudflare Workerがraw bodyで署名検証し、GASが固定グループID、32文字以上のWebhook URLトークン、Message ID重複を確認する。WorkerはGASの最終本文が`OK`の場合だけLINEへ2xxを返す。
- AIの抽出結果はスキーマ検証と根拠メッセージ照合を行う。未承認の候補を確定事項として報告しない。
- 定期実行は無人。週次Markdown保存が成功してからLINEへURL通知する。
- 認証情報・個人情報をコミット、平文ログ、公開URLに流さない。GAS用キーはScript Properties、Worker用キーはWorker Secretにだけ置く。初期状態では外部送信・課金処理を実行しない。
- 実サービスの設定値が未提供ならモック・テスト・セットアップ手順まで実装し、実環境接続はブロック事項として明記する。

## 実装の進め方
1. 現行GAS MVPの変更は`gas/Code.gs`、`docs/01`〜`07`、`docs/09`、`docs/16`〜`19`と整合させ、必要なテストを追加する。`docs/08`、`docs/10`〜`14`は旧Node/PostgreSQL版の参考資料である。
2. GAS V8、SpreadsheetApp、DocumentApp、DriveApp、UrlFetchApp、LockService、Script Propertiesを基本とする。技術的に変更が必要なら理由をADRに記録する。
3. Script Propertiesの実キーを作成・推測・出力しない。
4. `gas/`と設定手順を整備する。実スプレッドシートやDriveの変更は、利用者の明示的な設定・接続指示後だけ行う。
5. 未決事項は `docs/09-decisions-and-assumptions.md` の暫定値を採用し、ユーザーの判断が必要なものは明示する。
6. APIやSDKの最新仕様を実装時に公式資料で確認する。利用できない場合は確認待ちとして記録する。
7. まずは本番への自動投稿なしで、静的検査・設定手順・専用テストグループでの受入手順を整備する。

## 受入条件
固定外グループの無視、同じMessage IDの重複排除、LockServiceでの直列化、根拠付き候補、管理者承認、週次の作成前後状態、失敗時の再試行、秘密情報を出さないことを確認する。READMEにセットアップ、手動で必要な認証設定、GASの署名検証制約、未実装項目を記載する。
