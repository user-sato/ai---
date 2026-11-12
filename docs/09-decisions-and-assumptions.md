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
| 統括入力 | 発言者は本名（名前表`SPEAKER_ALIASES`、表にない履歴は表示名、表にないuserIdは未登録の参加者A…）、日時は日本時間。`PROJECT_CONTEXT`で背景を渡す |
| sozosha連携 | 週次レポートだけ取り込み候補Issueを作る。判断は[`docs/20`](20-sozosha-issue-decision.md) |
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

## 残タスク

2026-11-12 に方針を決め、コードは実装済み。次が残っている。

- **名前表の中身を設定する**：どのuserIdが誰かを利用者から受け取り、`SPEAKER_ALIASES`（`userId=本名`、`表示名=本名`）をScript Propertiesに設定する。設定までは表にないuserIdが「未登録の参加者A」…になる。
- **GitHubトークンの発行元を決めて設定する**：近藤個人かBot用アカウントか未決。sozoshaのIssue作成だけを許すfine-grainedトークンを発行し、`SOZOSHA_GITHUB_TOKEN`と`SOZOSHA_GITHUB_REPO`を設定する。設定までは週次Issueを作らない。
- **実機で確認する**：週次Issueの内容がsozoshaの`共有ページ/check.mjs`の書き方に合うか、sozosha側の反映運用（`Closes #N`のPR）に乗るか。
