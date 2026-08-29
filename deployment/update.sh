#!/bin/bash
set -e
cd /var/www/sinjapan-sales
set -a
source /var/www/sinjapan-sales/.env
set +a
git pull origin main
# .env の NODE_ENV=production 下でも、ビルドに必要な開発依存（tsc/esbuild等）を入れる
pnpm install --frozen-lockfile --prod=false
# Playwright Chromiumのインストール（api-server配下のバイナリを使用）
(cd artifacts/api-server && ./node_modules/.bin/playwright install chromium --with-deps) || true
(cd lib/db && pnpm exec tsc -p tsconfig.json)
(cd lib/api-zod && pnpm exec tsc -p tsconfig.json)
(cd lib/db && pnpm run migrate)
(cd artifacts/api-server && pnpm run build)
(cd artifacts/sales-dashboard && NODE_ENV=production BASE_PATH=/ PORT=18816 pnpm run build)
pm2 restart sinjapan-sales-api --update-env
echo "✅ 完了"
