# keyword-volume-tool

Google検索のキーワード需要を、地域・言語別に調査・比較するWebツール。

## 主な機能

- 複数キーワードを一括検索
- Google Ads API の平均月間検索数を取得
- 過去12か月の月別推移を表示
- 地域候補を検索して絞り込み
- 日本語 / 英語 / 全言語の切り替え
- 広告競合度・入札単価の目安を表示
- CSV出力
- iPhone / Desktop対応

## 構成

```text
GitHub Pages (UI)
        ↓
Vercel Functions (秘密情報を保持)
        ↓
Google Ads API v25
```

OAuth client secret / refresh token などの秘密情報はブラウザやGitHub Pagesには置かない。

初回設定は [SETUP.md](./SETUP.md) を参照。

公開画面: https://gakkii415.github.io/keyword-volume-tool/
