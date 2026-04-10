#!/bin/bash
# ======================================================
# SIN JAPAN 営業自動化ダッシュボード - VPSデプロイスクリプト
# 実行: bash /var/www/sinjapan-sales/deployment/deploy.sh
# ======================================================
set -e

APP_DIR="/var/www/sinjapan-sales"
API_PORT=6050
DOMAIN="sinjapan-sales.site"
GITHUB_REPO="https://github.com/SINJAPANLLC/SINJAPANEIGYOU.git"

echo "============================================"
echo "  ポート競合チェック (使用中ポート)"
echo "============================================"
USED_PORTS=$(ss -tlnp | grep LISTEN | awk '{print $4}' | cut -d: -f2 | sort -n | uniq)
echo "使用中: $(echo $USED_PORTS | tr '\n' ' ')"
echo ""

if echo "$USED_PORTS" | grep -qx "${API_PORT}"; then
  echo "⛔  ポート ${API_PORT} はすでに使用中です！"
  echo "    別のポートを選んで API_PORT を変更してください"
  echo "    空きポート例: 6051, 6052, 6100"
  exit 1
fi
echo "✓  ポート ${API_PORT} は使用可能です"

echo ""
echo "============================================"
echo "  Node.js / pnpm / PM2 確認"
echo "============================================"
node --version || { echo "❌ Node.jsをインストールしてください"; exit 1; }
pnpm --version 2>/dev/null || { echo "pnpmをインストール中..."; npm install -g pnpm; }
pm2 --version   2>/dev/null || { echo "PM2をインストール中...";   npm install -g pm2; }

echo ""
echo "============================================"
echo "  リポジトリ クローン / 更新"
echo "============================================"
mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "既存リポジトリを最新に更新..."
  cd "$APP_DIR" && git pull origin main
else
  git clone "$GITHUB_REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo ""
echo "============================================"
echo "  .env ファイル確認"
echo "============================================"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚠️  .env が存在しません。テンプレートを作成します..."
  cat > "$APP_DIR/.env" << ENVEOF
NODE_ENV=production
PORT=${API_PORT}
APP_URL=https://${DOMAIN}

# ↓ 以下は正しい値に変更してください
NEON_DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-xxx
SMTP_USER=info@sinjapan-sales.site
SMTP_PASS=YOUR_SMTP_PASSWORD
SESSION_SECRET=$(openssl rand -hex 32)
ENVEOF
  echo ""
  echo "📝 作成: $APP_DIR/.env"
  echo "   NEON_DATABASE_URL / OPENAI_API_KEY / SMTP_PASS を編集してください:"
  echo "   nano $APP_DIR/.env"
  echo ""
  echo "   編集後に再実行: bash $APP_DIR/deployment/deploy.sh"
  exit 1
fi

# PORT を API_PORT に同期
sed -i "s/^PORT=.*/PORT=${API_PORT}/" "$APP_DIR/.env"
echo "✓  .env の PORT = ${API_PORT} を確認"

echo ""
echo "============================================"
echo "  依存関係インストール"
echo "============================================"
pnpm install --frozen-lockfile

echo ""
echo "============================================"
echo "  ライブラリ型定義ビルド"
echo "============================================"
(cd "$APP_DIR/lib/db"      && npx tsc -p tsconfig.json && echo "  ✓ @workspace/db")
(cd "$APP_DIR/lib/api-zod" && npx tsc -p tsconfig.json && echo "  ✓ @workspace/api-zod")

echo ""
echo "============================================"
echo "  APIサーバービルド"
echo "============================================"
(cd "$APP_DIR/artifacts/api-server" && pnpm run build)
echo "✓  dist/index.mjs 生成完了"

echo ""
echo "============================================"
echo "  フロントエンドビルド"
echo "============================================"
(cd "$APP_DIR/artifacts/sales-dashboard" && NODE_ENV=production BASE_PATH=/ PORT=18816 pnpm run build)
echo "✓  静的ファイル: $APP_DIR/artifacts/sales-dashboard/dist/public/"

echo ""
echo "============================================"
echo "  PM2 起動"
echo "============================================"
mkdir -p /var/log/pm2

# ecosystem.config の PORT を更新
sed -i "s/\"PORT\": \"[0-9]*\"/\"PORT\": \"${API_PORT}\"/" "$APP_DIR/deployment/ecosystem.config.cjs"

# 既存プロセスを停止
pm2 delete sinjapan-sales-api 2>/dev/null || true

# .env を読み込んでPM2に渡す
set -a
# shellcheck source=/dev/null
source "$APP_DIR/.env"
set +a

pm2 start "$APP_DIR/deployment/ecosystem.config.cjs"
pm2 save
echo "✓  PM2 起動完了"

echo ""
echo "============================================"
echo "  nginx 設定"
echo "============================================"
echo ""
echo "1. 設定ファイルをコピー:"
echo "   cp $APP_DIR/deployment/nginx.conf /etc/nginx/sites-available/sinjapan-sales"
echo ""
echo "2. 有効化 & リロード:"
echo "   ln -sf /etc/nginx/sites-available/sinjapan-sales /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "3. SSL証明書 (Let's Encrypt):"
echo "   certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
echo ""
echo "============================================"
echo "  ✅ デプロイ完了！"
echo "============================================"
pm2 status sinjapan-sales-api
echo ""
echo "動作確認: curl -I http://127.0.0.1:${API_PORT}/api/health"
