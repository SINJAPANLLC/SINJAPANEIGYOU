#!/bin/bash
set -e
cd /var/www/sinjapan-sales
git pull origin main
pnpm install --frozen-lockfile
# Playwright Chromiumのインストール（api-server配下のバイナリを使用）
(cd artifacts/api-server && ./node_modules/.bin/playwright install chromium --with-deps) || true
(cd lib/db && npx tsc -p tsconfig.json)
(cd lib/api-zod && npx tsc -p tsconfig.json)
(cd artifacts/api-server && pnpm run build)
(cd artifacts/sales-dashboard && NODE_ENV=production BASE_PATH=/ PORT=18816 pnpm run build)
pm2 restart sinjapan-sales-api
echo "✅ 完了"
