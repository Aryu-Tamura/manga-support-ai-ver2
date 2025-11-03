# ✅ Definition of Done（コミカライズ支援Webアプリ）

## 基本項目
- [ ] コードがビルド・型チェック・リンタ（ESLint/Prettier）を通過している
- [ ] コンポーネント単位でユニットテスト(Vitest)が成功している
- [ ] 主要ユーザーフローのE2Eテスト(Playwright)が成功している
- [ ] 機能要件を満たしている（要件定義.mdに準拠）

## UX / UI
- [ ] ローディング、エラー、空状態（EmptyState）が実装されている
- [ ] 出典（ChunkRef）クリック時に正しくソースにジャンプできる
- [ ] Undo/Redo・自動保存が動作する（該当機能のみ）
- [ ] shadcn/ui + Tailwind による統一デザインを守っている

## セキュリティ / 品質
- [ ] OPENAI_API_KEY 等の秘密情報が環境変数/Secrets.toml経由で管理されている
- [ ] XSS、CSRF、SQL Injection、権限エラー等のリスクが排除されている
- [ ] AuditLog に主要操作が正しく記録される（該当機能のみ）
- [ ] 型定義がProps・API双方で明確に定義されている（zod or Prisma）

## 非機能 / 運用
- [ ] i18n対応（日本語/英語）の拡張余地がある
- [ ] コードコメント・命名・責務分離が明確
- [ ] Gitコミットメッセージに目的と変更内容が記載されている
- [ ] CI（GitHub Actions）でビルド・テスト・Lintが自動実行される
