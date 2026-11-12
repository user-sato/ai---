# 20 sozoshaリポジトリへの週次Issue作成

決定日: 2026-11-12 JST（利用者と合意）

## 決定

週次レポートの「方針まとめ」を、記録リポジトリ`developerKondo/sozosha`の書き方に直した取り込み候補として、GitHub Issueを1件作る。sozosha側は既存の運用（Claudeが章へ反映し、`Closes #N`のPRで閉じる）で取り込む。

## 理由

- 書記Botの資料を人がsozoshaの書き方（行ごとの`#未決`・`#ToDo`・`#予定`、担当タグ）へ書き直す手間をなくすため。
- sozoshaは情報管理ページからの新しい情報をIssueで受け取る運用であり、Issueにすれば既存の流れに乗る。
- 方法は「資料に貼り付け用の節を足す」「別コマンドで出す」「Issueを直接作る」から、利用者が直接作る方式を選んだ。

## 範囲と制約

- Issueを作るのは日曜の週次レポートだけ。メンションによる整理・統括相談では作らない。
- 週次レポートのLINE送信が済んだ後、5分処理で作る。週次本体とは独立させ、失敗してもLINE通知に影響させない。
- 会話で合意できたことはタグなしの文、決まっていない論点は`#未決`、やることは`#ToDo`、予定は日付付き`#予定`とする。担当タグは会話の流れから読み取れれば付ける。sozoshaでは`#未決`のない行は決定だが、Issueを章へ取り込むPRを近藤がマージする時点で人が確認するため、書記Botの「人の承認なしに決定扱いしない」原則と矛盾しない（2026-11-12 利用者と合意。当初案の「全行`#未決`・本人明言時だけ担当」から変更）。書き方に合わない行は捨てる。
- LINE原文は入れない。整理した行と根拠の発言IDだけを入れる。
- 設定を初めて検出した時刻より前に締め切った週次は対象外（過去分をまとめて送らない）。候補が0件の週は作らない。`@`は全角にして通知を避ける。
- GitHubにはLINEのretry keyのような冪等キーがない。そのため送信前に`CREATING`を記録し、通信例外、5xx、201とIssue URLを確認できない2xxは作成済みか分からないとして自動で作り直さない（管理者が確認する）。4xx・AI・検証の失敗は作成されていないため最大3回再試行する。
- トークンはsozoshaのIssue作成だけを許すfine-grainedトークンとし、Script Propertiesだけに置く。トークンと送信先がそろうまでIssueを作らない（初期状態では外部送信しない）。

## 未決

- GitHubトークンの発行元（近藤個人かBot用アカウントか）。
- fine-grainedトークンに必要な権限の公式確認。Create an issueの頁（2026-11-12確認）には`POST /repos/{owner}/{repo}/issues`、必須は`title`、成功は201で`html_url`を返す、`X-GitHub-Api-Version: 2026-03-10`と記載があるが、fine-grainedトークンの必要権限の記載は見つからなかった。発行時に「Issues: Read and write」で作成できるか確認する。

## 参照した公式資料

- [GitHub REST API: Create an issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)
- [GitHub: fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
