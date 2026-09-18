# 初回セットアップ

このツールは、公開画面を GitHub Pages、秘密情報を扱う API を Vercel Functions で動かす構成です。

## 1. Google Ads API 用の Google Cloud プロジェクトを用意

Google Ads API を利用できる Google Cloud プロジェクトを使います。2026-09-09 以降、API のアクセスレベルは Google Cloud プロジェクトに紐づきます。

公式: https://developers.google.com/google-ads/api/docs/oauth/cloud-project

## 2. OAuth 2.0 認証情報を作る

同じ Google Cloud プロジェクトで OAuth クライアントを作り、Google Ads API のスコープを許可します。

スコープ:

```text
https://www.googleapis.com/auth/adwords
```

このツールは自分用なので、Google Ads API の single-user authentication または OAuth 2.0 Playground を使って refresh token を取得すれば十分です。

公式: https://developers.google.com/google-ads/api/docs/oauth/overview

必要になる値:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`（ハイフンなし）

MCC 経由でクライアントアカウントを操作する場合のみ:

- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`（MCC の顧客 ID、ハイフンなし）

2026-09-09 に developer token は廃止され、アクセスレベルは Cloud project 側が正本になりました。既存環境との互換用に developer token を持っている場合だけ、次を設定できます。

- `GOOGLE_ADS_DEVELOPER_TOKEN`（任意）

## 3. Vercel にこのリポジトリをデプロイ

GitHub の `keyword-volume-tool` を Vercel に Import します。Framework Preset は `Other` で構いません。

Environment Variables に次を設定します。

```text
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=1234567890
APP_ACCESS_TOKEN=自分だけが知る十分に長いランダム文字列
ALLOWED_ORIGINS=https://gakkii415.github.io
```

MCC を使う場合:

```text
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
```

必要なら API バージョンを固定できます。未指定では `v25` です。

```text
GOOGLE_ADS_API_VERSION=v25
```

`APP_ACCESS_TOKEN` は API の無断利用を防ぐため推奨です。GitHub にコミットせず、Vercel の Environment Variables だけに保存します。

## 4. 画面から接続

GitHub Pages:

```text
https://gakkii415.github.io/keyword-volume-tool/
```

API URL は本番 Vercel API の

```text
https://keyword-volume-tool-test11-9b33.vercel.app
```

が既定値として入っています。

`APP_ACCESS_TOKEN` を設定した場合だけ、右上の「接続設定」を開き、アクセスキーに同じ値を入力して「接続確認」を押します。

「Google Ads API 接続済み」になれば完了です。

API URL とアクセスキーの上書き値はブラウザの `localStorage` にだけ保存され、GitHub リポジトリには保存されません。

## 取得できるデータ

- 過去12か月の平均月間検索数
- 月ごとの概算検索数
- 広告競合レベル / 競合指数
- 上部掲載入札単価の目安
- Google Ads が近似語としてまとめた close variants
- 地域指定（Google Ads の geo target）
- 言語指定

検索数は Google Ads Keyword Planner 相当の概算値です。Google が近似語を統合するため、入力したキーワード数と返却される行数が一致しない場合があります。
