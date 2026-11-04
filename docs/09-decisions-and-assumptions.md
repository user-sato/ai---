# 09 確定した設計判断と未決事項

## 確定事項

| 項目 | 現行判断 |
|---|---|
| 構成 | Cloudflare Worker + GAS + Google Sheets。DB・ローカルサーバー不要 |
| 対象 | 固定した1つのLINEグループ。個人トークと他グループは無視 |
| 正本 | `Messages`、`Items`、`Reports`、`SummaryRequests` |
| AI | `AI_PROVIDER`でClaudeまたはOpenAIを選択 |
| 自動解析 | 5分ごと。`signal_only`では雑談をAIへ送らない |
| メンションAI依頼 | グループ全体で1日20回 |
| 期間整理 | 1〜31日。`整理して`は直近12時間 |
| AI入力 | 会話・依頼・管理事項を含むJSON本文60,000文字まで |
| 導入前496件 | 保存する。週次からは除外し、メンションによる期間整理・統括相談には含める。最初のLINE受信以降の時間帯は受信発言を正とし履歴を使わない |
| 週次 | 日曜20時頃JST。週次MarkdownをDriveへ作りLINEチャットへURL投稿 |
| 空週 | AIを呼ばず「新しい動きなし」のMarkdownを投稿 |
| LINEノート | Messaging API非対応のため使わず、チャットへ投稿 |
| 承認 | 決定・進行方針・タスクは人の承認まで`PENDING` |

## 週次境界

週次キーは日曜20時JSTの締切日で作る。基本期間は直前7日間の`[start, end)`である。Webhook遅延などで古い未報告発言が届いた場合は、欠落防止のため次回週次へ含める。AI生成対象のMessage IDを保存し、再試行中の新着を保存済みAI結果へ混ぜない。

## 現行MVPで扱わないもの

- 複数グループ、画像・音声・添付内容の解析。
- LINEノートへの投稿、Google側編集の逆同期。
- 月次まとめの自動生成。
- Node/PostgreSQL版のCloud Run、Cloud Tasks、Cloud Scheduler運用。

## 運用者が決める事項

- 原文・生成物を保持する期間と削除手順。
- Bot専用Driveフォルダの閲覧者。
- AI・LINE・Google・Cloudflareの費用監視方法。
- 本番相当グループへ導入する際の参加者説明と同意。
