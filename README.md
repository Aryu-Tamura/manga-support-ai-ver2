# Manga Support AI (Next.js Migration)

コミカライズ支援 Web アプリの Next.js (App Router + TypeScript) 実装です。既存の Streamlit プロトタイプを置き換える形で、編集者向けの原作解析・プロット生成・キャラクター分析などを提供します。

## 主な機能

- **原作理解**: チャンク範囲を指定して要約を生成し、出典チャンクを参照できます。
- **キャラ解析**: 登場人物のメモ生成・本文抜粋の確認が可能です。
- **プロット支援**: 要約ブロックの並べ替えやLLMによる言い換え・再構成を行い、出典チャンクを参照しながら構成案を磨けます。
- **プロジェクト管理**: Streamlit 由来の JSON データを読み込み、新規アップロードの解析・既存プロジェクトの編集/削除を行います。
- **LLM パイプライン**: アップロードした原作ファイルからチャンク・要約・キャラクター情報を自動生成（OpenAI API キーが有効な場合）。チャンク目標文字数は UI から指定でき、デフォルトは 250 文字です。

## 前提

- Node.js 18 以降
- npm または pnpm / yarn
- OpenAI API キー（`.env.local` に `OPENAI_API_KEY` を設定）
- `Streamlit/data/` に Streamlit 版の JSON 資料が存在すること

```
Streamlit/
├─ data/
│  ├─ projects_index.json
│  └─ ... (各プロジェクトの JSON)
├─ manga_support_ai/
│  └─ ...
```

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 必要に応じて生成
# .env.local 内で OPENAI_API_KEY を設定
npm run dev
```

- ブラウザ: http://localhost:3000
- サイドバーから既存プロジェクトを選択できます。
- `tmp/uploads/` にアップロードした原稿が保存され、解析結果は `Streamlit/data/<projectKey>/` に生成されます。

## 主要コマンド

| コマンド         | 説明                                  |
|------------------|---------------------------------------|
| `npm run dev`    | 開発サーバ起動                        |
| `npm run build`  | 本番ビルド（未設定の機能は今後追加）  |
| `npm run lint`   | Lint チェック                         |
| `npm run test`   | Vitest 実行（テストは今後追加予定）   |

## フォルダ構成（抜粋）

```
app/
├─ (dashboard)/projects/[projectKey]/
│  ├─ summary/       原作理解ビュー
│  ├─ characters/    キャラ解析
│  ├─ validation/    プロット支援（要約検証）
├─ (dashboard)/projects/manage/  管理タブ

components/
├─ summary/          要約ビュー用 UI
├─ characters/       キャラ解析 UI
├─ validation/       プロット支援 UI
└─ manage/           プロジェクト管理 UI

lib/
├─ projects/
│  ├─ repository.ts      Streamlit データの読み込み
│  ├─ persistence.ts     JSON 保存/削除
│  ├─ upload-pipeline.ts アップロード解析パイプライン
│  └─ relabel.ts         LLM 再ラベル処理（準備中）
├─ summary/              要約系ロジック
├─ characters/           キャラクター解析ロジック
├─ llm/                  OpenAI クライアントラッパ
├─ logging/              構造化ログ
└─ telemetry/            監査イベント（インメモリ）
```

## DoD / 今後の課題

- Undo/Redo は要約検証画面で対応済み。出典ジャンプ・差分ハイライト・自動保存は未実装。
- LLM 再ラベル（全文カット分割）は管理タブから実行可。ただしメタ情報精度やステータス表示は今後改善余地あり。
- Vitest / Playwright テスト、CI パイプラインはこれから整備予定。
- AuditLog はメモリ保持のベータ版であり、永続化は未実装。操作ログは管理タブで閲覧可能。

## ライセンス

社内利用向けのデモプロジェクトです。権利関係は元の原作データの扱いに従ってください。
