# WikiGuesser

Gemini のプロトタイプをベースに、Wikipedia のランダム記事を当てるカードゲームを React（CRA）+ Tailwind CSS で再構築しています。虫食いタイトルやヒントカードの挙動、全体の UI をオリジナルと同じテイストで再現しました。

## 必要要件

- Node.js 18 以上（LTS 推奨）
- npm もしくは互換パッケージマネージャ

## セットアップ

```bash
npm install
npm start
```

`npm start` で `http://localhost:3000` が立ち上がり、ローカルでプレイできます。

## ビルド

```bash
npm run build
```

`build/` 以下に静的ファイルが出力され、そのまま GitHub Pages などのホスティングへ配置できます。

## GitHub Pages へのデプロイ手順

1. `package.json` の `homepage` を本番 URL（例: `https://<ユーザー名>.github.io/<リポジトリ名>`）に変更
2. リポジトリを GitHub に push
3. `npm run deploy`（=`gh-pages -d build`）を実行して `gh-pages` ブランチへ公開
4. GitHub Pages の配信元を `gh-pages` ブランチに設定

## 実装メモ

- Wikipedia API を直接 `fetch` し、`origin=*` を付与して CORS を解決しています。バックエンドは不要です。
- Tailwind CSS をベースにしつつ、`src/index.css` で `line-clamp-3` やセクション表示用のスクロールコンテナなどの補助クラスを定義しています。
- ヒントカードは利用可能な情報のみを組み合わせ、足りないときは 5 枚未満でも配布します。セクションヒントは HTML をそのままスクロール表示するため、表やリストも崩れません。
- 初期画面とヘッダー下にジャンル選択 UI（チェックボックス）を設置し、歴史・科学・スポーツ・日本のテレビアニメなど複数のカテゴリを組み合わせて記事を絞り込めます。
- `npm run deploy` は `gh-pages` パッケージを利用します。初回だけ GitHub の認証を求められる場合があります。
